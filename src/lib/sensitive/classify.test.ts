import { describe, expect, it } from "vitest";
import { classifyLocal, fromAi, type LocalResult } from "./classify";

const c = (name: string, path: string[], description = "", categoryId = "cat") =>
  classifyLocal({ name, description, categoryPath: path, categoryId });
const fin = (r: LocalResult) => (r.kind === "final" ? `${r.decision}:${r.audience ?? "-"}` : "ai");

const UW_H = ["Vêtements", "Sous-vêtements", "Homme"];
const UW_F = ["Vêtements", "Sous-vêtements", "Femme"];

describe("images sensibles — moteur local", () => {
  it("boxer homme en sous-vêtements homme → visible homme seulement", () => {
    expect(fin(c("Boxer homme coton", UW_H))).toBe("sensitive:homme");
  });
  it("boxer femme en sous-vêtements femme → visible femme seulement", () => {
    expect(fin(c("Boxer femme", UW_F))).toBe("sensitive:femme");
  });
  it("boxer pour chien en animaux → normal", () => {
    expect(fin(c("Boxer pour chien", ["Animaux", "Chiens", "Vêtements pour chiens"]))).toBe("normal:-");
  });
  it("lingerie femme → visible femme", () => {
    expect(fin(c("Lingerie femme dentelle", ["Mode", "Lingerie", "Femme"]))).toBe("sensitive:femme");
  });
  it("robe femme → pas sensible juste parce que féminin", () => {
    expect(fin(c("Robe femme longue", ["Vêtements", "Femme", "Robes"]))).toBe("normal:-");
  });
  it("anglais : men's boxer briefs en Underwear > Men", () => {
    expect(fin(c("Men's Boxer Briefs 3-pack", ["Clothing", "Underwear", "Men"]))).toBe("sensitive:homme");
  });
  it("variante d'écriture : SOUTIEN-GORGE sans accent", () => {
    expect(fin(c("SOUTIEN-GORGE push up", ["Vetements", "Lingerie", "Femmes"]))).toBe("sensitive:femme");
  });
  it("catégorie sous-vêtements sans genre, genre dans le nom", () => {
    expect(fin(c("Culotte femme coton", ["Vêtements", "Sous-vêtements"]))).toBe("sensitive:femme");
  });
  it("contradiction catégorie homme / nom femme → IA", () => {
    expect(fin(c("Culotte femme", UW_H))).toBe("ai");
  });
  it("sans description, sans genre → IA", () => {
    expect(fin(c("Slip coton", ["Vêtements", "Sous-vêtements"]))).toBe("ai");
  });
  it("'string' en décoration (guirlande) → normal", () => {
    expect(fin(c("LED String lights", ["Maison", "Décoration", "Noël"]))).toBe("normal:-");
  });
  it("'boxer' en short de sport homme → IA (ambigu)", () => {
    expect(fin(c("Short boxer homme", ["Vêtements", "Homme", "Shorts"]))).toBe("ai");
  });
  it("description longue sans indice → normal", () => {
    expect(fin(c("T-shirt homme", ["Vêtements", "Homme", "T-shirts"], "Coton doux ".repeat(200)))).toBe("normal:-");
  });
  it("mot 'bra' dans 'brand' ne compte pas", () => {
    expect(fin(c("Sac brand new", ["Mode", "Sacs"]))).toBe("normal:-");
  });
  it("t-shirt mal rangé en sous-vêtements homme → IA, pas masqué d'office", () => {
    expect(fin(c("Men's Jacquard Casual Short Sleeve Shirt", ["Mode Homme", "Sous-vêtements"]))).toBe("ai");
  });
  it("chaussures non-slip / slip-on → 'slip' ignoré", () => {
    expect(fin(c("Pointed Men's Slip On Leather Shoes", ["Chaussures", "Homme"]))).toBe("normal:-");
    expect(fin(c("Non-slip baby shoes", ["Chaussures", "Enfant"]))).toBe("normal:-");
  });
  it("règle apprise appliquée sans IA", () => {
    const r = classifyLocal(
      { name: "Short boxer homme", categoryPath: ["Vêtements", "Homme", "Shorts"], categoryId: "X" },
      [{ id: "r1", term: "boxer", category_id: "X", decision: "sensitive", audience: "homme" }],
    );
    expect(fin(r)).toBe("sensitive:homme");
  });
  it("réponse IA : hidden_for female → visible homme ; low → à vérifier", () => {
    expect(fromAi({ sensitive: true, hidden_for: "female", confidence: "high" })).toEqual({ decision: "sensitive", audience: "homme" });
    expect(fromAi({ sensitive: true, hidden_for: "male", confidence: "low" }).decision).toBe("review");
    expect(fromAi({ sensitive: true, hidden_for: "none", confidence: "high" }).decision).toBe("review");
  });
});
