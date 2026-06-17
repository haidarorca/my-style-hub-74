
CREATE OR REPLACE FUNCTION public.get_admin_vendor_product_stats()
RETURNS TABLE(
  user_id uuid,
  shop_name text,
  full_name text,
  email text,
  total bigint,
  approved bigint,
  pending bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ur.user_id,
    pr.shop_name,
    pr.full_name,
    pr.email,
    COALESCE(c.total, 0)::bigint AS total,
    COALESCE(c.approved, 0)::bigint AS approved,
    COALESCE(c.pending, 0)::bigint AS pending
  FROM public.user_roles ur
  JOIN public.profiles pr ON pr.id = ur.user_id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE p.status = 'approved'::product_status) AS approved,
      COUNT(*) FILTER (WHERE p.status = 'pending'::product_status)  AS pending
    FROM public.products p
    WHERE p.vendor_id = ur.user_id
  ) c ON TRUE
  WHERE ur.role = 'vendeur'::app_role
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.is_super_admin(auth.uid())
    );
$$;

REVOKE ALL ON FUNCTION public.get_admin_vendor_product_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_vendor_product_stats() TO authenticated;
