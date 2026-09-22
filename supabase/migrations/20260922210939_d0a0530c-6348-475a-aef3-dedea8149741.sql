-- Cache d'appels CJ (catégories) pour éviter de consommer des points inutilement
create table if not exists public.cj_api_cache (
  cache_key text primary key,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);
grant select on public.cj_api_cache to authenticated;
grant all on public.cj_api_cache to service_role;
alter table public.cj_api_cache enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cj_api_cache' and policyname='cj_api_cache_admin_read') then
    create policy "cj_api_cache_admin_read" on public.cj_api_cache
      for select to authenticated using (public.has_role(auth.uid(), 'admin'));
  end if;
end $$;
