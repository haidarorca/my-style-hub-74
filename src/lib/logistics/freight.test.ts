import { describe, it, expect } from "vitest";
import {
  computeCbm,
  resolveItemLogistics,
  quoteFreight,
  billingUnitOf,
  buildLineSnapshot,
  type FreightRule,
} from "./freight";

const AIR: FreightRule = {
  id: "air",
  name: "Avion",
  mode: "air",
  pricing_unit: "kg",
  price_per_kg: 6000,
  price_per_cbm: null,
  min_billable_qty: 0,
  volumetric_divisor: 5000,
  use_volumetric: true,
  fixed_fee: 0,
};

const SEA: FreightRule = {
  id: "sea",
  name: "Maritime",
  mode: "sea",
  pricing_unit: "m3",
  price_per_kg: 6000, // piège volontaire : ne doit JAMAIS être utilisé
  price_per_cbm: 250000,
  min_billable_qty: 0,
  volumetric_divisor: 5000,
  use_volumetric: false,
  fixed_fee: 0,
};

const product = { weight_kg: 1, length_cm: 30, width_cm: 20, height_cm: 10 };
const variantA = { weight_kg: 1.0, length_cm: 30, width_cm: 20, height_cm: 10 };
const variantB = { weight_kg: 1.5, length_cm: 35, width_cm: 25, height_cm: 12 };

describe("CBM", () => {
  it("convertit correctement des cm en m³", () => {
    expect(computeCbm(100, 100, 100)).toBe(1); // 1 m³
    expect(computeCbm(30, 20, 10)).toBe(0.006);
    expect(computeCbm(30, 20, null)).toBeNull();
    expect(computeCbm(0, 20, 10)).toBeNull();
  });
});

describe("TEST 1 — chaque variante utilise ses propres données", () => {
  it("prend la variante et ignore totalement le produit parent", () => {
    const a = resolveItemLogistics(product, variantA);
    const b = resolveItemLogistics(product, variantB);
    expect(a.source).toBe("variant");
    expect(b.source).toBe("variant");
    expect(a.weightKg).toBe(1);
    expect(b.weightKg).toBe(1.5);
    expect(a.cbm).toBe(0.006);
    expect(b.cbm).toBe(0.0105);
  });

  it("retombe sur le produit seulement si la variante n'a aucune donnée", () => {
    const r = resolveItemLogistics(product, { weight_kg: null });
    expect(r.source).toBe("product");
    expect(r.weightKg).toBe(1);
  });

  it("ne mélange jamais variante et produit : une variante partielle signale le manque", () => {
    const r = resolveItemLogistics(product, { weight_kg: 2 });
    expect(r.source).toBe("variant");
    expect(r.weightKg).toBe(2);
    expect(r.cbm).toBeNull(); // pas d'emprunt des dimensions du parent
    expect(r.missing).toContain("dimensions");
  });

  it("signale l'absence totale de données au lieu d'inventer", () => {
    const r = resolveItemLogistics(null, null);
    expect(r.source).toBe("none");
    expect(r.missing).toEqual(["poids", "dimensions"]);
    const q = quoteFreight({ logistics: r, quantity: 1, rule: AIR });
    expect(q.ok).toBe(false);
    expect(q.cost).toBe(0);
  });
});

describe("TEST 2 — chaque mode utilise sa propre unité", () => {
  it("avion = kg", () => {
    expect(billingUnitOf(AIR)).toBe("kg");
    const q = quoteFreight({ logistics: resolveItemLogistics(product, variantB), quantity: 1, rule: AIR });
    // réel 1.5 kg vs volumétrique 35*25*12/5000 = 2.1 kg → facturable 2.1
    expect(q.unit).toBe("kg");
    expect(q.volumetricWeightKg).toBe(2.1);
    expect(q.billableQty).toBe(2.1);
    expect(q.cost).toBe(Math.round(2.1 * 6000));
  });

  it("maritime = m³, jamais le tarif au kg", () => {
    expect(billingUnitOf(SEA)).toBe("m3");
    const q = quoteFreight({ logistics: resolveItemLogistics(product, variantB), quantity: 1, rule: SEA });
    expect(q.unit).toBe("m3");
    expect(q.rate).toBe(250000);
    expect(q.volumetricWeightKg).toBe(0);
    expect(q.cost).toBe(Math.round(0.0105 * 250000));
  });

  it("maritime sans tarif m³ refuse de facturer au kg", () => {
    const broken = { ...SEA, price_per_cbm: null };
    const q = quoteFreight({ logistics: resolveItemLogistics(product, variantB), quantity: 1, rule: broken });
    expect(q.ok).toBe(false);
    expect(q.cost).toBe(0);
  });
});

