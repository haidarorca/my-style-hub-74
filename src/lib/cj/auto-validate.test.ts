import { describe, it, expect } from "vitest";
import { evaluateCjAutoValidation } from "./auto-validate";

const ok = {
  name: "Canvas shoes", galleryCount: 5, costPrice: 4.2, salePrice: 5000, variantsTotal: 2, variantsImported: 2,
  variants: [{ weightKg: 0.5, cbm: 0.002, sku: "A" }, { weightKg: 0.6, cbm: 0.002, sku: "B" }],
  sku: "CJ123", categoryId: "c1", publicClean: true, descriptionHtml: "<p>Belle chaussure</p>",
};

describe("validation automatique CJ", () => {
  it("produit conforme → aucune raison", () => expect(evaluateCjAutoValidation(ok)).toEqual([]));
  it("produit incomplet → raisons précises", () => {
    const r = evaluateCjAutoValidation({
      ...ok, galleryCount: 0, categoryId: null, costPrice: null,
      variants: [{ weightKg: null, cbm: 0.002, sku: "A" }, ok.variants[1]],
      descriptionHtml: "voir https://cjdropshipping.com/x",
    });
    expect(r).toEqual(expect.arrayContaining([
      "Image principale absente", "Prix d'achat absent", "Poids manquant sur 1 variante(s)",
      "Catégorie à attribuer", "Description non nettoyée (lien fournisseur)",
    ]));
  });
});
