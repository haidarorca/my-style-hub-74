import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BackButton } from "@/components/layout/BackButton";

import { Minus, Plus, Trash2, Store, ShoppingBag, MapPin, Crosshair, Check, MessageCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCart, clearGuestCart, GUEST_CART_KEY } from "@/hooks/use-cart";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { buildWhatsAppMessage, whatsappUrlTo, type WhatsAppLine } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import { pickI18n } from "@/lib/i18n/localized";
import { CountrySelect } from "@/components/CountrySelect";
import { useDeliveryCountry } from "@/hooks/use-delivery-country";
import { useDisplayPriceLines } from "@/hooks/use-display-prices";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { createCheckoutOrder } from "@/lib/checkout.functions";
import { getPublicVendorContacts } from "@/lib/support.functions";
import { listShippingServices, type ShippingService } from "@/lib/shipping-services.functions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plane } from "lucide-react";

interface DispatchGroup {
  id: string;
  label: string;
  whatsappNumber: string | null;
  message: string;
  isAdmin: boolean;
}

const buildAddressSchema = (t: (k: string) => string) =>
  z.object({
    label: z.string().trim().min(1, t("checkout.label_required")).max(50),
    full_name: z.string().trim().min(2, t("checkout.name_too_short")).max(100),
    phone: z.string().trim().min(7, t("checkout.phone_invalid")).max(20).regex(/^[+0-9 ()-]+$/, t("checkout.phone_invalid")),
    address: z.string().trim().min(3, t("checkout.address_required")).max(300),
    city: z.string().trim().min(2, t("checkout.city_required")).max(100),
    note: z.string().trim().max(500).optional().or(z.literal("")),
  });

interface Address {
  id: string;
  label: string;
  full_name: string;
  phone: string;
  address: string;
  city: string;
  destination_country_id: string | null;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
  is_default: boolean;
}

export const Route = createFileRoute("/cart")({
  component: CartPage,
});

