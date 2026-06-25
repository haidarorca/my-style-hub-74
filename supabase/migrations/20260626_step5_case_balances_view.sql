-- ============================================================
-- Migration Step 5 : v_case_balances (Vue SQL)
-- KawZone ERP — Système de gestion des retours
-- ============================================================
-- Date : 2026-06-26
-- Principe : Vue agrégée de la balance financière par dossier
-- Dépendances : Toutes les tables SAV existantes + steps 1-4
-- ============================================================

-- ------------------------------------------------------------
-- VUE : v_case_balances
-- ------------------------------------------------------------
-- But : Calculer AUTOMATIQUEMENT la balance financière complète
-- de chaque dossier retour. Aucune donnée n'est dupliquée,
-- tout est calculé à la volée depuis les tables sources.
--
-- Cette vue est la SOURCE DE VÉRITÉ pour :
--   - Les rapports financiers (Studio, exports)
--   - Les KPIs (marge perdue, taux de récupération...)
--   - Le Cockpit (widget balance)
--   - Les décisions métier (quand clôturer un dossier ?)
--
-- La vue fait des LEFT JOIN sur des sous-requêtes agrégées
-- pour éviter la duplication de lignes.
-- ------------------------------------------------------------

CREATE OR REPLACE VIEW v_case_balances AS
SELECT
  sc.id AS case_id,
  sc.order_id,
  sc.order_item_id,
  sc.case_type,
  sc.status AS case_status,
  sc.owner_party,
  sc.problem_type,
  sc.vendor_id,

  -- Montant total payé initialement par le client
  COALESCE(oi.unit_price * oi.quantity, 0) AS total_paid,
  oi.unit_price,
  oi.quantity AS original_quantity,

  -- Total des frais retour (inspection, transport, destruction...)
  COALESCE(fees.total_fees, 0) AS total_fees,

  -- Détail des frais par type (JSON pour affichage flexible dans UI)
  COALESCE(fees_by_type.fees_breakdown, '{}'::jsonb) AS fees_breakdown,

  -- Total remboursé au client (avoirs + remboursements)
  COALESCE(refunds.total_refunded, 0) AS total_refunded,

  -- Total avoir / credit note émis au client
  COALESCE(credits.total_credit, 0) AS total_credit_notes,

  -- Crédit fournisseur récupéré (avoir CNY du fournisseur chinois)
  COALESCE(supplier_credits.total_supplier_credit, 0) AS total_supplier_credit,

  -- Pertes définitives (destructions + refus fournisseur)
  COALESCE(losses.total_loss, 0) AS total_lost,

  -- ==========================================================
  -- CALCULS DÉRIVÉS
  -- ==========================================================
  
  -- Ce qui reste dû au client après remboursements
  COALESCE(oi.unit_price * oi.quantity, 0) - COALESCE(refunds.total_refunded, 0) AS total_remaining,
  
  -- Position nette : frais - remboursements - crédits fournisseur
  -- Un nombre négatif = KawZone perd de l'argent sur ce dossier
  COALESCE(fees.total_fees, 0) 
    - COALESCE(refunds.total_refunded, 0) 
    - COALESCE(supplier_credits.total_supplier_credit, 0) AS net_position,

  -- ==========================================================
  -- STATUT DE LA BALANCE
  -- ==========================================================
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

-- Jointure sur les items de commande pour récupérer le prix
LEFT JOIN order_items oi ON oi.id = sc.order_item_id

-- ==========================================================
-- SOUS-REQUÊTES AGRÉGÉES
-- ==========================================================

-- 1. Total des frais par dossier
LEFT JOIN (
  SELECT
    case_id,
    SUM(amount) AS total_fees,
    MAX(currency) AS currency
  FROM sav_fee_charges
  GROUP BY case_id
) fees ON fees.case_id = sc.id

-- 2. Détail des frais par type (JSON structuré)
LEFT JOIN (
  SELECT
    case_id,
    jsonb_object_agg(
      fee_kind::text, 
      jsonb_build_object(
        'amount', amount, 
        'currency', currency, 
        'payer', payer_party
      )
    ) AS fees_breakdown
  FROM (
    SELECT 
      case_id, 
      fee_kind, 
      SUM(amount) AS amount, 
      MAX(currency) AS currency, 
      MAX(payer_party::text) AS payer_party
    FROM sav_fee_charges
    GROUP BY case_id, fee_kind
  ) sub
  GROUP BY case_id
) fees_by_type ON fees_by_type.case_id = sc.id

-- 3. Total des remboursements (cash + crédit)
LEFT JOIN (
  SELECT case_id, SUM(amount) AS total_refunded
  FROM sav_refunds
  WHERE status = 'issued'
  GROUP BY case_id
) refunds ON refunds.case_id = sc.id

-- 4. Total des avoirs (credit_note uniquement)
LEFT JOIN (
  SELECT case_id, SUM(amount) AS total_credit
  FROM sav_refunds
  WHERE method = 'credit_note' AND status = 'issued'
  GROUP BY case_id
) credits ON credits.case_id = sc.id

-- 5. Crédits fournisseur (avoirs CNY récupérés)
LEFT JOIN (
  SELECT case_id, SUM(credit_amount) AS total_supplier_credit
  FROM supplier_returns
  WHERE credit_applied_to_case = true
  GROUP BY case_id
) supplier_credits ON supplier_credits.case_id = sc.id

-- 6. Pertes définitives (destructions + frais irrécupérables)
LEFT JOIN (
  SELECT case_id, SUM(amount) AS total_loss
  FROM sav_fee_charges
  WHERE fee_kind IN ('destruction', 'handling', 'storage')
  GROUP BY case_id
) losses ON losses.case_id = sc.id;

-- ============================================================
-- COMMENTAIRE SUR LA VUE (documentation)
-- ============================================================
COMMENT ON VIEW v_case_balances IS 
'Vue agrégée de la balance financière par dossier retour.
Source de vérité pour les rapports financiers et KPIs.
Ne stocke aucune donnée — tout est calculé à la volée.
Dépendances : sav_cases, order_items, sav_fee_charges, 
sav_refunds, supplier_returns.';
