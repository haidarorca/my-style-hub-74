import { describe, it, expect } from "vitest";
import { quoteShipment, quoteFreight, resolveItemLogistics } from "./freight";

const avion = { id: "a", name: "Avion", mode: "air" as const, pricing_unit: "kg" as const, price_per_kg: 8000, volumetric_divisor: 5000, use_volumetric: true, min_billable_qty: 0, fixed_fee: 0 };
const rapide = { ...avion, id: "r", name: "Le plus rapide", price_per_kg: 10000 };
const L = (w: number | null, d?: [number, number, number]) => resolveItemLogistics({ weight_kg: 9 }, { weight_kg: w, length_cm: d?.[0], width_cm: d?.[1], height_cm: d?.[2] });

describe("quoteShipment (moteur central panier/checkout)", () => {
  it("un seul produit = même montant que la fiche produit", () => {
    const l = L(0.55);
    const one = quoteShipment([{ key: "1", logistics: l, quantity: 1 }], avion);
    expect(one.total).toBe(quoteFreight({ logistics: l, quantity: 1, rule: avion }).cost);
    expect(one.total).toBe(4400);
  });
  it("utilise la variante, pas le parent (9 kg)", () => {
    expect(quoteShipment([{ key: "1", logistics: L(0.5), quantity: 1 }], avion).total).toBe(4000);
  });
  it("quantités et plusieurs variantes : somme exacte, sans double facturation", () => {
    const q = quoteShipment([{ key: "1", logistics: L(0.5), quantity: 3 }, { key: "2", logistics: L(1.2), quantity: 2 }], avion);
    expect(q.total).toBe(Math.round((1.5 + 2.4) * 8000));
    expect([...q.perLine.values()].reduce((a, b) => a + b, 0)).toBe(q.total);
  });
  it("poids volumétrique quand il dépasse le poids réel", () => {
    const q = quoteShipment([{ key: "1", logistics: L(0.2, [40, 30, 20]), quantity: 1 }], avion);
    expect(q.total).toBe(Math.round((40 * 30 * 20 / 5000) * 8000));
  });
  it("mode choisi : Le plus rapide ≠ Avion", () => {
    const lines = [{ key: "1", logistics: L(1), quantity: 1 }];
    expect(quoteShipment(lines, rapide).total).toBe(10000);
    expect(quoteShipment(lines, avion).total).toBe(8000);
  });
  it("minimum et frais fixes appliqués UNE seule fois par envoi", () => {
    const rule = { ...avion, min_billable_qty: 1, fixed_fee: 2000 };
    const q = quoteShipment([{ key: "1", logistics: L(0.2), quantity: 1 }, { key: "2", logistics: L(0.3), quantity: 1 }], rule);
    expect(q.total).toBe(1 * 8000 + 2000); // et non 2 × (8000 + 2000)
    expect([...q.perLine.values()].reduce((a, b) => a + b, 0)).toBe(q.total);
  });
  it("répartition arrondie : somme des lignes = total au franc près", () => {
    const q = quoteShipment([1, 2, 3].map((k) => ({ key: String(k), logistics: L(0.333), quantity: 1 })), { ...avion, price_per_kg: 7777 });
    expect([...q.perLine.values()].reduce((a, b) => a + b, 0)).toBe(q.total);
  });
  it("mode au m³", () => {
    const sea = { id: "s", name: "Mer", mode: "sea" as const, pricing_unit: "m3" as const, price_per_cbm: 300000, min_billable_qty: 0.1, fixed_fee: 0 };
    const q = quoteShipment([{ key: "1", logistics: L(1, [50, 40, 30]), quantity: 2 }], sea);
    expect(q.total).toBe(Math.round(0.12 * 300000));
  });
});
