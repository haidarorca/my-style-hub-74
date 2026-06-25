-- ============================================================
-- Migration : Système de gestion des retours — KawZone ERP
-- Phase 0 : Schéma de données (tables + enums + vue + RLS)
-- ============================================================
-- Date : 2026-06-25
-- Auteur : Architecture KawZone
-- Principe : Extension du SAV existant, jamais modification
-- ============================================================

-- ============================================================
-- 1. EXTENSION DES ENUMS EXISTANTS
-- ============================================================

-- 1.1 sav_fee_kind — Ajout des types de frais manquants
-- Justification : Le système existant gère 7 types de frais.
-- Les retours impliquent des coûts supplémentaires (inspection,
-- destruction, pesée, etc.) qui doivent être tracés indépendamment.
-- On ajoute les types manquants sans toucher aux existants.

ALTER TYPE sav_fee_kind ADD VALUE IF NOT EXISTS 'inspection';
ALTER TYPE sav_fee_kind ADD VALUE IF NOT EXISTS 'destruction';
ALTER TYPE sav_fee_kind ADD VALUE IF NOT EXISTS 're_shipment';
ALTER TYPE sav_fee_kind ADD VALUE IF NOT EXISTS 'weighing';
ALTER TYPE sav_fee_kind ADD VALUE IF NOT EXISTS 'storage';
ALTER TYPE sav_fee_kind ADD VALUE IF NOT EXISTS 'customs_return';
ALTER TYPE sav_fee_kind ADD VALUE IF NOT EXISTS 'insurance_claim';
ALTER TYPE sav_fee_kind ADD VALUE IF NOT EXISTS 'photo_documentation';
ALTER TYPE sav_fee_kind ADD VALUE IF NOT EXISTS 'labor';

-- 1.2 sav_problem_type — Ajout des causes de retour
-- Justification : Les causes existantes sont generiques (stock_break,
-- dispute...). Les retours ont des causes specifiques qui influencent
-- la repartition des couts (qui paie quoi).

ALTER TYPE sav_problem_type ADD VALUE IF NOT EXISTS 'customer_changed_mind';
ALTER TYPE sav_problem_type ADD VALUE IF NOT EXISTS 'defective_product';
ALTER TYPE sav_problem_type ADD VALUE IF NOT EXISTS 'vendor_error';
ALTER TYPE sav_problem_type ADD VALUE IF NOT EXISTS 'kawzone_error';
ALTER TYPE sav_problem_type ADD VALUE IF NOT EXISTS 'shipping_damage';

-- 1.3 sav_action_type — Ajout des actions du workflow retour
-- Justification : Le workflow retour a des etapes specifiques
-- (demande, etiquetage, reception, inspection, decision, execution)
-- qui doivent etre tracees dans sav_actions.

ALTER TYPE sav_action_type ADD VALUE IF NOT EXISTS 'return_requested';
ALTER TYPE sav_action_type ADD VALUE IF NOT EXISTS 'return_accepted';
ALTER TYPE sav_action_type ADD VALUE IF NOT EXISTS 'return_refused';
ALTER TYPE sav_action_type ADD VALUE IF NOT EXISTS 'label_generated';
ALTER TYPE sav_action_type ADD VALUE IF NOT EXISTS 'product_received';
ALTER TYPE sav_action_type ADD VALUE IF NOT EXISTS 'inspection_done';
ALTER TYPE sav_action_type ADD VALUE IF NOT EXISTS 'restocking_done';
ALTER TYPE sav_action_type ADD VALUE IF NOT EXISTS 'supplier_return_initiated';
ALTER TYPE sav_action_type ADD VALUE IF NOT EXISTS 'supplier_return_confirmed';
ALTER TYPE sav_action_type ADD VALUE IF NOT EXISTS 'destruction_done';
ALTER TYPE sav_action_type ADD VALUE IF NOT EXISTS 're_shipment_done';
ALTER TYPE sav_action_type ADD VALUE IF NOT EXISTS 'balance_calculated';
ALTER TYPE sav_action_type ADD VALUE IF NOT EXISTS 'disposition_decided';

-- ============================================================
-- 2. NOUVELLE TABLE : return_shipments
-- ============================================================
-- Justification : Le SAV existe mais n'a AUCUNE traçabilite
-- logistique. Quand un client renvoie un colis, on ne sait pas
-- ou il est, qui le transporte, quand il arrive.
-- Cette table trace chaque trajet (client→KawZone, KawZone→fournisseur,
-- etc.) avec tracking, dates, et etat du colis.

