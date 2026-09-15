DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'studio_access',
    'products.view','products.create','products.update','products.delete','products.publish','products.import_export','products.media','products.groups',
    'product_validation.view','product_validation.approve','product_validation.reject',
    'categories.view','categories.create','categories.update','categories.delete',
    'orders.view','orders.update','orders.confirm','orders.cancel','orders.delete','orders.logistics','orders.payments','orders.returns',
    'customers.view','customers.update','customers.delete','customers.export',
    'vendors.view','vendors.create','vendors.update','vendors.delete','vendors.suspend','vendors.shops',
    'support.view','support.reply','support.reviews','support.reports',
    'settings.view','settings.update','settings.content','settings.countries','settings.currencies','settings.shipping','settings.contact','settings.integrations',
    'commissions.view','commissions.manage',
    'finance','finance.view','finance.manage',
    'admins','admins.view','admins.manage',
    'audit','audit.view',
    'notifications','notifications.view','notifications.send'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'admin_permission' AND e.enumlabel = v
    ) THEN
      EXECUTE format('ALTER TYPE public.admin_permission ADD VALUE %L', v);
    END IF;
  END LOOP;
END $$;