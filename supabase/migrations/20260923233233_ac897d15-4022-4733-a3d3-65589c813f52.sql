
alter table public.product_variants add column if not exists cj_options jsonb;

create table public.cj_import_schedules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  enabled boolean not null default true,
  hour_utc int not null default 2 check (hour_utc between 0 and 23),
  criteria jsonb not null default '{}'::jsonb,
  max_new int not null default 100 check (max_new between 1 and 5000),
  last_run_at timestamptz,
  last_job_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.cj_import_schedules to authenticated;
grant all on public.cj_import_schedules to service_role;
alter table public.cj_import_schedules enable row level security;
create policy "admins manage cj schedules" on public.cj_import_schedules for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.cj_import_jobs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'import' check (kind in ('import','sync')),
  sync_parts text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending','discovering','running','paused','cancelled','completed','failed')),
  criteria jsonb,
  target_count int,
  options jsonb not null default '{}'::jsonb,
  discover_page int not null default 1,
  discover_done boolean not null default true,
  schedule_id uuid references public.cj_import_schedules(id) on delete set null,
  total int not null default 0,
  n_pending int not null default 0,
  n_processing int not null default 0,
  n_success int not null default 0,
  n_exists int not null default 0,
  n_synced int not null default 0,
  n_failed int not null default 0,
  n_skipped int not null default 0,
  api_calls int not null default 0,
  last_error text,
  lease_until timestamptz,
  created_by uuid,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.cj_import_jobs to authenticated;
grant all on public.cj_import_jobs to service_role;
alter table public.cj_import_jobs enable row level security;
create policy "admins manage cj jobs" on public.cj_import_jobs for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create index cj_import_jobs_status_idx on public.cj_import_jobs(status, created_at desc);

create table public.cj_import_job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.cj_import_jobs(id) on delete cascade,
  pid text not null,
  name text,
  image text,
  status text not null default 'PENDING' check (status in ('PENDING','PROCESSING','SUCCESS','ALREADY_EXISTS','SYNCED','FAILED','SKIPPED')),
  product_id uuid,
  error text,
  missing jsonb,
  attempts int not null default 0,
  lease_until timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, pid)
);
grant select, insert, update, delete on public.cj_import_job_items to authenticated;
grant all on public.cj_import_job_items to service_role;
alter table public.cj_import_job_items enable row level security;
create policy "admins manage cj job items" on public.cj_import_job_items for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create index cj_import_job_items_job_status_idx on public.cj_import_job_items(job_id, status);

-- Verrou par produit CJ (évite deux traitements simultanés du même PID, tous imports confondus)
create table public.cj_import_locks (
  pid text primary key,
  locked_until timestamptz not null
);
grant all on public.cj_import_locks to service_role;
alter table public.cj_import_locks enable row level security;

create trigger cj_import_schedules_updated before update on public.cj_import_schedules for each row execute function public.fn_set_updated_at();
create trigger cj_import_jobs_updated before update on public.cj_import_jobs for each row execute function public.fn_set_updated_at();
create trigger cj_import_job_items_updated before update on public.cj_import_job_items for each row execute function public.fn_set_updated_at();

-- Réserve n éléments à traiter (reprend aussi ceux dont le bail a expiré après un crash)
create or replace function public.cj_claim_job_items(_job uuid, _n int)
returns setof public.cj_import_job_items language plpgsql security definer set search_path=public as $$
begin
  return query
  update public.cj_import_job_items i set status='PROCESSING', attempts=i.attempts+1, lease_until=now()+interval '5 minutes'
  where i.id in (
    select id from public.cj_import_job_items
    where job_id=_job and (status='PENDING' or (status='PROCESSING' and lease_until < now()))
    order by created_at limit _n for update skip locked)
  returning i.*;
end $$;

create or replace function public.cj_try_lock_pid(_pid text, _seconds int)
returns boolean language plpgsql security definer set search_path=public as $$
declare ok boolean;
begin
  insert into public.cj_import_locks(pid, locked_until) values (_pid, now()+make_interval(secs=>_seconds))
  on conflict (pid) do update set locked_until=excluded.locked_until where cj_import_locks.locked_until < now()
  returning true into ok;
  return coalesce(ok,false);
end $$;

create or replace function public.cj_refresh_job_counts(_job uuid)
returns void language sql security definer set search_path=public as $$
  update public.cj_import_jobs j set
    total=c.total, n_pending=c.p, n_processing=c.pr, n_success=c.s, n_exists=c.e, n_synced=c.sy, n_failed=c.f, n_skipped=c.sk
  from (select count(*) total,
    count(*) filter (where status='PENDING') p, count(*) filter (where status='PROCESSING') pr,
    count(*) filter (where status='SUCCESS') s, count(*) filter (where status='ALREADY_EXISTS') e,
    count(*) filter (where status='SYNCED') sy, count(*) filter (where status='FAILED') f,
    count(*) filter (where status='SKIPPED') sk
    from public.cj_import_job_items where job_id=_job) c
  where j.id=_job;
$$;

revoke execute on function public.cj_claim_job_items(uuid,int) from public, anon, authenticated;
revoke execute on function public.cj_try_lock_pid(text,int) from public, anon, authenticated;
revoke execute on function public.cj_refresh_job_counts(uuid) from public, anon, authenticated;
grant execute on function public.cj_claim_job_items(uuid,int) to service_role;
grant execute on function public.cj_try_lock_pid(text,int) to service_role;
grant execute on function public.cj_refresh_job_counts(uuid) to service_role;