CREATE TABLE IF NOT EXISTS return_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES sav_cases(id) ON DELETE CASCADE,

  -- Type de trajet (legs du retour)
  -- Justification : Un retour peut avoir plusieurs trajets :
  -- client→KawZone (retour), KawZone→fournisseur (retour fournisseur),
  -- KawZone→stock (reconditionnement), KawZone→destruction
  leg_type text NOT NULL CHECK (leg_type IN (
    'client_to_kawzone',      -- Retour client vers KawZone
    'kawzone_to_supplier',    -- Retour KawZone vers fournisseur
    'kawzone_to_stock',       -- Transfert vers stock reconditionne
    'kawzone_to_destruction', -- Transfert vers destruction
    'kawzone_to_client'       -- Re-expedition vers client (echange)
  )),

  -- Transporteur
  carrier_name text,
  tracking_number text,
  tracking_url text,

  -- Dates du trajet
  shipped_at timestamptz,
  expected_at timestamptz,
  received_at timestamptz,

  -- Etat du colis a reception
  -- Justification : Le colis peut arriver en bon etat, endommage,
  -- incomplet, ou detruit. Cela influence la decision d'inspection.
  received_condition text CHECK (received_condition IN (
    'not_received', 'perfect', 'good', 'damaged', 'destroyed', 'incomplete'
  )) DEFAULT 'not_received',

  -- Photos a la reception (URLs Supabase Storage)
  reception_photos text[],

  -- Frais de transport (denormalise pour performance)
  -- Justification : Le cout d'expedition est fixe au moment de
  -- l'etiquetage. On le stocke ici pour eviter un JOIN systematique.
  shipping_cost numeric(12,2) DEFAULT 0,
  shipping_cost_currency text DEFAULT 'XOF',
  shipping_cost_payer sav_party DEFAULT 'client',

  -- Statut du trajet
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'label_generated', 'picked_up', 'in_transit',
    'out_for_delivery', 'delivered', 'failed', 'returned_to_sender'
  )),

  -- Meta
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id),
  note text
);

-- Indexes
CREATE INDEX idx_return_shipments_case_id ON return_shipments(case_id);
CREATE INDEX idx_return_shipments_status ON return_shipments(status);
CREATE INDEX idx_return_shipments_leg_type ON return_shipments(leg_type);
CREATE INDEX idx_return_shipments_tracking ON return_shipments(tracking_number);

-- ============================================================
-- 3. NOUVELLE TABLE : inspection_reports
-- ============================================================
-- Justification : L'inspection est la FOURCHE DECISIONNELLE du
-- workflow retour. Elle determine si le produit est restocke,
-- detruit, ou renvoye au fournisseur. Sans table dediee, cette
-- etape critique n'est pas structuree.

CREATE TABLE IF NOT EXISTS inspection_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES sav_cases(id) ON DELETE CASCADE,
  return_shipment_id uuid REFERENCES return_shipments(id),

  -- Inspecteur
  inspected_by uuid NOT NULL REFERENCES profiles(id),
  inspected_at timestamptz NOT NULL DEFAULT now(),

  -- Resultat de l'inspection
  -- Justification : 10 niveaux de condition pour couvrir tous les cas
  -- (neuf scelle a contrefacon). Chaque niveau a une implication
  -- differente sur la decision.
  condition text NOT NULL CHECK (condition IN (
    'new_sealed',           -- Neuf, scelle
    'new_opened',           -- Neuf, ouvert
    'like_new',             -- Comme neuf
    'good',                 -- Bon etat
    'fair',                 -- Etat moyen
    'damaged_functional',   -- Endommage, fonctionnel
    'damaged_unfunctional', -- Endommage, non fonctionnel
    'incomplete',           -- Incomplet
    'wrong_product',        -- Mauvais produit
    'counterfeit'           -- Contrefacon
  )),

  -- Details de l'inspection
  actual_weight_g integer,           -- Poids reel (grammes)
  actual_dimensions_cm integer[],    -- Dimensions [L,l,H] en cm
  accessories_present text[],        -- Liste des accessoires trouves
  accessories_missing text[],        -- Liste des accessoires manquants
  serial_number text,                -- Numero de serie verifie

  -- Etat de l'emballage
  packaging_condition text CHECK (packaging_condition IN (
    'original_intact', 'original_damaged', 'original_missing', 'replacement'
  )),

  -- Decision de disposition
  -- Justification : 7 actions possibles apres inspection.
  -- Chaque action declenche un workflow different et des couts differents.
  disposition text NOT NULL CHECK (disposition IN (
    'restock_as_new',       -- Remise en stock neuf
    'restock_as_used',      -- Remise en stock occasion
    'send_to_repair',       -- Envoi en reparation
    'return_to_supplier',   -- Retour fournisseur
    'destroy',              -- Destruction
    'donate',               -- Don
    'pending_decision'      -- Decision differee (expertise necessaire)
  )),

  -- Photos et videos
  photos text[],                     -- URLs photos inspection
  videos text[],                     -- URLs videos inspection

  -- Commentaires
  findings text,                     -- Constats detailles
  recommended_action text,           -- Action recommandee
  client_fault boolean DEFAULT false, -- Faute du client ?

  -- Frais d'inspection
  inspection_cost numeric(12,2) DEFAULT 0,
  inspection_cost_currency text DEFAULT 'XOF',
  inspection_cost_payer sav_party DEFAULT 'kawzone',

  -- Meta
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_inspection_reports_case_id ON inspection_reports(case_id);
CREATE INDEX idx_inspection_reports_disposition ON inspection_reports(disposition);
CREATE INDEX idx_inspection_reports_inspected_at ON inspection_reports(inspected_at);