function CartPage() {
  const { user, profile } = useAuth();
  const { items, updateQuantity, removeItem, updateLineShipping, refresh } = useCart();
  const { lang, t } = useI18n();
  const { countryId: destinationCountryId, setCountryId: setDestinationCountryId } = useDeliveryCountry();
  const settings = useSiteSettings();
  const router = useRouter();
  const createOrder = useServerFn(createCheckoutOrder);
  const fetchVendorContacts = useServerFn(getPublicVendorContacts);
  const fetchShippingServices = useServerFn(listShippingServices);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [dispatch, setDispatch] = useState<{ groups: DispatchGroup[]; orderId: string } | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  // Choix transport séparés : KNOWN figé immédiatement / UNKNOWN seulement préférence client.
  const [knownShippingServiceId, setKnownShippingServiceId] = useState<string | null>(null);
  const [unknownShippingServiceId, setUnknownShippingServiceId] = useState<string | null>(null);
  const [shippingServices, setShippingServices] = useState<ShippingService[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"saved" | "new">("saved");
  const [newForm, setNewForm] = useState({
    label: t("checkout.default_label_home"),
    full_name: "",
    phone: "",
    address: "",
    city: "",
    note: "",
    latitude: null as number | null,
    longitude: null as number | null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const newAddressSchema = useMemo(() => buildAddressSchema(t), [t]);
  const [locating, setLocating] = useState(false);
  const priceLines = useMemo(
    () => items
      .map((it: any) => ({ productId: it.products?.id ?? it.product_id, variantId: it.variant_id ?? null }))
      .filter((line) => !!line.productId),
    [items],
  );
  const displayPriceLines = useDisplayPriceLines(priceLines);

  const loadAddresses = async () => {
    if (!user) {
      setAddresses([]);
      setMode("new");
      return;
    }
    const { data } = await (supabase as any)
      .from("customer_addresses")
      .select("*")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    const list = (data ?? []) as Address[];
    setAddresses(list);
    if (list.length > 0) {
      setMode("saved");
      setSelectedId(list[0].id);
      if (list[0].destination_country_id) setDestinationCountryId(list[0].destination_country_id);
    } else {
      setMode("new");
      setNewForm((f) => ({
        ...f,
        full_name: profile?.full_name ?? "",
        phone: profile?.phone ?? "",
      }));
    }
  };

  useEffect(() => {
    if (checkoutOpen) void loadAddresses();
    // eslint-disable-next-line
  }, [checkoutOpen]);

  useEffect(() => {
    if (!selectedId || mode !== "saved") return;
    const selected = addresses.find((a) => a.id === selectedId);
    if (selected?.destination_country_id) setDestinationCountryId(selected.destination_country_id);
  }, [addresses, mode, selectedId, setDestinationCountryId]);

  // Guests can browse the cart and check out as a guest.
  // The dialog forces "new address" mode when there is no user.

  // ── Two-level grouping: logistics type → vendor → items ──
  // Scalable architecture: future logistics types (turkey, express, maritime)
  // can be added as new groups without changing the UI structure.
  type VendorGroup = { shopName: string; vendorId: string; items: any[] };
  // 3 catégories STRICTES — alignées avec line-kind.ts.
  type LogisticsType = "LOCAL" | "IMPORT_KNOWN_WEIGHT" | "IMPORT_UNKNOWN_WEIGHT";
  type LogisticsSection = {
    type: LogisticsType;
    label: string;
    sublabel: string;
    icon: typeof Plane;
    color: string;
    borderColor: string;
    bgColor: string;
    headerBg: string;
    vendorGroups: Map<string, VendorGroup>;
  };

  // Catégorie figée :
  //   LOCAL                  : pas d'import (destination = source ou info absente).
  //   IMPORT_KNOWN_WEIGHT    : import + poids produit > 0 → fret figé immédiatement.
  //   IMPORT_UNKNOWN_WEIGHT  : import + pas de poids → fret après pesée uniquement.
  const getItemLogisticsType = (it: any): LogisticsType => {
    const src = it?.products?.profiles?.source_country_id ?? null;
    if (!destinationCountryId || !src || src === destinationCountryId) return "LOCAL";
    const w = Number(it?.products?.weight_kg ?? 0);
    return w > 0 ? "IMPORT_KNOWN_WEIGHT" : "IMPORT_UNKNOWN_WEIGHT";
  };

  const logisticsGroups = useMemo(() => {
    const sections = new Map<LogisticsType, LogisticsSection>();
    sections.set("IMPORT_KNOWN_WEIGHT", {
      type: "IMPORT_KNOWN_WEIGHT",
      label: "Import — poids déclaré",
      sublabel: "Fret international figé maintenant, payé avec la commande.",
      icon: Plane,
      color: "text-blue-700",
      borderColor: "border-blue-200",
      bgColor: "bg-blue-50/50",
      headerBg: "bg-blue-100/60",
      vendorGroups: new Map(),
    });
    sections.set("IMPORT_UNKNOWN_WEIGHT", {
      type: "IMPORT_UNKNOWN_WEIGHT",
      label: "Import — poids inconnu",
      sublabel: "Fret calculé après pesée du colis. Aucun montant facturé maintenant.",
      icon: Plane,
      color: "text-orange-700",
      borderColor: "border-orange-200",
      bgColor: "bg-orange-50/50",
      headerBg: "bg-orange-100/60",
      vendorGroups: new Map(),
    });
    sections.set("LOCAL", {
      type: "LOCAL",
      label: "Produits locaux",
      sublabel: "Livraison simple — aucun fret international.",
      icon: Store,
      color: "text-emerald-700",
      borderColor: "border-emerald-200",
      bgColor: "bg-emerald-50/30",
      headerBg: "bg-emerald-100/50",
      vendorGroups: new Map(),
    });

    for (const it of items) {
      const p = (it as any).products;
      if (!p) continue;
      const logisticsType = getItemLogisticsType(it);
      const section = sections.get(logisticsType)!;
      const profileShop = p.profiles;
      const shopName = profileShop?.shop_name || profileShop?.full_name || t("product.shop");
      const vendorKey = p.vendor_id;
      if (!section.vendorGroups.has(vendorKey)) {
        section.vendorGroups.set(vendorKey, { shopName, vendorId: vendorKey, items: [] });
      }
      section.vendorGroups.get(vendorKey)!.items.push(it);
    }
    return sections;
  }, [items, destinationCountryId, t]);

  // Flat vendor groups (backward compat for existing logic)
  const groups = new Map<string, VendorGroup>();
  for (const section of logisticsGroups.values()) {
    for (const [key, vg] of section.vendorGroups) {
      if (!groups.has(key)) groups.set(key, vg);
      else groups.get(key)!.items.push(...vg.items);
    }
  }

  // === Selection state (defaults: tout coché) ===
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const allIds = useMemo(() => items.map((it: any) => it.id as string), [items]);
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set<string>();
      const known = new Set(allIds);
      // keep previously selected ids that still exist
      prev.forEach((id) => { if (known.has(id)) next.add(id); });
      // auto-select any newly added item
      allIds.forEach((id) => { if (!prev.has(id) && !next.has(id)) next.add(id); });
      // first load: prev is empty -> select all
      if (prev.size === 0) allIds.forEach((id) => next.add(id));
      return next;
    });
  }, [allIds]);

  const isSelected = (id: string) => selectedIds.has(id);
  const toggleItem = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };
  const groupSelectionState = (groupItems: any[]): boolean | "indeterminate" => {
    const total = groupItems.length;
    const sel = groupItems.filter((it) => selectedIds.has(it.id)).length;
    if (sel === 0) return false;
    if (sel === total) return true;
    return "indeterminate";
  };
  const toggleGroup = (groupItems: any[], checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      groupItems.forEach((it) => { if (checked) next.add(it.id); else next.delete(it.id); });
      return next;
    });
  };

  const selectedItems = useMemo(
    () => items.filter((it: any) => selectedIds.has(it.id)),
    [items, selectedIds],
  );
  const preferredShippingServiceId = useMemo(() => {
    for (const it of selectedItems as any[]) {
      const saved = it.shipping_service_id ?? it.customization?.__shipping_service_id;
      if (saved) return String(saved);
    }
    return null;
  }, [selectedItems]);
  const selectedCount = selectedItems.reduce((s, it: any) => s + (it.quantity ?? 0), 0);

  // RÈGLE UNIQUE : un article est international si destination ≠ source vendeur.
  // Cas Chine → Chine = local (pas de circuit pesée). Cas Chine → Sénégal = international.
  const isItemInternational = useCallback((it: any): boolean => {
    const src = it?.products?.profiles?.source_country_id ?? null;
    if (!destinationCountryId || !src) return false;
    return src !== destinationCountryId;
  }, [destinationCountryId]);

  /** Article international SANS poids déclaré → calcul après pesée (pas d'estimation). */
  const itemNeedsWeighing = useCallback((it: any): boolean => {
    if (!isItemInternational(it)) return false;
    const w = Number(it?.products?.weight_kg ?? 0);
    return !w || w <= 0;
  }, [isItemInternational]);

  // Global flag: does the selected cart contain ANY international items?
  const { hasIntlItems, sourceCountryId } = useMemo(() => {
    const intlItems = selectedItems.filter(isItemInternational);
    const has = intlItems.length > 0;
    const sourceIds = Array.from(new Set(
      intlItems.map((it: any) => it.products?.profiles?.source_country_id).filter(Boolean)
    ));
    const sourceId = sourceIds.length === 1 ? sourceIds[0] : null;
    return { hasIntlItems: has, sourceCountryId: sourceId };
  }, [selectedItems, isItemInternational]);

  const selectedKnownService = useMemo(
    () => shippingServices.find((service) => service.id === knownShippingServiceId) ?? null,
    [shippingServices, knownShippingServiceId],
  );
  const selectedUnknownService = useMemo(
    () => shippingServices.find((service) => service.id === unknownShippingServiceId) ?? null,
    [shippingServices, unknownShippingServiceId],
  );

  // Charge la liste des services (source vendeur → destination client) une seule fois.
  useEffect(() => {
    if (!hasIntlItems || !destinationCountryId) {
      setShippingServices([]);
      setKnownShippingServiceId(null);
      setUnknownShippingServiceId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const services = await fetchShippingServices({
          data: {
            source_country_id: sourceCountryId,
            destination_country_id: destinationCountryId,
            only_enabled: true,
          },
        });
        if (cancelled) return;
        setShippingServices(services);
        const cheapest = [...services].sort(
          (a, b) => Number(a.price_per_kg ?? Infinity) - Number(b.price_per_kg ?? Infinity),
        )[0] ?? null;
        const preferred = preferredShippingServiceId
          ? services.find((s) => s.id === preferredShippingServiceId)
          : null;
        // KNOWN : auto-sélection du moins cher (le client peut changer ensuite).
        setKnownShippingServiceId((prev) => {
          if (prev && services.some((s) => s.id === prev)) return prev;
          return (preferred ?? cheapest)?.id ?? null;
        });
        // UNKNOWN : pas d'auto-sélection (force le choix conscient). Garde celui d'avant si valide.
        setUnknownShippingServiceId((prev) =>
          prev && services.some((s) => s.id === prev) ? prev : (preferred?.id ?? null),
        );
      } catch (e) {
        console.error("[cart] load shipping services failed", e);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasIntlItems, destinationCountryId, sourceCountryId, preferredShippingServiceId]);

  const pricesReady = displayPriceLines.isReady;
  const fallbackUnitPrice = (it: any) => Number(it.product_variants?.price_override ?? it.products?.price ?? 0);
  const unitPrice = (it: any) => {
    const productId = it.products?.id ?? it.product_id;
    const key = `${productId}:${it.variant_id ?? ""}`;
    const resolved = displayPriceLines.get(key)?.final_price;
    return resolved ?? (pricesReady ? fallbackUnitPrice(it) : 0);
  };
  const grandTotal = selectedItems.reduce((s, it: any) => s + unitPrice(it) * it.quantity, 0);

  // ── Détection des sections présentes dans la sélection ──
  const selectedHasKnown = useMemo(
    () => selectedItems.some((it: any) => getItemLogisticsType(it) === "IMPORT_KNOWN_WEIGHT"),
    [selectedItems, destinationCountryId],
  );
  const selectedHasUnknown = useMemo(
    () => selectedItems.some((it: any) => getItemLogisticsType(it) === "IMPORT_UNKNOWN_WEIGHT"),
    [selectedItems, destinationCountryId],
  );

  // Fret par ligne — UNIQUEMENT pour IMPORT_KNOWN_WEIGHT, avec le service KNOWN choisi.
  // UNKNOWN n'engendre AUCUN fret avant pesée (règle stricte).
  const lineFreight = useCallback((it: any): number => {
    if (getItemLogisticsType(it) !== "IMPORT_KNOWN_WEIGHT") return 0;
    const svc = selectedKnownService;
    const rate = Number(svc?.price_per_kg ?? 0);
    if (rate <= 0) return 0;
    const p = it.products ?? {};
    const w = Number(p.weight_kg ?? 0);
    const l = Number(p.length_cm ?? 0);
    const wd = Number(p.width_cm ?? 0);
    const h = Number(p.height_cm ?? 0);
    const vol = l > 0 && wd > 0 && h > 0 ? (l * wd * h) / 5000 : 0;
    const kg = Math.max(w, vol) * (it.quantity ?? 1);
    return Math.round(kg * rate);
  }, [selectedKnownService, destinationCountryId]);

  // Coût transport cumulé du panier (KNOWN uniquement — UNKNOWN n'est JAMAIS facturé ici).
  const cartFreightTotal = useMemo(
    () => selectedItems.reduce((s, it: any) => s + lineFreight(it), 0),
    [selectedItems, lineFreight],
  );


  const fmtDelay = (s: ShippingService) =>
    s.delay_min_days && s.delay_max_days
      ? `${s.delay_min_days}-${s.delay_max_days} jours`
      : s.delay_max_days
        ? `~${s.delay_max_days} jours`
        : "délai variable";

  // Estimation par service pour les SEULS articles KNOWN (poids déclaré).
  const knownServiceEstimates = useMemo(() => {
    const m = new Map<string, number>();
    if (!selectedHasKnown) return m;
    let kg = 0;
    for (const it of selectedItems) {
      if (getItemLogisticsType(it) !== "IMPORT_KNOWN_WEIGHT") continue;
      const p = it.products ?? {};
      const real = Number(p.weight_kg ?? 0);
      const l = Number(p.length_cm ?? 0);
      const w = Number(p.width_cm ?? 0);
      const h = Number(p.height_cm ?? 0);
      const vol = l > 0 && w > 0 && h > 0 ? (l * w * h) / 5000 : 0;
      kg += Math.max(real, vol) * (it.quantity ?? 1);
    }
    if (kg <= 0) return m;
    for (const s of shippingServices) {
      const rate = Number(s.price_per_kg ?? 0);
      if (rate > 0) m.set(s.id, Math.round(kg * rate));
    }
    return m;
  }, [selectedHasKnown, selectedItems, shippingServices, destinationCountryId]);

  /** Sélecteur KNOWN — affiche un prix figé total par service. */
  const renderKnownShippingSelector = () => {
    if (!selectedHasKnown) return null;
    if (!destinationCountryId) {
      return <p className="text-xs text-destructive">Choisissez d'abord le pays de livraison.</p>;
    }
    if (shippingServices.length === 0) {
      return <p className="text-xs text-destructive">Aucun service de transport disponible.</p>;
    }
    return (
      <div className="space-y-2 rounded-xl border border-blue-300 bg-blue-50/40 p-3">
        <Label className="flex items-center gap-2 text-sm font-semibold text-blue-800">
          <Plane className="h-4 w-4" />
          Mode de transport (poids déclaré) *
        </Label>
        <p className="text-[11px] text-muted-foreground">
          Coût figé immédiatement et payé avec la commande.
        </p>
        <div className="space-y-1.5">
          {shippingServices.map((s) => {
            const est = knownServiceEstimates.get(s.id);
            const isSel = knownShippingServiceId === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setKnownShippingServiceId(s.id)}
                className={cn(
                  "w-full text-left rounded-lg border p-2.5 transition-colors",
                  isSel ? "border-blue-500 bg-blue-100/60" : "border-border bg-background hover:bg-accent",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{s.name}</div>
                    <div className="text-[11px] text-muted-foreground">{fmtDelay(s)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    {est != null ? (
                      <div className="text-sm font-bold text-blue-700">{est.toLocaleString("fr-FR")} FCFA</div>
                    ) : (
                      <div className="text-[11px] text-muted-foreground">—</div>
                    )}
                    {isSel && (
                      <div className="text-[10px] text-emerald-700 font-medium mt-0.5 flex items-center justify-end gap-0.5">
                        <Check className="h-3 w-3" /> Sélectionné
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  /** Sélecteur UNKNOWN — UN SEUL choix, affiche FCFA/kg, JAMAIS de montant total. */
  const renderUnknownShippingSelector = () => {
    if (!selectedHasUnknown) return null;
    if (!destinationCountryId) {
      return <p className="text-xs text-destructive">Choisissez d'abord le pays de livraison.</p>;
    }
    if (shippingServices.length === 0) {
      return <p className="text-xs text-destructive">Aucun service de transport disponible.</p>;
    }
    return (
      <div className="space-y-2 rounded-xl border border-orange-300 bg-orange-50/40 p-3">
        <Label className="flex items-center gap-2 text-sm font-semibold text-orange-800">
          <Plane className="h-4 w-4" />
          Mode de transport (poids inconnu) *
        </Label>
        <p className="text-[11px] text-muted-foreground">
          Le coût sera calculé après pesée du colis. Aucun montant n'est facturé maintenant.
        </p>
        <div className="space-y-1.5">
          {shippingServices.map((s) => {
            const rate = Number(s.price_per_kg ?? 0);
            const isSel = unknownShippingServiceId === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setUnknownShippingServiceId(s.id)}
                className={cn(
                  "w-full text-left rounded-lg border p-2.5 transition-colors",
                  isSel ? "border-orange-500 bg-orange-100/60" : "border-border bg-background hover:bg-accent",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{s.name}</div>
                    <div className="text-[11px] text-muted-foreground">{fmtDelay(s)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    {rate > 0 ? (
                      <div className="text-sm font-bold text-orange-700">
                        {rate.toLocaleString("fr-FR")} FCFA/kg
                      </div>
                    ) : (
                      <div className="text-[11px] text-muted-foreground">tarif sur devis</div>
                    )}
                    {isSel && (
                      <div className="text-[10px] text-emerald-700 font-medium mt-0.5 flex items-center justify-end gap-0.5">
                        <Check className="h-3 w-3" /> Sélectionné
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };


  const customizationSummary = (c: any): string | null => {
    if (!c) return null;
    const parts: string[] = [];
    if (c.text) parts.push(`${t("product.your_text")} « ${c.text} »`);
    if (c.font) parts.push(`${t("product.font")} ${c.font}`);
    if (c.color) parts.push(`${t("product.color")} ${c.color}`);
    if (c.image_url) parts.push(t("product.your_image"));
    return parts.length ? parts.join(", ") : null;
  };
  const cleanCustomization = (c: any) => {
    if (!c || typeof c !== "object") return null;
    const { __shipping_service_id, ...rest } = c;
    return Object.keys(rest).length > 0 ? rest : null;
  };
  const useGeolocation = () => {
    if (!navigator.geolocation) return toast.error(t("common.location_unavailable"));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNewForm((f) => ({ ...f, latitude: pos.coords.latitude, longitude: pos.coords.longitude }));
        setLocating(false);
        toast.success(t("common.location_saved"));
      },
      () => { setLocating(false); toast.error(t("common.location_failed")); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const resolveAddress = async (): Promise<Address | null> => {
    if (user && mode === "saved") {
      return addresses.find((a) => a.id === selectedId) ?? null;
    }
    const parsed = newAddressSchema.safeParse(newForm);
    if (!parsed.success) {
      const e: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const k = i.path[0] as string;
        if (!e[k]) e[k] = i.message;
      }
      setErrors(e);
      return null;
    }
    setErrors({});

    // Guest: don't persist an address row, just return form data
    if (!user) {
      return {
        id: "guest",
        label: parsed.data.label,
        full_name: parsed.data.full_name,
        phone: parsed.data.phone,
        address: parsed.data.address,
        city: parsed.data.city,
        destination_country_id: destinationCountryId,
        latitude: newForm.latitude,
        longitude: newForm.longitude,
        note: parsed.data.note || null,
        is_default: false,
      };
    }

    const payload = {
      ...parsed.data,
      note: parsed.data.note || null,
      latitude: newForm.latitude,
      longitude: newForm.longitude,
      user_id: user.id,
      is_default: addresses.length === 0,
      destination_country_id: destinationCountryId,
    };
    const { data, error } = await (supabase as any)
      .from("customer_addresses")
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      toast.error(t("checkout.address_save_error"));
      return null;
    }
    return data as Address;
  };

  const isCommissionItem = (it: any): boolean => {
    if (it?.products?.profiles?.vendor_mode === "commission") return true;
    const productId = it.products?.id ?? it.product_id;
    const key = `${productId}:${it.variant_id ?? ""}`;
    return (displayPriceLines.get(key)?.commission_amount ?? 0) > 0;
  };

  const lineFor = (it: any): WhatsAppLine => ({
    shopName: it.products?.profiles?.shop_name || it.products?.profiles?.full_name || t("product.shop"),
    code: it.products?.code ?? "",
    name: pickI18n(it.products?.name ?? "", it.products?.name_i18n, lang),
    size: it.product_variants?.size ?? null,
    color: it.product_variants?.color ?? null,
    customization: customizationSummary(it.customization),
    quantity: it.quantity,
    unitPrice: unitPrice(it),
  });

  const buildDispatchGroups = async (orderId: string, addr: Address): Promise<DispatchGroup[]> => {
    const groups: DispatchGroup[] = [];
    const byVendor = new Map<string, any[]>();
    const commissionItems: any[] = [];
    for (const it of selectedItems) {
      if (isCommissionItem(it)) commissionItems.push(it);
      else {
        const vid = (it as any).products?.vendor_id;
        if (!vid) continue;
        if (!byVendor.has(vid)) byVendor.set(vid, []);
        byVendor.get(vid)!.push(it);
      }
    }
    // Fetch vendor WhatsApp numbers server-side (commission policy enforced by view)
    const vendorIds = Array.from(byVendor.keys());
    const vendorContacts = new Map<string, string | null>();
    await Promise.all(
      vendorIds.map(async (vid) => {
        try {
          const c = await fetchVendorContacts({ data: { vendorId: vid } });
          vendorContacts.set(vid, c?.shop_whatsapp ?? null);
        } catch {
          vendorContacts.set(vid, null);
        }
      }),
    );
    for (const [vid, vItems] of byVendor) {
      const first = vItems[0] as any;
      const shopName = first.products?.profiles?.shop_name || first.products?.profiles?.full_name || t("product.shop");
      const wa = vendorContacts.get(vid) ?? null;
      const msg = buildWhatsAppMessage(vItems.map(lineFor), {
        name: addr.full_name,
        phone: addr.phone,
        address: addr.address,
        city: addr.city,
        note: addr.note,
        orderId,
      });
      groups.push({ id: `vendor-${vid}`, label: shopName, whatsappNumber: wa, message: msg, isAdmin: false });
    }
    if (commissionItems.length > 0) {
      const msg = buildWhatsAppMessage(commissionItems.map(lineFor), {
        name: addr.full_name,
        phone: addr.phone,
        address: addr.address,
        city: addr.city,
        note: addr.note,
        orderId,
      });
      groups.push({
        id: "admin-commission",
        label: t("checkout.admin_group_label"),
        whatsappNumber: settings.commission_whatsapp_number ?? null,
        message: msg,
        isAdmin: true,
      });
    }
    return groups;
  };

  const submitOrder = async () => {
    if (selectedItems.length === 0) return;
    if (!pricesReady) {
      console.info("[checkout] blocked: prices not ready", { itemCount: items.length, destinationCountryId });
      toast.error(t("common.loading"));
      return;
    }
    if (!destinationCountryId) {
      toast.error(t("checkout.country_required"));
      return;
    }
    if (hasIntlItems && !shippingServiceId) {
      toast.error("Veuillez choisir un service de transport international.");
      return;
    }
    setSubmitting(true);
    try {
      const addr = await resolveAddress();
      if (!addr) { setSubmitting(false); return; }

      if (
        user && mode === "saved" &&
        addr.destination_country_id &&
        addr.destination_country_id !== destinationCountryId
      ) {
        setSubmitting(false);
        toast.error(t("checkout.country_mismatch"));
        return;
      }

      const orderId = crypto.randomUUID();
      const debugPayload = {
        orderId,
        buyerId: user?.id ?? null,
        destinationCountryId,
        total: grandTotal,
        items: selectedItems.map((it: any) => ({
          productId: it.products?.id,
          variantId: it.variant_id ?? null,
          vendorId: it.products?.vendor_id,
          vendorMode: it.products?.profiles?.vendor_mode ?? null,
          isAdminShop: it.products?.profiles?.is_admin_shop ?? null,
          unitPrice: unitPrice(it),
          quantity: it.quantity,
        })),
      };
      console.info("[checkout] submit start", debugPayload);
      const rows = selectedItems.map((it: any) => ({
        product_id: it.products.id,
        variant_id: it.variant_id ?? null,
        vendor_id: it.products.vendor_id,
        buyer_id: user?.id ?? null,
        product_name: pickI18n(it.products.name, it.products.name_i18n, lang),
        product_code: it.products.code,
        product_image_url: it.products.product_images?.[0]?.url ?? null,
        size: it.product_variants?.size ?? null,
        color: it.product_variants?.color ?? null,
        unit_price: unitPrice(it),
        quantity: it.quantity,
        customization: cleanCustomization(it.customization),
      }));

      let savedOrderId = orderId;
      if (user) {
        const saved = await createOrder({
          data: {
            destinationCountryId,
            shippingServiceId: hasIntlItems ? shippingServiceId : null,
            address: {
              full_name: addr.full_name,
              phone: addr.phone,
              address: addr.address,
              city: addr.city,
              note: addr.note,
            },
            items: selectedItems.map((it: any) => ({
              productId: it.products.id,
              variantId: it.variant_id ?? null,
              quantity: it.quantity,
              customization: cleanCustomization(it.customization),
              shippingServiceId: (it.shipping_service_id ?? it.customization?.__shipping_service_id) ?? (hasIntlItems ? shippingServiceId : null),
            })),
          },
        });
        savedOrderId = saved.orderId;
      } else {
        const { error: oErr } = await supabase
          .from("orders")
          .insert({
            id: orderId,
            buyer_id: null,
            total: grandTotal + cartFreightTotal,
            status: "new",
            customer_name: addr.full_name,
            customer_phone: addr.phone,
            address: addr.address,
            city: addr.city,
            note: addr.note,
            destination_country_id: destinationCountryId,
            shipping_service_id: hasIntlItems ? shippingServiceId : null,
            shipping_estimate_note: hasIntlItems && shippingServiceId
              ? (allIntlHaveDeclaredWeight
                  ? `Estimation transport ~ ${shippingEstimate?.toLocaleString("fr-FR") ?? "—"} FCFA · vérifié à la réception`
                  : "À calculer après réception et pesée")
              : null,
          } as any);
        if (oErr) {
          console.error("[checkout] guest orders.insert failed", oErr, debugPayload);
          throw oErr;
        }

        const { error: iErr } = await supabase.from("order_items").insert(rows.map((row) => ({ ...row, order_id: orderId })));
        if (iErr) {
          console.error("[checkout] guest order_items.insert failed", iErr, { ...debugPayload, rows });
          await supabase.from("orders").delete().eq("id", orderId);
          throw iErr;
        }
      }
      console.info("[checkout] submit saved", { orderId: savedOrderId, itemCount: rows.length, total: grandTotal });

      // Build dispatch groups BEFORE clearing the cart
      const groups = await buildDispatchGroups(savedOrderId, addr);

      // Only remove the items the buyer actually ordered — keep the rest in the cart.
      const orderedIds = selectedItems.map((it: any) => it.id as string);
      if (user) {
        await supabase.from("cart_items").delete().in("id", orderedIds);
      } else {
        try {
          const raw = window.localStorage.getItem(GUEST_CART_KEY);
          const list = raw ? JSON.parse(raw) : [];
          const remaining = Array.isArray(list) ? list.filter((l: any) => !orderedIds.includes(l.id)) : [];
          window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify(remaining));
          window.dispatchEvent(new Event("guest-cart-changed"));
        } catch {
          clearGuestCart();
        }
      }
      setSelectedIds(new Set());
      refresh();
      toast.success(t("checkout.order_saved_pending"));
      setSentIds(new Set());
      setDispatch({ groups, orderId: savedOrderId });
    } catch (e: any) {
      console.error("[checkout] submitOrder error", e);
      const detail = e?.message || e?.error_description || e?.hint || "";
      toast.error(detail ? `${t("checkout.order_save_error")} — ${detail}` : t("checkout.order_save_error"));
    } finally {
      setSubmitting(false);
    }
  };

  const sendDispatch = (g: DispatchGroup) => {
    window.open(whatsappUrlTo(g.whatsappNumber, g.message), "_blank");
    setSentIds((s) => new Set(s).add(g.id));
  };

  const finishDispatch = () => {
    setDispatch(null);
    setCheckoutOpen(false);
    if (user) router.navigate({ to: "/orders" });
    else router.navigate({ to: "/" });
  };


  return (
    <div className="min-h-screen bg-background pb-32">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-[var(--page-px)] py-3 pb-[calc(7rem+env(safe-area-inset-bottom))]">
        <BackButton fallbackTo="/" />
        <h1 className="mb-3 mt-2 text-lg font-bold">{t("cart.title")}</h1>

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            {t("cart.empty")}
          </div>
        ) : (
          <div className="space-y-6">
            {(["import", "local"] as LogisticsType[]).map((logType) => {
              const section = logisticsGroups.get(logType);
              if (!section || section.vendorGroups.size === 0) return null;
              const SectionIcon = section.icon;
              return (
                <div key={logType} className="space-y-3">
                  {/* Section header */}
                  <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2", section.borderColor, section.headerBg)}>
                    <SectionIcon className={cn("h-4 w-4", section.color)} />
                    <div>
                      <p className={cn("text-sm font-semibold", section.color)}>{section.label}</p>
                      <p className="text-[11px] text-muted-foreground">{section.sublabel}</p>
                    </div>
                    <span className="ms-auto text-[11px] font-medium text-muted-foreground">
                      {Array.from(section.vendorGroups.values()).reduce((sum, vg) => sum + vg.items.length, 0)} article(s)
                    </span>
                  </div>

                  {/* Vendor groups within this logistics section */}
                  <div className="space-y-3">
                    {Array.from(section.vendorGroups.values()).map((g) => {
                      const groupState = groupSelectionState(g.items as any[]);
                      return (
                        <section key={`${logType}-${g.vendorId}`} className={cn("overflow-hidden rounded-xl border bg-card shadow-soft", section.borderColor)}>
                          <header className={cn("flex items-center gap-3 border-b px-3 py-2.5", section.headerBg)}>
                            <Checkbox
                              checked={groupState}
                              onCheckedChange={(v) => toggleGroup(g.items as any[], v === true)}
                              aria-label={g.shopName}
                            />
                            <Store className={cn("h-4 w-4", section.color)} />
                            <span className="text-sm font-semibold">{g.shopName}</span>
                            <span className="ms-auto text-[11px] text-muted-foreground">
                              {(g.items as any[]).filter((it) => isSelected(it.id)).length}/{g.items.length}
                            </span>
                          </header>
                          <ul>
                            {g.items.map((it: any) => {
                              const img = it.products?.product_images?.[0]?.url;
                              const price = unitPrice(it);
                              const cust = customizationSummary(it.customization);
                              const checked = isSelected(it.id);
                              return (
                                <li
                                  key={it.id}
                                  className={cn(
                                    "flex gap-3 border-b p-3 last:border-0 transition-colors",
                                    checked ? "bg-background" : "bg-muted/30 opacity-70",
                                  )}
                                >
                                  <div className="flex items-start pt-1">
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={(v) => toggleItem(it.id, v === true)}
                                      aria-label={it.products.name}
                                    />
                                  </div>
                                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                                    {img && <img src={img} alt={it.products.name} className="h-full w-full object-cover" loading="lazy" decoding="async" />}
                                  </div>
                                  <div className="flex flex-1 flex-col">
                                    <p className="line-clamp-2 text-sm">{pickI18n(it.products.name, it.products.name_i18n, lang)}</p>
                                    <p className="text-xs text-muted-foreground">{t("product.code")} : {it.products.code}</p>
                                    {(it.product_variants?.size || it.product_variants?.color) && (
                                      <p className="text-xs text-muted-foreground">
                                        {it.product_variants.size && <>{t("product.size")} : {it.product_variants.size}</>}
                                        {it.product_variants.size && it.product_variants.color && " · "}
                                        {it.product_variants.color && <>{t("product.color")} : {it.product_variants.color}</>}
                                      </p>
                                    )}
                                    {cust && <p className="text-xs text-primary">{t("product.personalization")} : {cust}</p>}
                                    {/* Sélecteur de transport par ligne (indépendant) */}
                                    {(() => {
                                      const intl = isItemInternational(it);
                                      if (!intl) return null;
                                      const w = Number(it?.products?.weight_kg ?? 0);
                                      if (shippingServices.length === 0) return null;
                                      const currentId =
                                        (it.shipping_service_id ?? it.customization?.__shipping_service_id) ??
                                        (w > 0 ? cheapestServiceId : null);
                                      return (
                                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                          <Plane className="h-3 w-3 text-primary" />
                                          <select
                                            value={currentId ?? ""}
                                            onChange={(e) => updateLineShipping(it.id, e.target.value || null)}
                                            className="text-[11px] rounded border border-border bg-background px-1.5 py-0.5"
                                          >
                                            {w <= 0 && <option value="">— préférence —</option>}
                                            {shippingServices.map((s) => (
                                              <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                          </select>
                                          {w <= 0 && (
                                            <span className="text-[10px] text-amber-700">Calculé après pesée</span>
                                          )}
                                        </div>
                                      );
                                    })()}
                                    <div className="mt-auto flex items-end justify-between pt-2">
                                      <div className="min-h-5">
                                        {pricesReady ? (() => {
                                          const lf = lineFreight(it);
                                          const lineTotal = price * it.quantity + lf;
                                          return (
                                            <p className="text-sm font-bold text-primary">
                                              {lineTotal.toLocaleString("fr-FR")} FCFA
                                            </p>
                                          );
                                        })() : (
                                          <span className="inline-block h-4 w-20 animate-pulse rounded bg-muted" />
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <button onClick={() => removeItem(it.id)} className="text-muted-foreground hover:text-destructive" aria-label={t("common.delete")}>
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                        <div className="inline-flex items-center rounded-md border border-border">
                                          <button className="flex h-7 w-7 items-center justify-center" onClick={() => updateQuantity(it.id, it.quantity - 1)}>
                                            <Minus className="h-3.5 w-3.5" />
                                          </button>
                                          <span className="w-8 text-center text-sm font-semibold">{it.quantity}</span>
                                          <button className="flex h-7 w-7 items-center justify-center" onClick={() => updateQuantity(it.id, it.quantity + 1)}>
                                            <Plus className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </section>
                      );
                    })}
                  </div>

                  {/* Shipping service selector ONLY under import section */}
                  {logType === "import" && hasIntlItems && renderShippingServiceSelector()}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {items.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur" style={{ paddingBottom: "var(--safe-bottom, 0px)" }}>
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-[var(--page-px)] py-3">
            <div className="flex items-center gap-2 pe-1">
              <Checkbox
                checked={
                  selectedIds.size === 0
                    ? false
                    : selectedIds.size === allIds.length
                    ? true
                    : "indeterminate"
                }
                onCheckedChange={(v) => {
                  if (v === true) setSelectedIds(new Set(allIds));
                  else setSelectedIds(new Set());
                }}
                aria-label="select all"
              />
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {selectedCount}/{items.reduce((s, it: any) => s + it.quantity, 0)}
              </span>
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">
                {t("cart.total")} · {selectedCount} {t("cart.title")}
              </p>
              <p className="text-lg font-extrabold text-primary min-h-7">
                {pricesReady ? (
                  <>{(grandTotal + cartFreightTotal).toLocaleString("fr-FR")} FCFA</>
                ) : (
                  <span className="inline-block h-6 w-28 animate-pulse rounded bg-muted" />
                )}
              </p>
            </div>
            <Button
              className="h-12 rounded-full px-5 text-sm font-semibold"
              onClick={() => setCheckoutOpen(true)}
              disabled={!pricesReady || selectedItems.length === 0 || (hasIntlItems && !shippingServiceId)}
            >
              {selectedItems.length === 0
                ? t("cart.checkout")
                : `${t("cart.checkout")} (${selectedCount})`}
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={checkoutOpen}
        onOpenChange={(o) => {
          if (!o && dispatch) { finishDispatch(); return; }
          setCheckoutOpen(o);
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          {dispatch ? (
            <>
              <DialogHeader>
                <DialogTitle>{t("checkout.dispatch_title")}</DialogTitle>
                <DialogDescription>
                  {t("checkout.dispatch_desc_prefix")} #{dispatch.orderId.slice(0, 8)} {t("checkout.dispatch_desc_suffix")}
                </DialogDescription>
              </DialogHeader>
              <ul className="mt-2 space-y-2">
                {dispatch.groups.map((g) => {
                  const sent = sentIds.has(g.id);
                  return (
                    <li key={g.id} className="rounded-xl border border-border bg-card p-3">
                      <div className="flex items-start gap-2">
                        {g.isAdmin ? (
                          <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
                        ) : (
                          <Store className="mt-0.5 h-4 w-4 text-primary" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{g.label}</p>
                          {g.isAdmin && (
                            <p className="text-[11px] text-muted-foreground">{t("checkout.admin_group_note")}</p>
                          )}
                          {!g.whatsappNumber && (
                            <p className="text-[11px] text-destructive">{t("checkout.no_whatsapp_warning")}</p>
                          )}
                        </div>
                      </div>
                      <Button
                        type="button"
                        onClick={() => sendDispatch(g)}
                        className={cn(
                          "mt-2 w-full",
                          sent
                            ? "bg-muted text-foreground hover:bg-muted/80"
                            : "bg-[#25D366] text-white hover:bg-[#1ebe5a]",
                        )}
                      >
                        {sent ? (
                          <><Check className="h-4 w-4" /> {t("checkout.sent_resend")}</>
                        ) : (
                          <><MessageCircle className="h-4 w-4" /> {t("checkout.send_whatsapp")}</>
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>
              <div className="sticky bottom-0 -mx-6 mt-4 border-t border-border bg-background px-6 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3">
                <Button onClick={finishDispatch} variant="outline" className="w-full">
                  {t("checkout.finish")}
                </Button>
              </div>
            </>
          ) : (
          <>
          <DialogHeader>
            <DialogTitle>{t("checkout.delivery_address")}</DialogTitle>
            <DialogDescription>
              {t("checkout.address_choice_desc")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label>{t("checkout.delivery_country")} *</Label>
            <CountrySelect
              value={destinationCountryId}
              onChange={setDestinationCountryId}
              onlyEnabled
              placeholder={t("checkout.choose_delivery_country")}
            />
          </div>

          {renderShippingServiceSelector()}



          {addresses.length > 0 && (
            <div className="mb-2 flex gap-2 rounded-full bg-muted p-1">
              <button
                className={cn("flex-1 rounded-full py-1.5 text-xs font-semibold transition-colors",
                  mode === "saved" ? "bg-background shadow-sm" : "text-muted-foreground")}
                onClick={() => setMode("saved")}
              >
                {t("checkout.saved_addresses")} ({addresses.length})
              </button>
              <button
                className={cn("flex-1 rounded-full py-1.5 text-xs font-semibold transition-colors",
                  mode === "new" ? "bg-background shadow-sm" : "text-muted-foreground")}
                onClick={() => setMode("new")}
              >
                + {t("checkout.new_address")}
              </button>
            </div>
          )}

          {mode === "saved" && addresses.length > 0 ? (
            <ul className="space-y-2">
              {addresses.map((a) => {
                const sel = a.id === selectedId;
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(a.id)}
                      className={cn(
                        "w-full rounded-xl border p-3 text-left transition-colors",
                        sel ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-accent",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">
                            {a.label}
                            {a.is_default && <span className="ms-2 text-[10px] font-normal text-primary">★ {t("common.default")}</span>}
                          </p>
                          <p className="text-sm">{a.full_name} · {a.phone}</p>
                          <p className="text-xs text-muted-foreground">{a.address} — {a.city}</p>
                        </div>
                        {sel && <Check className="h-4 w-4 shrink-0 text-primary" />}
                      </div>
                    </button>
                  </li>
                );
              })}
              <li>
                <Link to="/account" className="block text-center text-xs text-primary hover:underline">
                  {t("checkout.manage_addresses")}
                </Link>
              </li>
            </ul>
          ) : (
            <div className="space-y-3">
              {user && (
                <div>
                  <Label htmlFor="n_label">{t("checkout.label")} *</Label>
                  <Input id="n_label" placeholder={t("checkout.label_placeholder")} value={newForm.label}
                    onChange={(e) => setNewForm({ ...newForm, label: e.target.value })} maxLength={50} />
                  {errors.label && <p className="mt-1 text-xs text-destructive">{errors.label}</p>}
                </div>
              )}
              <div>
                <Label htmlFor="n_name">{t("checkout.full_name")} *</Label>
                <Input id="n_name" value={newForm.full_name}
                  onChange={(e) => setNewForm({ ...newForm, full_name: e.target.value })} maxLength={100} />
                {errors.full_name && <p className="mt-1 text-xs text-destructive">{errors.full_name}</p>}
              </div>
              <div>
                <Label htmlFor="n_phone">{t("checkout.whatsapp_phone")} *</Label>
                <Input id="n_phone" type="tel" placeholder="+221 77 000 00 00" value={newForm.phone}
                  onChange={(e) => setNewForm({ ...newForm, phone: e.target.value })} maxLength={20} />
                {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone}</p>}
              </div>
              <div>
                <Label htmlFor="n_addr">{t("checkout.address")} *</Label>
                <Input id="n_addr" value={newForm.address}
                  onChange={(e) => setNewForm({ ...newForm, address: e.target.value })} maxLength={300} />
                {errors.address && <p className="mt-1 text-xs text-destructive">{errors.address}</p>}
              </div>
              <div>
                <Label htmlFor="n_city">{t("checkout.city")} *</Label>
                <Input id="n_city" value={newForm.city}
                  onChange={(e) => setNewForm({ ...newForm, city: e.target.value })} maxLength={100} />
                {errors.city && <p className="mt-1 text-xs text-destructive">{errors.city}</p>}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={useGeolocation} disabled={locating} className="w-full">
                <Crosshair className="h-4 w-4" />
                {locating ? t("common.loading") : newForm.latitude ? t("checkout.location_refresh") : t("checkout.use_location")}
              </Button>
              <div>
                <Label htmlFor="n_note">{t("checkout.note")}</Label>
                <Textarea id="n_note" rows={2} value={newForm.note}
                  onChange={(e) => setNewForm({ ...newForm, note: e.target.value })} maxLength={500} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                <MapPin className="mr-1 inline h-3 w-3" />
                {t("checkout.address_saved_next")}
              </p>
            </div>
          )}

          <div className="sticky bottom-0 -mx-6 mt-4 border-t border-border bg-background px-6 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3">
            <Button onClick={() => submitOrder()} disabled={submitting} className="w-full bg-[#25D366] text-white hover:bg-[#1ebe5a]">
              {submitting ? t("checkout.submitting") : t("checkout.confirm_whatsapp")}
            </Button>
          </div>
          </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
