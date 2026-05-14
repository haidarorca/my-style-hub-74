
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin', 'vendeur', 'acheteur');
CREATE TYPE public.product_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.report_status AS ENUM ('open', 'reviewed', 'dismissed');
CREATE TYPE public.user_sex AS ENUM ('homme', 'femme');
CREATE TYPE public.customization_type AS ENUM ('name', 'image');

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  sex public.user_sex,
  email TEXT,
  phone TEXT,
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  shop_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role function (security definer to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- get current user's roles
CREATE OR REPLACE FUNCTION public.current_user_has_role(_role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), _role)
$$;

-- CATEGORIES (3 levels via parent_id self-ref)
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  logo_url TEXT,
  level SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 3),
  position INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_id, slug)
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_categories_parent ON public.categories(parent_id);

-- PRODUCTS
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  designation TEXT,
  description TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  status public.product_status NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_products_vendor ON public.products(vendor_id);
CREATE INDEX idx_products_category ON public.products(category_id);
CREATE INDEX idx_products_status ON public.products(status);

-- PRODUCT IMAGES
CREATE TABLE public.product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  position INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_product_images_product ON public.product_images(product_id);

-- PRODUCT VARIANTS (size + color combinations)
CREATE TABLE public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  size TEXT,
  color TEXT,
  color_hex TEXT,
  stock INT NOT NULL DEFAULT 0,
  price_override NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_product_variants_product ON public.product_variants(product_id);

-- PRODUCT CUSTOMIZATIONS
CREATE TABLE public.product_customizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  type public.customization_type NOT NULL,
  -- For "image" type
  image_size_message TEXT,
  -- For "name" type
  allow_all_fonts BOOLEAN DEFAULT false,
  allowed_fonts TEXT[] DEFAULT '{}',
  allow_all_colors BOOLEAN DEFAULT false,
  allowed_colors TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.product_customizations ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_product_customizations_product ON public.product_customizations(product_id);

-- PRODUCT REPORTS
CREATE TABLE public.product_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status public.report_status NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.product_reports ENABLE ROW LEVEL SECURITY;

-- CART ITEMS
CREATE TABLE public.cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  customization JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_cart_items_user ON public.cart_items(user_id);

-- TRIGGER: updated_at
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- TRIGGER: auto-create profile + auto-assign admin role for haidarorca@gmail.com
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );

  -- Auto-assign admin role for designated email
  IF NEW.email = 'haidarorca@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  ELSE
    -- Default: acheteur (buyer); vendors are created by admin who upgrades the role
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'acheteur')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============== RLS POLICIES ==============

-- PROFILES
CREATE POLICY "profiles_self_select" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_admin_all" ON public.profiles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- USER_ROLES
CREATE POLICY "roles_self_read" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "roles_admin_write" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- CATEGORIES (public read, admin write)
CREATE POLICY "categories_public_read" ON public.categories
  FOR SELECT USING (true);
CREATE POLICY "categories_admin_write" ON public.categories
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- PRODUCTS
CREATE POLICY "products_public_read_approved" ON public.products
  FOR SELECT USING (status = 'approved' OR vendor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "products_vendor_insert" ON public.products
  FOR INSERT WITH CHECK (auth.uid() = vendor_id AND public.has_role(auth.uid(), 'vendeur'));
CREATE POLICY "products_vendor_update" ON public.products
  FOR UPDATE USING (vendor_id = auth.uid());
CREATE POLICY "products_vendor_delete" ON public.products
  FOR DELETE USING (vendor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "products_admin_all" ON public.products
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- PRODUCT IMAGES
CREATE POLICY "pi_read" ON public.product_images FOR SELECT USING (true);
CREATE POLICY "pi_vendor_write" ON public.product_images
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND (p.vendor_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND (p.vendor_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
  );

-- PRODUCT VARIANTS
CREATE POLICY "pv_read" ON public.product_variants FOR SELECT USING (true);
CREATE POLICY "pv_vendor_write" ON public.product_variants
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND (p.vendor_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND (p.vendor_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
  );

-- PRODUCT CUSTOMIZATIONS
CREATE POLICY "pc_read" ON public.product_customizations FOR SELECT USING (true);
CREATE POLICY "pc_vendor_write" ON public.product_customizations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND (p.vendor_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND (p.vendor_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
  );

-- REPORTS
CREATE POLICY "reports_own_insert" ON public.product_reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "reports_own_read" ON public.product_reports
  FOR SELECT USING (auth.uid() = reporter_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "reports_admin_update" ON public.product_reports
  FOR UPDATE USING (public.has_role(auth.uid(),'admin'));

-- CART
CREATE POLICY "cart_self_all" ON public.cart_items
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============== STORAGE BUCKETS ==============
INSERT INTO storage.buckets (id, name, public) VALUES
  ('category-logos', 'category-logos', true),
  ('product-images', 'product-images', true),
  ('customization-uploads', 'customization-uploads', true)
ON CONFLICT DO NOTHING;

-- Storage policies: public read, authenticated write to own folders
CREATE POLICY "cat_logo_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'category-logos');
CREATE POLICY "cat_logo_admin_write" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'category-logos' AND public.has_role(auth.uid(),'admin')
);
CREATE POLICY "cat_logo_admin_update" ON storage.objects FOR UPDATE USING (
  bucket_id = 'category-logos' AND public.has_role(auth.uid(),'admin')
);
CREATE POLICY "cat_logo_admin_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'category-logos' AND public.has_role(auth.uid(),'admin')
);

CREATE POLICY "prod_img_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
CREATE POLICY "prod_img_auth_write" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'product-images' AND auth.uid() IS NOT NULL
);
CREATE POLICY "prod_img_owner_modify" ON storage.objects FOR UPDATE USING (
  bucket_id = 'product-images' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin'))
);
CREATE POLICY "prod_img_owner_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'product-images' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin'))
);

CREATE POLICY "cust_up_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'customization-uploads');
CREATE POLICY "cust_up_auth_write" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'customization-uploads' AND auth.uid() IS NOT NULL
);
CREATE POLICY "cust_up_owner_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'customization-uploads' AND auth.uid()::text = (storage.foldername(name))[1]
);
