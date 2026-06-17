-- Migration : Enrichissement de admin_action_log pour la Vague 1
-- Objectif : old_values/new_values séparés, index de recherche, compatibilité vieux logs

-- 1) Ajouter old_values et new_values (JSONB pour requêtes structurées)
ALTER TABLE public.admin_action_log
  ADD COLUMN IF NOT EXISTS old_values jsonb,
  ADD COLUMN IF NOT EXISTS new_values jsonb;

-- 2) Index pour recherche rapide par action et target
CREATE INDEX IF NOT EXISTS idx_admin_action_log_action ON public.admin_action_log (action);
CREATE INDEX IF NOT EXISTS idx_admin_action_log_target ON public.admin_action_log (target_type, target_id);

-- 3) Index GIN pour recherche dans details JSONB
CREATE INDEX IF NOT EXISTS idx_admin_action_log_details ON public.admin_action_log USING GIN (details jsonb_path_ops);

-- 4) Fonction enrichie qui accepte old_values/new_values
CREATE OR REPLACE FUNCTION public.log_admin_action_v2(
  _action text,
  _target_type text DEFAULT NULL,
  _target_id text DEFAULT NULL,
  _old_values jsonb DEFAULT NULL,
  _new_values jsonb DEFAULT NULL,
  _details jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_id uuid;
  email_val text;
BEGIN
  SELECT email INTO email_val FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.admin_action_log (
    actor_id, actor_email, action, target_type, target_id,
    old_values, new_values, details
  )
  VALUES (
    auth.uid(), email_val, _action, _target_type, _target_id,
    _old_values, _new_values, _details
  )
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

-- 5) Vue lisible pour les super admins
CREATE OR REPLACE VIEW public.admin_action_log_view AS
SELECT
  aal.id,
  aal.actor_id,
  aal.actor_email,
  aal.action,
  aal.target_type,
  aal.target_id,
  aal.old_values,
  aal.new_values,
  aal.details,
  aal.created_at,
  -- Champ calculé : label lisible de l'action
  CASE aal.action
    WHEN 'product.approve' THEN 'Produit approuvé'
    WHEN 'product.reject' THEN 'Produit rejeté'
    WHEN 'product.delete' THEN 'Produit supprimé'
    WHEN 'product.archive' THEN 'Produit archivé'
    WHEN 'product.edit' THEN 'Produit modifié'
    WHEN 'order.status_change' THEN 'Statut commande modifié'
    WHEN 'vendor.create' THEN 'Vendeur créé'
    WHEN 'vendor.update' THEN 'Vendeur modifié'
    WHEN 'vendor.delete' THEN 'Vendeur supprimé'
    WHEN 'vendor.suspend' THEN 'Vendeur suspendu'
    WHEN 'vendor.activate' THEN 'Vendeur activé'
    WHEN 'category.create' THEN 'Catégorie créée'
    WHEN 'category.update' THEN 'Catégorie modifiée'
    WHEN 'category.delete' THEN 'Catégorie supprimée'
    WHEN 'category_request.approve' THEN 'Demande catégorie acceptée'
    WHEN 'category_request.reject' THEN 'Demande catégorie rejetée'
    WHEN 'settings.update' THEN 'Paramètres modifiés'
    WHEN 'admin.create' THEN 'Administrateur créé'
    WHEN 'admin.update' THEN 'Administrateur modifié'
    WHEN 'admin.delete' THEN 'Administrateur supprimé'
    WHEN 'commission.update' THEN 'Commission modifiée'
    WHEN 'shipping_service.create' THEN 'Service transport créé'
    WHEN 'shipping_service.update' THEN 'Service transport modifié'
    WHEN 'shipping_service.delete' THEN 'Service transport supprimé'
    WHEN 'report.review' THEN 'Signalement examiné'
    WHEN 'report.dismiss' THEN 'Signalement rejeté'
    WHEN 'support.reply' THEN 'Réponse support envoyée'
    WHEN 'login' THEN 'Connexion'
    WHEN 'logout' THEN 'Déconnexion'
    ELSE aal.action
  END AS action_label
FROM public.admin_action_log aal
ORDER BY aal.created_at DESC;
