-- Mémorisation du mapping catégorie CJ → catégorie KawZone (réutilisé aux imports suivants)
create table if not exists public.cj_category_map (
  id uuid primary key default gen_random_uuid(),
  cj_category_id text not null unique,
  cj_category_name text,
  cj_category_path text,
  kawzone_category_id uuid references public.categories(id) on delete set null,
  status text not null default 'pending',
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.cj_category_map to authenticated;
grant all on public.cj_category_map to service_role;

alter table public.cj_category_map enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cj_category_map' and policyname='cj_category_map_admin_all') then
    create policy "cj_category_map_admin_all" on public.cj_category_map
      for all to authenticated
      using (public.has_role(auth.uid(), 'admin'))
      with check (public.has_role(auth.uid(), 'admin'));
  end if;
end $$;

drop trigger if exists cj_category_map_updated_at on public.cj_category_map;
create trigger cj_category_map_updated_at before update on public.cj_category_map
  for each row execute function public.fn_set_updated_at();

-- Chemin complet de la catégorie CJ conservé sur le produit importé
alter table public.cj_products add column if not exists cj_category_path text;
alter table public.cj_products add column if not exists description_images_extracted integer;
