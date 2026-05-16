
-- 1) Unique index to prevent duplicates per parent + level
CREATE UNIQUE INDEX IF NOT EXISTS categories_slug_parent_level_uniq
  ON public.categories (slug, COALESCE(parent_id::text, ''), level);

-- 2) Lucide icon names for L1 categories (modern, professional)
UPDATE public.categories SET logo_url = 'lucide:Shirt'              WHERE level=1 AND slug='mode-homme';
UPDATE public.categories SET logo_url = 'lucide:Sparkles'           WHERE level=1 AND slug='mode-femme';
UPDATE public.categories SET logo_url = 'lucide:Baby'               WHERE level=1 AND slug='enfants-bebe';
UPDATE public.categories SET logo_url = 'lucide:Smartphone'         WHERE level=1 AND slug='electronique';
UPDATE public.categories SET logo_url = 'lucide:Home'               WHERE level=1 AND slug='maison-decoration';
UPDATE public.categories SET logo_url = 'lucide:Wrench'             WHERE level=1 AND slug='bricolage-jardin';
UPDATE public.categories SET logo_url = 'lucide:Dumbbell'           WHERE level=1 AND slug='sport-fitness';
UPDATE public.categories SET logo_url = 'lucide:Car'                WHERE level=1 AND slug='auto-moto';
UPDATE public.categories SET logo_url = 'lucide:HeartPulse'         WHERE level=1 AND slug='beaute-sante';
UPDATE public.categories SET logo_url = 'lucide:UtensilsCrossed'    WHERE level=1 AND slug='alimentation-boissons';
UPDATE public.categories SET logo_url = 'lucide:PawPrint'           WHERE level=1 AND slug='animaux';
UPDATE public.categories SET logo_url = 'lucide:Briefcase'          WHERE level=1 AND slug='bureau-fournitures';
UPDATE public.categories SET logo_url = 'lucide:Gamepad2'           WHERE level=1 AND slug='jeux-jouets';
UPDATE public.categories SET logo_url = 'lucide:BookOpen'           WHERE level=1 AND slug='livres-medias';
UPDATE public.categories SET logo_url = 'lucide:Luggage'            WHERE level=1 AND slug='bagagerie-voyage';

