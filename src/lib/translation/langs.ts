// Langues cibles du Centre de traduction. Ajouter une langue ici suffit
// pour qu'elle apparaisse dans le tableau de bord et soit traitée par le moteur.
export const TRANSLATION_LANGS = [
  { code: "fr", label: "Français", flag: "🇫🇷", english: "French" },
  { code: "en", label: "Anglais", flag: "🇬🇧", english: "English" },
  { code: "ar", label: "Arabe", flag: "🇸🇦", english: "Modern Standard Arabic" },
] as const;

export type TranslationLang = (typeof TRANSLATION_LANGS)[number]["code"];
export const TRANSLATION_LANG_CODES = TRANSLATION_LANGS.map((l) => l.code) as TranslationLang[];

export const TRANSLATION_SCOPES = [
  { id: "products", label: "Produits" },
  { id: "variants", label: "Variantes / attributs" },
  { id: "categories", label: "Catégories" },
  { id: "countries", label: "Pays" },
  { id: "shops", label: "Boutiques" },
  { id: "banners", label: "Bannières" },
  { id: "settings", label: "Paramètres" },
] as const;

export type TranslationScope = (typeof TRANSLATION_SCOPES)[number]["id"];
export const TRANSLATION_SCOPE_IDS = TRANSLATION_SCOPES.map((s) => s.id) as TranslationScope[];
