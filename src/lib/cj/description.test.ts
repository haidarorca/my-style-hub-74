import { describe, expect, it } from "vitest";
import { parseSupplierDescription } from "./description";

describe("parseSupplierDescription", () => {
  it("extrait les images et les retire de la description", () => {
    const html = `<div>Product information:<br/>Material: Cloth<br/>Product Image:
      <img src="https://cf.cjdropshipping.com/a.jpg" />
      <img src='https://cf.cjdropshipping.com/b.jpg'></div>`;
    const r = parseSupplierDescription(html);
    expect(r.imageUrls).toEqual([
      "https://cf.cjdropshipping.com/a.jpg",
      "https://cf.cjdropshipping.com/b.jpg",
    ]);
    expect(r.html).not.toMatch(/<img/i);
    expect(r.html).not.toMatch(/https?:/i);
    expect(r.text).toContain("Material: Cloth");
    expect(r.text.toLowerCase()).not.toContain("product image");
  });

  it("ne laisse aucune référence fournisseur", () => {
    const r = parseSupplierDescription(
      `<p>Shipped by <a href="https://cjdropshipping.com">CJdropshipping</a> warehouse</p>`,
    );
    expect(r.text.toLowerCase()).not.toContain("cjdropshipping");
    expect(r.text).toContain("Shipped by");
  });

  it("renvoie null quand il ne reste que des images", () => {
    const r = parseSupplierDescription(`<div><img src="https://x.com/a.jpg"></div>`);
    expect(r.html).toBeNull();
    expect(r.imageUrls).toHaveLength(1);
  });

  it("gère une description vide", () => {
    expect(parseSupplierDescription(null)).toEqual({ imageUrls: [], html: null, text: "" });
  });
});
