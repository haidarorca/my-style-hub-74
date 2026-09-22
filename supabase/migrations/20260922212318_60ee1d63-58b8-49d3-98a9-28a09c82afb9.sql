-- Remise à zéro de la correspondance de test (catégorie choisie au hasard pendant les vérifications).
update public.cj_category_map
set kawzone_category_id = null,
    status = 'pending',
    note = 'Catégorie à attribuer : « Women''s Clothing > Underwears > Bras » n''a pas encore de correspondance KawZone.'
where cj_category_id in (select cj_category_id from public.cj_category_map);

update public.products p
set category_id = null
where p.external_product_id = '2609221229141606800';

update public.cj_products
set category_mapping_status = 'pending', kawzone_category_id = null
where cj_product_id = '2609221229141606800';