-- ============================================================
-- 4. NOUVELLE TABLE : supplier_returns
-- ============================================================
-- Justification : Les retours fournisseur sont un processus
-- INTERNATIONAL ASYNCHRONE (delai 30-90 jours). Le fournisseur
-- peut accepter, refuser, ou proposer un avoir partiel. Il faut
-- une table dediee pour tracer ce cycle long.

CREATE TABLE IF NOT EXISTS supplier_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES sav_cases(id) ON DELETE CASCADE,
  inspection_report_id uuid REFERENCES inspection_reports(id),

  -- Fournisseur
  -- Justification : Le fournisseur peut ne pas avoir de compte
  -- dans le systeme (fournisseur Chine externe). On stocke donc
  -- un identifiant texte + nom.
  supplier_id text NOT NULL,
  supplier_name text,

  -- Demande de retour au fournisseur
  requested_at timestamptz,
  request_method text CHECK (request_method IN (
    'email', 'platform_api', 'phone', 'agent', 'wechat'
  )),
  request_reference text,

  -- Description du colis envoye
  items_returned jsonb DEFAULT '[]',
  -- Format : [{"product_id": "...", "quantity": 1, "condition": "defective", "reason": "..."}]

  -- Reponse du fournisseur
  supplier_response text CHECK (supplier_response IN (
    'pending', 'accepted_full', 'accepted_partial', 'refused',
    'no_response', 'counter_offer', 'requested_more_info'
  )) DEFAULT 'pending',
  supplier_response_at timestamptz,
  supplier_response_note text,

  -- Avoir / Credit
  credit_amount numeric(12,2) DEFAULT 0,
  credit_currency text DEFAULT 'CNY',
  credit_received_at timestamptz,
  credit_applied_to_case boolean DEFAULT false,

  -- Expedition vers le fournisseur
  return_shipment_id uuid REFERENCES return_shipments(id),

  -- Meta
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

-- Indexes
CREATE INDEX idx_supplier_returns_case_id ON supplier_returns(case_id);
CREATE INDEX idx_supplier_returns_supplier ON supplier_returns(supplier_id);
CREATE INDEX idx_supplier_returns_response ON supplier_returns(supplier_response);

-- ============================================================
-- 5. NOUVELLE TABLE : destruction_records
-- ============================================================
-- Justification : Les destructions doivent etre JUSTIFIEES
-- FISCALEMENT. Un produit detruit = une perte. Sans documentation,
-- c'est un trou comptable. Cette table archive la methode, les
-- temoins, les photos, et la valeur detruite.