-- 3) Seed L3 categories. Format: [name, slug, parent_l1_slug, parent_l2_slug, position]
WITH data AS (
  SELECT
    e->>0 AS name,
    e->>1 AS slug,
    e->>2 AS l1_slug,
    e->>3 AS l2_slug,
    (e->>4)::int AS position
  FROM jsonb_array_elements($json$[
    ["T-shirts","t-shirts-h","mode-homme","hauts",0],
    ["Polos","polos-h","mode-homme","hauts",1],
    ["Chemises","chemises-h","mode-homme","hauts",2],
    ["Sweats & Pulls","sweats-pulls-h","mode-homme","hauts",3],
    ["Vestes","vestes-h","mode-homme","hauts",4],
    ["Manteaux","manteaux-h","mode-homme","hauts",5],
    ["Costumes & Blazers","costumes-h","mode-homme","hauts",6],
    ["Pantalons","pantalons-h","mode-homme","bas",0],
    ["Jeans","jeans-h","mode-homme","bas",1],
    ["Shorts","shorts-h","mode-homme","bas",2],
    ["Joggings","joggings-h","mode-homme","bas",3],
    ["Sneakers","sneakers-h","mode-homme","chaussures-homme",0],
    ["Sandales","sandales-h","mode-homme","chaussures-homme",1],
    ["Mocassins","mocassins-h","mode-homme","chaussures-homme",2],
    ["Bottes","bottes-h","mode-homme","chaussures-homme",3],
    ["Chaussures de ville","ville-h","mode-homme","chaussures-homme",4],
    ["Montres","montres-h","mode-homme","accessoires-homme",0],
    ["Lunettes","lunettes-h","mode-homme","accessoires-homme",1],
    ["Ceintures","ceintures-h","mode-homme","accessoires-homme",2],
    ["Casquettes","casquettes-h","mode-homme","accessoires-homme",3],
    ["Portefeuilles","portefeuilles-h","mode-homme","accessoires-homme",4],
    ["Boubous","boubous-h","mode-homme","mode-traditionnelle-homme",0],
    ["Kaftans","kaftans-h","mode-homme","mode-traditionnelle-homme",1],
    ["Tenues wax","wax-h","mode-homme","mode-traditionnelle-homme",2],
    ["Robes courtes","robes-courtes","mode-femme","robes",0],
    ["Robes longues","robes-longues","mode-femme","robes",1],
    ["Robes de soirée","robes-soiree","mode-femme","robes",2],
    ["Robes wax","robes-wax","mode-femme","robes",3],
    ["Robes de mariée","robes-mariee","mode-femme","robes",4],
    ["T-shirts","t-shirts-f","mode-femme","tops-femme",0],
    ["Blouses","blouses-f","mode-femme","tops-femme",1],
    ["Crop tops","crop-tops-f","mode-femme","tops-femme",2],
    ["Tuniques","tuniques-f","mode-femme","tops-femme",3],
    ["Pulls & Cardigans","pulls-f","mode-femme","tops-femme",4],
    ["Jupes","jupes-f","mode-femme","bas-femme",0],
    ["Jeans","jeans-f","mode-femme","bas-femme",1],
    ["Pantalons","pantalons-f","mode-femme","bas-femme",2],
    ["Leggings","leggings-f","mode-femme","bas-femme",3],
    ["Shorts","shorts-f","mode-femme","bas-femme",4],
    ["Hijabs","hijabs","mode-femme","tenues-modestes",0],
    ["Abayas","abayas","mode-femme","tenues-modestes",1],
    ["Jilbabs","jilbabs","mode-femme","tenues-modestes",2],
    ["Kaftans","kaftans-f","mode-femme","tenues-modestes",3],
    ["Voiles","voiles","mode-femme","tenues-modestes",4],
    ["Soutiens-gorge","soutiens-gorge","mode-femme","lingerie",0],
    ["Culottes","culottes","mode-femme","lingerie",1],
    ["Bodys","bodys","mode-femme","lingerie",2],
    ["Nuisettes","nuisettes","mode-femme","lingerie",3],
    ["Maillots de bain","maillots-bain-f","mode-femme","lingerie",4],
    ["Talons","talons-f","mode-femme","chaussures-femme",0],
    ["Sneakers","sneakers-f","mode-femme","chaussures-femme",1],
    ["Sandales","sandales-f","mode-femme","chaussures-femme",2],
    ["Ballerines","ballerines-f","mode-femme","chaussures-femme",3],
    ["Bottes","bottes-f","mode-femme","chaussures-femme",4],
    ["Sacs à main","sacs-main-f","mode-femme","sacs-femme",0],
    ["Sacs à dos","sacs-dos-f","mode-femme","sacs-femme",1],
    ["Pochettes","pochettes-f","mode-femme","sacs-femme",2],
    ["Cabas","cabas-f","mode-femme","sacs-femme",3],
    ["Colliers","colliers-f","mode-femme","bijoux-femme",0],
    ["Bracelets","bracelets-f","mode-femme","bijoux-femme",1],
    ["Bagues","bagues-f","mode-femme","bijoux-femme",2],
    ["Boucles d'oreilles","boucles-f","mode-femme","bijoux-femme",3],
    ["Parures","parures-f","mode-femme","bijoux-femme",4],
    ["Maquillage","maquillage","mode-femme","beaute-femme",0],
    ["Rouge à lèvres","rouge-levres","mode-femme","beaute-femme",1],
    ["Mascaras","mascaras","mode-femme","beaute-femme",2],
    ["Parfums Femme","parfums-f","mode-femme","beaute-femme",3],
    ["Perruques","perruques","mode-femme","cheveux-femme",0],
    ["Extensions","extensions","mode-femme","cheveux-femme",1],
    ["Tissages","tissages","mode-femme","cheveux-femme",2],
    ["Soins capillaires","soins-capillaires","mode-femme","cheveux-femme",3],
    ["Bodys bébé","bodys-bebe-f","enfants-bebe","bebe-fille",0],
    ["Robes bébé","robes-bebe","enfants-bebe","bebe-fille",1],
    ["Pyjamas bébé fille","pyjamas-bebe-f","enfants-bebe","bebe-fille",2],
    ["Bodys bébé","bodys-bebe-g","enfants-bebe","bebe-garcon",0],
    ["T-shirts bébé","t-shirts-bebe-g","enfants-bebe","bebe-garcon",1],
    ["Pyjamas bébé garçon","pyjamas-bebe-g","enfants-bebe","bebe-garcon",2],
    ["Poussettes","poussettes","enfants-bebe","puericulture",0],
    ["Sièges auto","sieges-auto","enfants-bebe","puericulture",1],
    ["Porte-bébés","porte-bebes","enfants-bebe","puericulture",2],
    ["Lits bébé","lits-bebe","enfants-bebe","puericulture",3],
    ["Biberons","biberons","enfants-bebe","repas-bebe",0],
    ["Tétines","tetines","enfants-bebe","repas-bebe",1],
    ["Chaises hautes","chaises-hautes","enfants-bebe","repas-bebe",2],
    ["Couches","couches","enfants-bebe","hygiene-bebe",0],
    ["Lingettes","lingettes","enfants-bebe","hygiene-bebe",1],
    ["Cosmétiques bébé","cosmetiques-bebe","enfants-bebe","hygiene-bebe",2],
    ["Smartphones","smartphones","electronique","telephonie",0],
    ["Coques & étuis","coques-etuis","electronique","telephonie",1],
    ["Chargeurs","chargeurs","electronique","telephonie",2],
    ["Écouteurs","ecouteurs","electronique","telephonie",3],
    ["Power banks","power-banks","electronique","telephonie",4],
    ["Ordinateurs portables","laptops","electronique","informatique",0],
    ["PC de bureau","pc-bureau","electronique","informatique",1],
    ["Souris","souris","electronique","informatique",2],
    ["Claviers","claviers","electronique","informatique",3],
    ["Écrans","ecrans","electronique","informatique",4],
    ["Stockage & USB","stockage","electronique","informatique",5],
    ["Casques audio","casques-audio","electronique","audio",0],
    ["Enceintes Bluetooth","enceintes","electronique","audio",1],
    ["Barres de son","barres-son","electronique","audio",2],
    ["TV LED","tv-led","electronique","tv-video",0],
    ["Décodeurs TV","decodeurs","electronique","tv-video",1],
    ["Projecteurs","projecteurs","electronique","tv-video",2],
    ["Consoles","consoles","electronique","gaming",0],
    ["Manettes","manettes","electronique","gaming",1],
    ["Jeux vidéo","jeux-video","electronique","gaming",2],
    ["Casseroles","casseroles","maison-decoration","cuisine",0],
    ["Poêles","poeles","maison-decoration","cuisine",1],
    ["Ustensiles","ustensiles","maison-decoration","cuisine",2],
    ["Vaisselle","vaisselle","maison-decoration","cuisine",3],
    ["Verres & Tasses","verres","maison-decoration","cuisine",4],
    ["Couteaux","couteaux","maison-decoration","cuisine",5],
    ["Draps","draps","maison-decoration","linge-maison",0],
    ["Couettes","couettes","maison-decoration","linge-maison",1],
    ["Oreillers","oreillers","maison-decoration","linge-maison",2],
    ["Serviettes","serviettes","maison-decoration","linge-maison",3],
    ["Rideaux","rideaux","maison-decoration","linge-maison",4],
    ["Lampes","lampes","maison-decoration","luminaires",0],
    ["Plafonniers","plafonniers","maison-decoration","luminaires",1],
    ["Guirlandes LED","guirlandes","maison-decoration","luminaires",2],
    ["Cadres","cadres","maison-decoration","decoration",0],
    ["Miroirs","miroirs","maison-decoration","decoration",1],
    ["Tapis","tapis","maison-decoration","decoration",2],
    ["Vases","vases","maison-decoration","decoration",3],
    ["Bougies","bougies","maison-decoration","decoration",4],
    ["Aspirateurs","aspirateurs","maison-decoration","electromenager",0],
    ["Réfrigérateurs","frigos","maison-decoration","electromenager",1],
    ["Machines à laver","machines-laver","maison-decoration","electromenager",2],
    ["Micro-ondes","micro-ondes","maison-decoration","electromenager",3],
    ["Mixeurs","mixeurs","maison-decoration","electromenager",4],
    ["Cafetières","cafetieres","maison-decoration","electromenager",5],
    ["Perceuses","perceuses","bricolage-jardin","outillage",0],
    ["Visseuses","visseuses","bricolage-jardin","outillage",1],
    ["Marteaux","marteaux","bricolage-jardin","outillage",2],
    ["Clés & Tournevis","cles","bricolage-jardin","outillage",3],
    ["Pots & Jardinières","pots","bricolage-jardin","jardin",0],
    ["Graines","graines","bricolage-jardin","jardin",1],
    ["Engrais","engrais","bricolage-jardin","jardin",2],
    ["Tuyaux d'arrosage","tuyaux","bricolage-jardin","jardin",3],
    ["Haltères","halteres","sport-fitness","musculation",0],
    ["Barres & Disques","barres","sport-fitness","musculation",1],
    ["Bancs de musculation","bancs","sport-fitness","musculation",2],
    ["Tapis de yoga","tapis-yoga","sport-fitness","yoga-pilates",0],
    ["Blocs yoga","blocs-yoga","sport-fitness","yoga-pilates",1],
    ["Ballons foot","ballons-foot","sport-fitness","football",0],
    ["Maillots foot","maillots-foot","sport-fitness","football",1],
    ["Crampons","crampons","sport-fitness","football",2],
    ["Vélos route","velos-route","sport-fitness","cyclisme",0],
    ["VTT","vtt","sport-fitness","cyclisme",1],
    ["Casques vélo","casques-velo","sport-fitness","cyclisme",2],
    ["Pneus","pneus","auto-moto","pieces-auto",0],
    ["Batteries auto","batteries-auto","auto-moto","pieces-auto",1],
    ["Huiles & lubrifiants","huiles","auto-moto","pieces-auto",2],
    ["Tapis voiture","tapis-voiture","auto-moto","accessoires-auto",0],
    ["Housses sièges","housses","auto-moto","accessoires-auto",1],
    ["GPS auto","gps","auto-moto","accessoires-auto",2],
    ["Casques moto","casques-moto","auto-moto","moto-scooter",0],
    ["Gants moto","gants-moto","auto-moto","moto-scooter",1],
    ["Pièces moto","pieces-moto","auto-moto","moto-scooter",2],
    ["Crèmes visage","cremes-visage","beaute-sante","soins-visage",0],
    ["Nettoyants","nettoyants","beaute-sante","soins-visage",1],
    ["Sérums","serums","beaute-sante","soins-visage",2],
    ["Crèmes corps","cremes-corps","beaute-sante","soins-corps",0],
    ["Gels douche","gels-douche","beaute-sante","soins-corps",1],
    ["Déodorants","deodorants","beaute-sante","soins-corps",2],
    ["Parfums Homme","parfums-h","beaute-sante","parfums",0],
    ["Parfums Unisexe","parfums-u","beaute-sante","parfums",1],
    ["Compléments","complements","beaute-sante","sante",0],
    ["Vitamines","vitamines","beaute-sante","sante",1],
    ["Riz","riz","alimentation-boissons","epicerie",0],
    ["Huiles alimentaires","huiles-alim","alimentation-boissons","epicerie",1],
    ["Pâtes","pates","alimentation-boissons","epicerie",2],
    ["Épices","epices","alimentation-boissons","epicerie",3],
    ["Thé","the","alimentation-boissons","boissons",0],
    ["Café","cafe","alimentation-boissons","boissons",1],
    ["Jus","jus","alimentation-boissons","boissons",2],
    ["Croquettes chien","croquettes-chien","animaux","chien",0],
    ["Laisses","laisses","animaux","chien",1],
    ["Colliers chien","colliers-chien","animaux","chien",2],
    ["Croquettes chat","croquettes-chat","animaux","chat",0],
    ["Litières","litieres","animaux","chat",1],
    ["Cahiers","cahiers","bureau-fournitures","papeterie",0],
    ["Stylos","stylos","bureau-fournitures","papeterie",1],
    ["Classeurs","classeurs","bureau-fournitures","papeterie",2],
    ["Imprimantes","imprimantes","bureau-fournitures","materiel-bureau",0],
    ["Cartouches","cartouches","bureau-fournitures","materiel-bureau",1],
    ["Bureaux","bureaux","bureau-fournitures","mobilier-bureau",0],
    ["Chaises bureau","chaises-bureau","bureau-fournitures","mobilier-bureau",1],
    ["Poupées","poupees","jeux-jouets","jouets-enfant",0],
    ["Voitures jouets","voitures-jouets","jeux-jouets","jouets-enfant",1],
    ["Légos & blocs","legos","jeux-jouets","jouets-enfant",2],
    ["Jeux de société","jeux-societe","jeux-jouets","jeux-plateau",0],
    ["Puzzles","puzzles","jeux-jouets","jeux-plateau",1],
    ["Romans","romans","livres-medias","livres",0],
    ["Livres scolaires","livres-scolaires","livres-medias","livres",1],
    ["Bandes dessinées","bd","livres-medias","livres",2],
    ["Livres religieux","livres-religieux","livres-medias","livres",3],
    ["Valises","valises","bagagerie-voyage","valises",0],
    ["Sacs voyage","sacs-voyage","bagagerie-voyage","sacs-voyage",0],
    ["Adaptateurs voyage","adaptateurs","bagagerie-voyage","accessoires-voyage",0],
    ["Oreillers de voyage","oreillers-voyage","bagagerie-voyage","accessoires-voyage",1]
  ]$json$) AS e
),
resolved AS (
  SELECT d.name, d.slug, d.position, c2.id AS parent_id
  FROM data d
  JOIN public.categories c1 ON c1.level = 1 AND c1.slug = d.l1_slug
  JOIN public.categories c2 ON c2.level = 2 AND c2.parent_id = c1.id AND c2.slug = d.l2_slug
)
INSERT INTO public.categories (name, slug, level, parent_id, position)
SELECT name, slug, 3, parent_id, position FROM resolved
ON CONFLICT DO NOTHING;

-- 4) RPC: total approved product count per category (incl. descendants)
CREATE OR REPLACE FUNCTION public.get_category_product_counts()
RETURNS TABLE(category_id uuid, product_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE tree AS (
    SELECT c.id AS root_id, c.id AS node_id FROM public.categories c
    UNION ALL
    SELECT t.root_id, c.id
    FROM public.categories c
    JOIN tree t ON c.parent_id = t.node_id
  )
  SELECT t.root_id, COUNT(DISTINCT p.id)::bigint
  FROM tree t
  LEFT JOIN public.products p
    ON p.category_id = t.node_id AND p.status = 'approved'
  GROUP BY t.root_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_category_product_counts() TO anon, authenticated;