describe("Minimum facturable et diviseur configurable", () => {
  it("applique le minimum facturable", () => {
    const rule = { ...AIR, min_billable_qty: 5 };
    const q = quoteFreight({ logistics: resolveItemLogistics(product, variantA), quantity: 1, rule });
    expect(q.billableQty).toBe(5);
    expect(q.cost).toBe(30000);
  });

  it("le diviseur volumétrique est bien configurable", () => {
    const q6 = quoteFreight({
      logistics: resolveItemLogistics(product, variantB),
      quantity: 1,
      rule: { ...AIR, volumetric_divisor: 6000 },
    });
    expect(q6.volumetricWeightKg).toBe(1.75);
  });

  it("le poids volumétrique peut être désactivé", () => {
    const q = quoteFreight({
      logistics: resolveItemLogistics(product, variantB),
      quantity: 1,
      rule: { ...AIR, use_volumetric: false },
    });
    expect(q.volumetricWeightKg).toBe(0);
    expect(q.billableQty).toBe(1.5);
  });

  it("ajoute les frais fixes", () => {
    const q = quoteFreight({
      logistics: resolveItemLogistics(product, variantA),
      quantity: 1,
      rule: { ...AIR, fixed_fee: 1000 },
    });
    expect(q.cost).toBe(Math.round(1.2 * 6000) + 1000);
  });
});

describe("TEST 6 — plusieurs unités de la même variante", () => {
  it("multiplie poids, CBM et transport par la quantité", () => {
    const logistics = resolveItemLogistics(product, { weight_kg: 2, length_cm: 30, width_cm: 20, height_cm: 10 });
    const q = quoteFreight({ logistics, quantity: 2, rule: { ...AIR, use_volumetric: false } });
    expect(q.realWeightKg).toBe(4);
    expect(q.totalCbm).toBe(0.012);
    expect(q.cost).toBe(24000);

    const snap = buildLineSnapshot({
      logistics,
      quantity: 2,
      quote: q,
      serviceId: "air",
      unitPrice: 10000,
    });
    expect(snap.total_weight_kg).toBe(4);
    expect(snap.total_cbm).toBe(0.012);
    expect(snap.line_total).toBe(10000 * 2 + 24000);
  });
});

describe("TEST 7 — changement de mode par le client", () => {
  it("recalcule intégralement avec la règle du nouveau mode", () => {
    const logistics = resolveItemLogistics(product, variantB);
    const air = quoteFreight({ logistics, quantity: 2, rule: AIR });
    const sea = quoteFreight({ logistics, quantity: 2, rule: SEA });
    expect(air.unit).toBe("kg");
    expect(sea.unit).toBe("m3");
    expect(air.cost).toBe(Math.round(4.2 * 6000));
    expect(sea.cost).toBe(Math.round(0.021 * 250000));
    expect(air.cost).not.toBe(sea.cost);
  });
});

describe("Snapshot de coût et marge", () => {
  it("fige le prix d'achat et le taux utilisés", () => {
    const logistics = resolveItemLogistics(product, variantA);
    const q = quoteFreight({ logistics, quantity: 2, rule: AIR });
    const snap = buildLineSnapshot({
      logistics,
      quantity: 2,
      quote: q,
      serviceId: "air",
      unitPrice: 15000,
      costPrice: 5,
      costCurrency: "USD",
      costRate: 600,
      sku: "CJ-SKU-1",
      variantLabel: "Rouge / 40",
    });
    expect(snap.cost_price_snapshot).toBe(5);
    expect(snap.cost_rate_snapshot).toBe(600);
    expect(snap.purchase_cost_total).toBe(6000); // 5 USD × 600 × 2
    expect(snap.sku_snapshot).toBe("CJ-SKU-1");
    expect(snap.logistics_data_missing).toBe(false);
  });
});

// ── TESTS 3 / 4 / 5 : les données figées ne suivent pas la fiche produit ──
describe("immuabilité des données de commande", () => {
  const rule = {
    id: "air", name: "Avion", mode: "air" as const, pricing_unit: "kg" as const,
    price_per_kg: 6000, price_per_cbm: null, min_billable_qty: 0,
    volumetric_divisor: 5000, use_volumetric: true, fixed_fee: 0,
  };

  it("TEST 3+4+5 — poids, prix et tarif restent ceux de la commande", () => {
    const product: any = { weight_kg: 2, length_cm: 10, width_cm: 10, height_cm: 10, price: 10000 };
    const logistics = resolveItemLogistics(product, null);
    const quote = quoteFreight({ logistics, quantity: 1, rule });
    const snap = buildLineSnapshot({
      logistics, quantity: 1, quote, serviceId: rule.id, unitPrice: 10000,
    });

    // Le vendeur modifie ensuite la fiche produit et l'admin change le tarif.
    product.weight_kg = 3;
    product.price = 20000;
    const newRule = { ...rule, price_per_kg: 9000 };
    const newQuote = quoteFreight({ logistics: resolveItemLogistics(product, null), quantity: 1, rule: newRule });

    expect(snap.unit_weight_kg).toBe(2);          // TEST 3
    expect(snap.shipping_rate_snapshot).toBe(6000); // TEST 5
    expect(snap.freight_cost).toBe(12000);
    expect(newQuote.ok && newQuote.cost).toBe(27000); // le nouveau calcul diffère
    expect(snap.freight_cost).toBe(12000);            // la copie figée n'a pas bougé
  });
});
