import { describe, expect, it } from "vitest";
import { buildCategoryTree, classToDecision, finalDecision, matchRule, pickWinner, type BuilderRule } from "./rules-engine";

// Mode > Vêtements Femme > Maillots de bain ; Mode > Vêtements Homme > Sous-vêtements ; Maison
const tree = buildCategoryTree([
  { id: "mode", parent_id: null }, { id: "femme", parent_id: "mode" }, { id: "maillots", parent_id: "femme" },
  { id: "homme", parent_id: "mode" }, { id: "sousvet", parent_id: "homme" }, { id: "maison", parent_id: null },
]);
const R = (o: Partial<BuilderRule>): BuilderRule => ({
  id: o.id ?? "r", category_id: null, scope: "branch", keywords: [], exclusions: [], fields: ["name", "designation"], source_lang: null,
  match_mode: "word", combine: "any", classification: "femme", protection: "placeholder", priority: 0, origin: "MANUAL", ...o,
});

describe("générateur de règles de sensibilité", () => {
  it("1. règle Sensible Femme", () => {
    const r = R({ category_id: "maillots", keywords: ["bikini"] });
    const w = pickWinner({ id: "p", name: "Sexy Bikini Set", category_id: "maillots" }, [r], tree);
    expect(classToDecision(w!.rule.classification)).toEqual({ decision: "sensitive", audience: "femme" });
  });
  it("2. règle Sensible Homme", () => {
    const r = R({ category_id: "sousvet", keywords: ["boxer", "slip", "brief", "caleçon"], classification: "homme" });
    const w = pickWinner({ id: "p", name: "Caleçon coton homme", category_id: "sousvet", source_lang: "fr" }, [r], tree);
    expect(w?.term).toBe("calecon");
    expect(classToDecision(w!.rule.classification).audience).toBe("homme");
  });
  it("3. règle par catégorie sans mot-clé (branche vs seule)", () => {
    const branch = R({ category_id: "femme" });
    const exact = R({ category_id: "femme", scope: "exact" });
    const p = { id: "p", name: "Robe longue", category_id: "maillots" };
    expect(matchRule(p, branch, tree).matched).toBe(true);
    expect(matchRule(p, exact, tree).matched).toBe(false);
    expect(matchRule({ ...p, category_id: "homme" }, branch, tree).matched).toBe(false);
  });
  it("4. règle par mots seuls (toutes catégories, pluriels, accents)", () => {
    const r = R({ keywords: ["soutien-gorge"] });
    expect(matchRule({ id: "p", name: "Lot de 3 SOUTIENS-GORGE", category_id: "maison" }, R({ keywords: ["soutiens-gorge"] }), tree).matched).toBe(true);
    expect(matchRule({ id: "p", name: "Soutien-Gorge dentelle", category_id: null }, r, tree).matched).toBe(true);
    expect(matchRule({ id: "p", name: "Bikinis", category_id: null }, R({ keywords: ["bikini"] }), tree).matched).toBe(true);
  });
  it("5. catégorie + mots : il faut les deux", () => {
    const r = R({ category_id: "femme", keywords: ["lingerie"] });
    expect(matchRule({ id: "p", name: "Lace lingerie set", category_id: "maillots" }, r, tree).matched).toBe(true);
    expect(matchRule({ id: "p", name: "Lace lingerie set", category_id: "maison" }, r, tree).matched).toBe(false);
    expect(matchRule({ id: "p", name: "Robe d'été", category_id: "maillots" }, r, tree).matched).toBe(false);
  });
  it("6. exclusions sans faux positifs", () => {
    const r = R({ keywords: ["string"], exclusions: ["string lights", "string organizer"] });
    expect(matchRule({ id: "p", name: "LED String Lights 10m", category_id: "maison" }, r, tree).matched).toBe(false);
    expect(matchRule({ id: "p", name: "String organizer box", category_id: "maison" }, r, tree).matched).toBe(false);
    expect(matchRule({ id: "p", name: "Lace string thong", category_id: "maillots" }, r, tree).matched).toBe(true);
  });
  it("7. produit CJ en anglais + filtre langue", () => {
    const r = R({ keywords: ["swimsuit"], source_lang: "en" });
    expect(matchRule({ id: "p", name: "Women Two-Piece Swimsuit", category_id: "maillots", source_lang: "en" }, r, tree).matched).toBe(true);
    expect(matchRule({ id: "p", name: "Maillot swimsuit pour femme et fille", category_id: "maillots", source_lang: "fr" }, r, tree).matched).toBe(false);
  });
  it("8. produit dans une autre langue (chinois) détecté sur le texte source", () => {
    const r = R({ keywords: ["比基尼"], source_lang: "zh" });
    expect(matchRule({ id: "p", name: "性感比基尼泳衣", category_id: "maillots", source_lang: "en" }, r, tree).matched).toBe(true);
    expect(matchRule({ id: "p", name: "Bikini", category_id: "maillots" }, r, tree).matched).toBe(false);
  });
  it("9. décision manuelle prioritaire sur toute règle ; règle manuelle > règle IA ; spécifique > générale", () => {
    const general = R({ id: "g", category_id: "mode", classification: "normal" });
    const specific = R({ id: "s", category_id: "maillots", classification: "femme" });
    const aiRule = R({ id: "a", category_id: "maillots", scope: "exact", keywords: ["bikini"], classification: "review", origin: "AI" });
    const p = { id: "p", name: "Bikini", category_id: "maillots" };
    const w = pickWinner(p, [general, specific, aiRule], tree);
    expect(w?.rule.id).toBe("s");
    expect(finalDecision({ rule: w })).toMatchObject({ decision: "sensitive", source: "RULE" });
    expect(finalDecision({ manual: { decision: "normal", audience: null }, rule: w })).toMatchObject({ decision: "normal", source: "MANUAL" });
    expect(pickWinner({ ...p, category_id: "homme" }, [general, specific], tree)?.rule.id).toBe("g");
  });
});
