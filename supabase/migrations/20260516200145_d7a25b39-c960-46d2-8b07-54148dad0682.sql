
-- Seed 3 test accounts for E2E tests (idempotent)
-- Passwords: TestPass123! for all three
-- Emails: e2e-admin@kawzone.test, e2e-vendor@kawzone.test, e2e-buyer@kawzone.test

DO $$
DECLARE
  v_admin_id uuid;
  v_vendor_id uuid;
  v_buyer_id uuid;
  v_encrypted text;
BEGIN
  v_encrypted := crypt('TestPass123!', gen_salt('bf'));

  -- Admin
  SELECT id INTO v_admin_id FROM auth.users WHERE email = 'e2e-admin@kawzone.test';
  IF v_admin_id IS NULL THEN
    v_admin_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin
    ) VALUES (
      v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'e2e-admin@kawzone.test', v_encrypted,
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"E2E Admin"}'::jsonb, false
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_admin_id,
      jsonb_build_object('sub', v_admin_id::text, 'email', 'e2e-admin@kawzone.test'),
      'email', v_admin_id::text, now(), now(), now());
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_admin_id, 'admin'::app_role) ON CONFLICT DO NOTHING;

  -- Vendor
  SELECT id INTO v_vendor_id FROM auth.users WHERE email = 'e2e-vendor@kawzone.test';
  IF v_vendor_id IS NULL THEN
    v_vendor_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin
    ) VALUES (
      v_vendor_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'e2e-vendor@kawzone.test', v_encrypted,
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"E2E Vendor"}'::jsonb, false
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_vendor_id,
      jsonb_build_object('sub', v_vendor_id::text, 'email', 'e2e-vendor@kawzone.test'),
      'email', v_vendor_id::text, now(), now(), now());
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_vendor_id, 'vendeur'::app_role) ON CONFLICT DO NOTHING;
  UPDATE public.profiles
    SET vendor_status = 'active'::public.vendor_account_status,
        shop_name = COALESCE(shop_name, 'E2E Test Shop')
    WHERE id = v_vendor_id;

  -- Buyer
  SELECT id INTO v_buyer_id FROM auth.users WHERE email = 'e2e-buyer@kawzone.test';
  IF v_buyer_id IS NULL THEN
    v_buyer_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin
    ) VALUES (
      v_buyer_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'e2e-buyer@kawzone.test', v_encrypted,
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"E2E Buyer"}'::jsonb, false
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_buyer_id,
      jsonb_build_object('sub', v_buyer_id::text, 'email', 'e2e-buyer@kawzone.test'),
      'email', v_buyer_id::text, now(), now(), now());
  END IF;
  -- buyer role is auto-assigned by handle_new_user trigger, but ensure it exists
  INSERT INTO public.user_roles (user_id, role) VALUES (v_buyer_id, 'acheteur'::app_role) ON CONFLICT DO NOTHING;
END $$;
