import { describe, expect, it } from "vitest";
import { parseSupplierDescription, toReadableText } from "./description";
import { asImageList, orderSupplierImages } from "./image-order";

describe("parseSupplierDescription", () => {
  it("extrait les images, sépare les caractéristiques, aucun HTML", () => {
    const html = `<div><p><b>Product information:</b><br/>Material: Cloth<br/>Style: Casual</p>
      <p><b>Overview:</b><br/>Comfortable and light shoes for daily wear.</p>
      <p>Product Image:<img src="https://cf.cjdropshipping.com/a.jpg" /><img src='https://cf.cjdropshipping.com/b.jpg'></p></div>`;
    const r = parseSupplierDescription(html);
    expect(r.imageUrls).toEqual(["https://cf.cjdropshipping.com/a.jpg", "https://cf.cjdropshipping.com/b.jpg"]);
    expect(r.html).toBe("Comfortable and light shoes for daily wear.");
    expect(r.html).not.toMatch(/[<>]/);
    expect(r.specs).toEqual([
      { label: "Material", value: "Cloth" },
      { label: "Style", value: "Casual" },
    ]);
  });

  it("regroupe les rubriques et les guides des tailles", () => {
    const r = parseSupplierDescription(
      `<p>Packing list:<br/>Shoes X1<br/>Size information:<br/>US EUR UK<br/>(mm)<br/>7 40 6</p>`,
    );
    expect(r.specs[0]).toEqual({ label: "Packing list", value: "Shoes X1" });
    expect(r.specs[1]?.rows).toEqual([["US", "EUR", "UK"], ["(mm)"], ["7", "40", "6"]]);
    expect(r.html).toBeNull();
  });

  it("ne laisse aucune référence fournisseur ni ligne logistique", () => {
    const r = parseSupplierDescription(
      `<p>Shipped by <a href="https://cjdropshipping.com">CJdropshipping</a> nicely<br/>Fastest shipping time: please consult customer service</p>`,
    );
    expect(r.text.toLowerCase()).not.toContain("cjdropshipping");
    expect(r.text).not.toMatch(/shipping time/i);
  });

  it("gère une description vide", () => {
    expect(parseSupplierDescription(null)).toEqual({ imageUrls: [], html: null, text: "", specs: [] });
  });

  it("affichage défensif : HTML ancien converti en texte", () => {
    expect(toReadableText("<p>Hello<br />world</p><p><b></b></p>")).toBe("Hello\nworld");
  });
});

describe("orderSupplierImages", () => {
  it("décode productImage en texte JSON et place l'image principale en premier", () => {
    const main = '["https://x.com/main.jpg","https://x.com/2.jpg"]';
    expect(asImageList(main)).toEqual(["https://x.com/main.jpg", "https://x.com/2.jpg"]);
    expect(orderSupplierImages(main, ["https://x.com/3.jpg", "https://x.com/main.jpg?v=1"], ["https://x.com/d.jpg"])).toEqual([
      "https://x.com/main.jpg",
      "https://x.com/2.jpg",
      "https://x.com/3.jpg",
      "https://x.com/d.jpg",
    ]);
  });
});
