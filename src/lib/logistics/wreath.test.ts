import { describe, it, expect } from "vitest";
import { quoteFreight, quoteShipment, resolveItemLogistics } from "./freight";
const avion = { id: "a", name: "Avion", mode: "air" as const, pricing_unit: "kg" as const, price_per_kg: 8000, volumetric_divisor: 5000, use_volumetric: true, min_billable_qty: 0, fixed_fee: 0 };
const rapide = { ...avion, id: "r", price_per_kg: 10000 };
const wreath = resolveItemLogistics({ weight_kg: 9 }, { weight_kg: 0.767, length_cm: 55, width_cm: 30, height_cm: 7 });
describe("Couronne 767 g, 55×30×7 cm", () => {
  it("volume et volumétrique", () => {
    const q = quoteFreight({ logistics: wreath, quantity: 1, rule: avion });
    expect(wreath.cbm).toBe(0.01155);
    expect(q.volumetricWeightKg).toBe(2.31);
    expect(q.billableQty).toBe(2.31);
    expect(q.cost).toBe(18480);
    expect(quoteFreight({ logistics: wreath, quantity: 1, rule: rapide }).cost).toBe(23100);
  });
  it("poids réel seul si le volumétrique est désactivé", () => {
    expect(quoteFreight({ logistics: wreath, quantity: 1, rule: { ...avion, use_volumetric: false } }).cost).toBe(6136);
  });
  it("lourd et compact : poids réel retenu", () => {
    const l = resolveItemLogistics({ weight_kg: 5, length_cm: 20, width_cm: 20, height_cm: 10 });
    expect(quoteFreight({ logistics: l, quantity: 1, rule: avion }).cost).toBe(40000);
  });
  it("petit léger", () => {
    const l = resolveItemLogistics({ weight_kg: 0.1, length_cm: 10, width_cm: 10, height_cm: 5 });
    expect(quoteFreight({ logistics: l, quantity: 1, rule: avion }).cost).toBe(800);
  });
  it("fiche = panier = commande (x2 + autre variante)", () => {
    const small = resolveItemLogistics({}, { weight_kg: 0.37, length_cm: 50, width_cm: 30, height_cm: 7 });
    const s = quoteShipment([{ key: "1", logistics: wreath, quantity: 2 }, { key: "2", logistics: small, quantity: 1 }], avion);
    expect(s.total).toBe(Math.round((4.62 + 2.1) * 8000));
    expect([...s.perLine.values()].reduce((a, b) => a + b, 0)).toBe(s.total);
  });
});
