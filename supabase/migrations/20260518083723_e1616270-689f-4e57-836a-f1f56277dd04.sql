
-- Table d'historique des imports
CREATE TABLE public.product_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  scope text NOT NULL CHECK (scope IN ('vendor','admin')),
  shop_id uuid,
  file_name text NOT NULL,
  status text NOT NULL DEFAULT 'preview' CHECK (status IN ('preview','committed','failed','cancelled')),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  image_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz
);

CREATE INDEX product_imports_user_idx ON public.product_imports(user_id, created_at DESC);
CREATE INDEX product_imports_shop_idx ON public.product_imports(shop_id, created_at DESC);

ALTER TABLE public.product_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "imports_self_all" ON public.product_imports
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "imports_admin_all" ON public.product_imports
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()));

-- Bucket privé pour les fichiers d'import
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-imports', 'product-imports', false)
ON CONFLICT (id) DO NOTHING;

-- Policies storage : owner-only + admin
CREATE POLICY "imports_storage_owner_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'product-imports' AND (auth.uid()::text = (storage.foldername(name))[1] OR has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())));

CREATE POLICY "imports_storage_owner_write" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product-imports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "imports_storage_owner_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'product-imports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "imports_storage_owner_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'product-imports' AND (auth.uid()::text = (storage.foldername(name))[1] OR has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())));
