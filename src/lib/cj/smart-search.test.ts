import { describe, it, expect } from "vitest";
import { buildQueryPlan, scoreHit, detectCode } from "./smart-search";

const rel = (q: string, item: any) => scoreHit(buildQueryPlan(q), item).relevant;

describe("recherche CJ — pertinence", () => {
  const tees = [
    "Men's Cotton T-Shirt Short Sleeve", "Women Tshirt Summer Cotton", "Basic Tee Shirt 100% Cotton", "Retro T Shirt Men",
  ];
  it("t-shirt trouve toutes les écritures", () => { for (const n of tees) expect(rel("t-shirt", { name: n })).toBe(true); });
  it("tshirt / t shirt équivalents", () => { expect(rel("tshirt", { name: tees[0] })).toBe(true); expect(rel("t shirt", { name: tees[1] })).toBe(true); });
  it("ordre des mots indifférent + FR→EN", () => {
    for (const q of ["t-shirt coton", "coton t-shirt", "cotton t-shirt", "t-shirt cotton", "tee-shirt coton"]) expect(rel(q, { name: tees[0] })).toBe(true);
  });
  it("le mot t-shirt n'est pas « corrigé » en shirt", () => { expect(buildQueryPlan("t-shirt").queries[0].q).toBe("t-shirt"); expect(rel("t-shirt", { name: "Formal Dress Shirt" })).toBe(false); });
  it("concept absent → hors sujet", () => { expect(rel("t-shirt coton", { name: "Polyester Sport T-Shirt" })).toBe(false); });
  it("français simple", () => { expect(rel("chaussures", { name: "Running Shoes Men" })).toBe(true); });
  it("faute de frappe", () => { expect(rel("chaussurs", { name: "Running Shoes Men" })).toBe(true); });
  it("SKU complet et partiel, PID", () => {
    expect(detectCode("CJYH2788958")?.kind).toBe("sku");
    expect(detectCode("2603160740091638400")?.kind).toBe("pid");
    expect(rel("CJYH2788958", { sku: "CJYH2788958", name: "x" })).toBe(true);
    expect(rel("CJYH278", { sku: "CJYH2788958", name: "x" })).toBe(true);
    expect(rel("2603160740091638400", { pid: "2603160740091638400", name: "x" })).toBe(true);
  });
  it("catégorie couvre un concept", () => { expect(rel("t-shirt homme", { name: "Cotton T-Shirt", categoryPath: "Men's Clothing > Tops" })).toBe(true); });
});
