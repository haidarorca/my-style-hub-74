ALTER TABLE public.cj_import_job_items DROP CONSTRAINT cj_import_job_items_status_check;
ALTER TABLE public.cj_import_job_items ADD CONSTRAINT cj_import_job_items_status_check CHECK (status = ANY (ARRAY['PENDING','PROCESSING','SUCCESS','ALREADY_EXISTS','SYNCED','FAILED','SKIPPED','CANCELLED']));
ALTER TABLE public.cj_import_jobs ADD COLUMN IF NOT EXISTS n_cancelled integer NOT NULL DEFAULT 0;
ALTER TABLE public.cj_import_jobs ADD COLUMN IF NOT EXISTS last_item_name text;

CREATE OR REPLACE FUNCTION public.cj_refresh_job_counts(_job uuid)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  update public.cj_import_jobs j set
    total=c.total, n_pending=c.p, n_processing=c.pr, n_success=c.s, n_exists=c.e, n_synced=c.sy, n_failed=c.f, n_skipped=c.sk, n_cancelled=c.ca
  from (select count(*) total,
    count(*) filter (where status='PENDING') p, count(*) filter (where status='PROCESSING') pr,
    count(*) filter (where status='SUCCESS') s, count(*) filter (where status='ALREADY_EXISTS') e,
    count(*) filter (where status='SYNCED') sy, count(*) filter (where status='FAILED') f,
    count(*) filter (where status='SKIPPED') sk, count(*) filter (where status='CANCELLED') ca
    from public.cj_import_job_items where job_id=_job) c
  where j.id=_job;
$function$;

-- Réservation : uniquement si le job est actif (jamais pour un job annulé/en pause/terminé).
CREATE OR REPLACE FUNCTION public.cj_claim_job_items(_job uuid, _n integer)
 RETURNS SETOF cj_import_job_items LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from public.cj_import_jobs where id=_job and status in ('pending','running','discovering')) then
    return;
  end if;
  return query
  update public.cj_import_job_items i set status='PROCESSING', attempts=i.attempts+1, lease_until=now()+interval '5 minutes'
  where i.id in (
    select id from public.cj_import_job_items
    where job_id=_job and (status='PENDING' or (status='PROCESSING' and lease_until < now()))
    order by created_at limit _n for update skip locked)
  returning i.*;
end
$function$;

-- Bail exclusif d'un job : un seul traitement actif à la fois.
CREATE OR REPLACE FUNCTION public.cj_try_lease_job(_job uuid, _seconds integer)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare ok boolean;
begin
  update public.cj_import_jobs set lease_until = now() + make_interval(secs => _seconds),
    started_at = coalesce(started_at, now()),
    status = case when discover_done then 'running' else 'discovering' end
  where id=_job and status in ('pending','running','discovering')
    and (lease_until is null or lease_until < now())
  returning true into ok;
  return coalesce(ok, false);
end
$function$;

REVOKE ALL ON FUNCTION public.cj_try_lease_job(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cj_try_lease_job(uuid, integer) TO service_role;
REVOKE ALL ON FUNCTION public.cj_claim_job_items(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cj_claim_job_items(uuid, integer) TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_net;