CREATE TABLE IF NOT EXISTS destruction_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES sav_cases(id) ON DELETE CASCADE,
  inspection_report_id uuid REFERENCES inspection_reports(id),

  -- Methode de destruction
  method text NOT NULL CHECK (method IN (
    'recycling', 'landfill', 'incineration', 'donation', 'resale_destruction', 'other'
  )),

  -- Temoins (deux signatures pour eviter la fraude)
  destroyed_by uuid REFERENCES profiles(id),
  witnessed_by uuid REFERENCES profiles(id),
  destroyed_at timestamptz NOT NULL DEFAULT now(),

  -- Documentation
  photos text[],
  certificate_url text,

  -- Valeur detruite (pour les rapports)
  original_value numeric(12,2),
  original_currency text DEFAULT 'XOF',

  -- Commentaire obligatoire
  reason text NOT NULL,

  -- Meta
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

-- Indexes
CREATE INDEX idx_destruction_records_case_id ON destruction_records(case_id);

-- ============================================================
-- 6. VUE : return_balances
-- ============================================================
-- Justification : Vue SQL qui agrege AUTOMATIQUEMENT tous les
-- montants d'un dossier retour. Aucune donnee n'est dupliquee,
-- tout est calcule a la volee depuis les tables sources.
-- C'est la source de verite pour les rapports financiers.

CREATE OR REPLACE VIEW return_balances AS
SELECT
  sc.id AS case_id,
  sc.order_id,
  sc.order_item_id,
  sc.case_type,
  sc.status,
  sc.owner_party,
  sc.problem_type,
  sc.vendor_id,

  -- Total paye initialement (commande originale)
  COALESCE(oi.unit_price * oi.quantity, 0) AS total_paid,
  oi.unit_price AS unit_price,
  oi.quantity AS original_quantity,

  -- Total des frais retour
  COALESCE(fees.total_fees, 0) AS total_fees,
  MAX(fees.currency) AS fees_currency,

  -- Detail des frais par type (JSON pour affichage flexible)
  COALESCE(fees_by_type.fees_breakdown, '{}'::jsonb) AS fees_breakdown,

  -- Total rembourse au client
  COALESCE(refunds.total_refunded, 0) AS total_refunded,

  -- Total avoir/credit note
  COALESCE(credits.total_credit, 0) AS total_credit_notes,

  -- Calculs derives
  COALESCE(oi.unit_price * oi.quantity, 0) - COALESCE(refunds.total_refunded, 0) AS total_remaining,
  COALESCE(fees.total_fees, 0) - COALESCE(refunds.total_refunded, 0) - COALESCE(supplier_credits.total_supplier_credit, 0) AS net_position,

  -- Pertes definitives (destructions + refus fournisseur)
  COALESCE(losses.total_loss, 0) AS total_lost,

  -- Credit fournisseur recupere
  COALESCE(supplier_credits.total_supplier_credit, 0) AS total_supplier_credit,

  -- Balance finale
  CASE
    WHEN sc.status IN ('closed', 'resolved') THEN 'settled'
    WHEN sc.status = 'in_execution' THEN 'pending_closure'
    ELSE 'open'
  END AS balance_status,

  -- Timestamps
  sc.created_at AS case_opened_at,
  sc.closed_at AS case_closed_at,
  sc.updated_at

FROM sav_cases sc
LEFT JOIN order_items oi ON oi.id = sc.order_item_id

-- Agregation des frais
LEFT JOIN (
  SELECT
    case_id,
    SUM(amount) AS total_fees,
    MAX(currency) AS currency
  FROM sav_fee_charges
  GROUP BY case_id
) fees ON fees.case_id = sc.id

-- Detail des frais par type (JSON)
LEFT JOIN (
  SELECT
    case_id,
    jsonb_object_agg(fee_kind::text, jsonb_build_object('amount', amount, 'currency', currency, 'payer', payer_party)) AS fees_breakdown
  FROM (
    SELECT case_id, fee_kind, SUM(amount) AS amount, MAX(currency) AS currency, MAX(payer_party::text) AS payer_party
    FROM sav_fee_charges
    GROUP BY case_id, fee_kind
  ) sub
  GROUP BY case_id
) fees_by_type ON fees_by_type.case_id = sc.id

-- Agregation des remboursements
LEFT JOIN (
  SELECT case_id, SUM(amount) AS total_refunded
  FROM sav_refunds
  WHERE status = 'issued'
  GROUP BY case_id
) refunds ON refunds.case_id = sc.id

-- Agregation des avoirs
LEFT JOIN (
  SELECT case_id, SUM(amount) AS total_credit
  FROM sav_refunds
  WHERE method = 'credit_note' AND status = 'issued'
  GROUP BY case_id
) credits ON credits.case_id = sc.id

