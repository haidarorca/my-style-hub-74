import { supabase } from "@/integrations/supabase/client";
import { translateProductFields, translateCategoryName } from "@/lib/translate.functions";

type ProductInput = {
  productId: string;
  name: string;
  designation?: string | null;
  description?: string | null;
};

/**
 * Désactivé : cette ancienne traduction supposait que le texte était en
 * français, ce qui est faux pour les produits CJ. Les produits nouveaux ou
 * modifiés sont désormais traduits par le Centre de traduction (tableau de
 * bord admin), qui détecte la langue source. Signature conservée pour ne pas
 * casser les appels existants.
 */
export async function autoTranslateProduct(input: ProductInput): Promise<void> {
  void input;
  return;
}

async function legacyAutoTranslateProduct(input: ProductInput): Promise<void> {
  try {
    const res = await translateProductFields({
      data: {
        name: input.name,
        designation: input.designation ?? "",
        description: input.description ?? "",
      },
    });

    const merge = (obj: Partial<{ name: string; designation: string; description: string }>, key: "name" | "designation" | "description") => {
      const v = obj[key];
      return typeof v === "string" && v.trim().length > 0 ? v : null;
    };

    const name_i18n: Record<string, string> = {};
    const designation_i18n: Record<string, string> = {};
    const description_i18n: Record<string, string> = {};

    for (const lang of ["en", "ar"] as const) {
      const node = res[lang] ?? {};
      const n = merge(node, "name");
      if (n) name_i18n[lang] = n;
      const d = merge(node, "designation");
      if (d) designation_i18n[lang] = d;
      const desc = merge(node, "description");
      if (desc) description_i18n[lang] = desc;
    }

    const payload: { name_i18n?: Record<string, string>; designation_i18n?: Record<string, string>; description_i18n?: Record<string, string> } = {};
    if (Object.keys(name_i18n).length > 0) payload.name_i18n = name_i18n;
    if (Object.keys(designation_i18n).length > 0) payload.designation_i18n = designation_i18n;
    if (Object.keys(description_i18n).length > 0) payload.description_i18n = description_i18n;

    if (Object.keys(payload).length === 0) return;

    const { error } = await supabase.from("products").update(payload).eq("id", input.productId);
    if (error) console.warn("autoTranslateProduct: update failed", error.message);
  } catch (e) {
    console.warn("autoTranslateProduct failed", e);
  }
}

export async function autoTranslateCategory(categoryId: string, name: string): Promise<void> {
  try {
    const res = await translateCategoryName({ data: { name } });
    const i18n: Record<string, string> = {};
    if (res.en) i18n.en = res.en;
    if (res.ar) i18n.ar = res.ar;
    if (Object.keys(i18n).length === 0) return;
    const { error } = await supabase.from("categories").update({ name_i18n: i18n }).eq("id", categoryId);
    if (error) console.warn("autoTranslateCategory: update failed", error.message);
  } catch (e) {
    console.warn("autoTranslateCategory failed", e);
  }
}
void legacyAutoTranslateProduct;
