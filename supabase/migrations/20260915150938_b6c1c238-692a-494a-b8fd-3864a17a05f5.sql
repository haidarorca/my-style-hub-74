CREATE OR REPLACE FUNCTION public.has_admin_permission(_user_id uuid, _perm admin_permission)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_super_admin(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.admin_permissions ap
      JOIN public.user_roles ur
        ON ur.user_id = ap.user_id
       AND ur.role = 'admin'::app_role
       AND ur.is_suspended = false
      WHERE ap.user_id = _user_id
        AND (
          ap.permission = _perm
          OR ap.permission::text = split_part(_perm::text, '.', 1)
        )
    )
$function$;