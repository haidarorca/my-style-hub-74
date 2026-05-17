import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Cloud env missing');

const [email, password, shopId, categoryId, label] = process.argv.slice(2);
const supabase = createClient(url, key, { auth: { persistSession: false } });
const { data: authData, error: signErr } = await supabase.auth.signInWithPassword({ email, password });
if (signErr) throw new Error(`${label}: signin failed: ${signErr.message}`);
const uid = authData.user?.id;
const code = `RLS-${label}-${Date.now()}`;
let productId;
const uploadedPaths = [];
try {
  const { data: product, error: productErr } = await supabase.from('products').insert({
    vendor_id: shopId,
    category_id: categoryId,
    code,
    name: `Test RLS ${label}`,
    designation: 'Test',
    description: 'Rollback test',
    price: 12345,
    status: 'approved',
  }).select('id').single();
  if (productErr) throw new Error(`product: ${productErr.message}`);
  productId = product.id;

  const mainPath = `${shopId}/${productId}/api-test-${Date.now()}.txt`;
  const { error: uploadErr } = await supabase.storage.from('product-images').upload(mainPath, new Blob(['test'], { type: 'text/plain' }), { contentType: 'text/plain' });
  if (uploadErr) throw new Error(`storage: ${uploadErr.message}`);
  uploadedPaths.push(mainPath);
  const publicUrl = supabase.storage.from('product-images').getPublicUrl(mainPath).data.publicUrl;

  const { error: imageErr } = await supabase.from('product_images').insert({ product_id: productId, url: publicUrl, position: 0 });
  if (imageErr) throw new Error(`product_images: ${imageErr.message}`);

  const variantPath = `${shopId}/${productId}/variants/api-test-${Date.now()}.txt`;
  const { error: variantUploadErr } = await supabase.storage.from('product-images').upload(variantPath, new Blob(['variant'], { type: 'text/plain' }), { contentType: 'text/plain' });
  if (variantUploadErr) throw new Error(`variant storage: ${variantUploadErr.message}`);
  uploadedPaths.push(variantPath);
  const variantUrl = supabase.storage.from('product-images').getPublicUrl(variantPath).data.publicUrl;

  const { error: variantErr } = await supabase.from('product_variants').insert({ product_id: productId, size: 'M', color: 'Noir', color_hex: '#000000', stock: 5, price_override: 15000, image_url: variantUrl });
  if (variantErr) throw new Error(`product_variants: ${variantErr.message}`);

  const { error: customErr } = await supabase.from('product_customizations').insert({ product_id: productId, type: 'image', image_size_message: 'Test' });
  if (customErr) throw new Error(`product_customizations: ${customErr.message}`);

  const { error: metaErr } = await supabase.from('product_admin_metadata').insert({ product_id: productId, source_url: 'https://example.test/source' });
  if (metaErr) throw new Error(`product_admin_metadata: ${metaErr.message}`);

  console.log(`${label}: ok (${uid})`);
} finally {
  if (productId) await supabase.from('products').delete().eq('id', productId);
  if (uploadedPaths.length) await supabase.storage.from('product-images').remove(uploadedPaths);
}