-- Credits fournisseur
LEFT JOIN (
  SELECT case_id, SUM(credit_amount) AS total_supplier_credit
  FROM supplier_returns
  WHERE credit_applied_to_case = true
  GROUP BY case_id
) supplier_credits ON supplier_credits.case_id = sc.id

-- Pertes
LEFT JOIN (
  SELECT case_id, SUM(amount) AS total_loss
  FROM sav_fee_charges
  WHERE fee_kind IN ('destruction', 'handling', 'storage')
  GROUP BY case_id
) losses ON losses.case_id = sc.id

WHERE sc.case_type IN ('return', 'cancellation', 'exchange', 'warranty', 'dispute');

-- ============================================================
-- 7. RLS POLICIES
-- ============================================================

-- 7.1 return_shipments
ALTER TABLE return_shipments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "return_shipments_admin_all" ON return_shipments
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'admin')
  ));

CREATE POLICY "return_shipments_vendor_own" ON return_shipments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM sav_cases sc
    WHERE sc.id = return_shipments.case_id
    AND sc.vendor_id = auth.uid()
  ));

CREATE POLICY "return_shipments_client_own" ON return_shipments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM sav_cases sc
    JOIN orders o ON o.id = sc.order_id
    WHERE sc.id = return_shipments.case_id
    AND o.buyer_id = auth.uid()
  ));

-- 7.2 inspection_reports
ALTER TABLE inspection_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inspection_reports_admin_all" ON inspection_reports
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'admin')
  ));

CREATE POLICY "inspection_reports_vendor_own" ON inspection_reports
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM sav_cases sc
    WHERE sc.id = inspection_reports.case_id
    AND sc.vendor_id = auth.uid()
  ));

-- 7.3 supplier_returns
ALTER TABLE supplier_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplier_returns_admin_all" ON supplier_returns
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'admin')
  ));

-- 7.4 destruction_records
ALTER TABLE destruction_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "destruction_records_admin_all" ON destruction_records
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'admin')
  ));

-- 7.5 Vue return_balances — herite des permissions de sav_cases
-- (pas de RLS sur les vues, les permissions sont geree par
--  les policies des tables sous-jacentes)

-- ============================================================
-- 8. FONCTION : Mise a jour automatique de updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_return_shipments_updated_at
  BEFORE UPDATE ON return_shipments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_inspection_reports_updated_at
  BEFORE UPDATE ON inspection_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_supplier_returns_updated_at
  BEFORE UPDATE ON supplier_returns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 9. SEED DATA : Types de frais par defaut pour les regles SAV
-- ============================================================
-- Justification : Quand un admin configure les regles SAV, il
-- faut des valeurs par defaut pour qui paie chaque type de frais.
-- Ces valeurs sont surchargeables par les regles sav_rules.

-- Note : Ces valeurs seront inseres via l'application (pas en SQL
-- pur car elles dependent de la configuration metier).
-- On documente ici les valeurs recommandees :

-- | Type de frais          | Payer par defaut | Justification |
-- |------------------------|------------------|---------------|
-- | shipping_outbound      | client           | Livraison aller |
-- | shipping_return        | client           | Retour si changement d'avis |
-- | packaging              | vendor           | Emballage du vendeur |
-- | preparation            | vendor           | Preparation commande |
-- | import_logistics       | kawzone          | Import (metier KawZone) |
-- | handling               | kawzone          | Manutention KawZone |
-- | restocking             | vendor           | Remise en stock |
-- | inspection             | kawzone          | Controle qualite |
-- | destruction            | vendor           | Perte vendeur |
-- | re_shipment            | client           | Nouvelle livraison |
-- | weighing               | kawzone          | Pesee logistique |
-- | storage                | vendor           | Stockage produit |
-- | customs_return         | vendor           | Douane retour |
-- | insurance_claim        | insurance        | Assurance |
-- | photo_documentation    | kawzone          | Documentation |
-- | labor                  | kawzone          | Main d'oeuvre |

-- ============================================================
-- FIN DE LA MIGRATION
-- ============================================================
-- Resume :
-- - 4 nouvelles tables (return_shipments, inspection_reports,
--   supplier_returns, destruction_records)
-- - 3 enums etendus (sav_fee_kind +9, sav_problem_type +5,
--   sav_action_type +13)
-- - 1 vue SQL (return_balances)
-- - RLS policies pour chaque table
-- - Triggers updated_at automatiques
-- - Indexes optimises pour les requetes frequentes
-- ============================================================
