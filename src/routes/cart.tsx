import { useEffect, useMemo, useState } from "react";
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
  const { items, updateQuantity, removeItem, refresh } = useCart();
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
  const [shippingServiceId, setShippingServiceId] = useState<string | null>(null);
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

  const groups = new Map<string, { shopName: string; vendorId: string; items: typeof items }>();
  for (const it of items) {
    const p = (it as any).products;
    if (!p) continue;
    const profileShop = p.profiles;
    const shopName = profileShop?.shop_name || profileShop?.full_name || t("product.shop");
    const key = p.vendor_id;
    if (!groups.has(key)) groups.set(key, { shopName, vendorId: key, items: [] });
    groups.get(key)!.items.push(it);
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
  const selectedCount = selectedItems.reduce((s, it: any) => s + (it.quantity ?? 0), 0);

  // International shipping detection
  const needsIntlShipping = useMemo(
    () => selectedItems.some((it: any) => it.products?.requires_international_shipping === true),
    [selectedItems],
  );
  const intlSourceCountryIds = useMemo(() => {
    const set = new Set<string>();
    for (const it of selectedItems) {
      if (it.products?.requires_international_shipping && it.products?.profiles?.source_country_id) {
        set.add(it.products.profiles.source_country_id);
      }
    }
    return Array.from(set);
  }, [selectedItems]);

  // Load shipping services when intl needed
  useEffect(() => {
    if (!checkoutOpen || !needsIntlShipping || !destinationCountryId) {
      if (!needsIntlShipping) setShippingServiceId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const services = await fetchShippingServices({
          data: {
            source_country_id: intlSourceCountryIds[0] ?? null,
            destination_country_id: destinationCountryId,
            only_enabled: true,
          },
        });
        if (!cancelled) {
          setShippingServices(services);
          if (services.length > 0 && !shippingServiceId) {
            setShippingServiceId(services[0].id);
          }
        }
      } catch (e) {
        console.error("[cart] load shipping services failed", e);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutOpen, needsIntlShipping, destinationCountryId, intlSourceCountryIds.join(",")]);

  const pricesReady = displayPriceLines.isReady;
  const fallbackUnitPrice = (it: any) => Number(it.product_variants?.price_override ?? it.products?.price ?? 0);
  const unitPrice = (it: any) => {
    const productId = it.products?.id ?? it.product_id;
    const key = `${productId}:${it.variant_id ?? ""}`;
    const resolved = displayPriceLines.get(key)?.final_price;
    return resolved ?? (pricesReady ? fallbackUnitPrice(it) : 0);
  };
  const grandTotal = selectedItems.reduce((s, it: any) => s + unitPrice(it) * it.quantity, 0);

  const customizationSummary = (c: any): string | null => {
    if (!c) return null;
    const parts: string[] = [];
    if (c.text) parts.push(`${t("product.your_text")} « ${c.text} »`);
    if (c.font) parts.push(`${t("product.font")} ${c.font}`);
    if (c.color) parts.push(`${t("product.color")} ${c.color}`);
    if (c.image_url) parts.push(t("product.your_image"));
    return parts.length ? parts.join(", ") : null;
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
        customization: it.customization ?? null,
      }));

      let savedOrderId = orderId;
      if (user) {
        const saved = await createOrder({
          data: {
            destinationCountryId,
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
              customization: it.customization ?? null,
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
            total: grandTotal,
            status: "new",
            customer_name: addr.full_name,
            customer_phone: addr.phone,
            address: addr.address,
            city: addr.city,
            note: addr.note,
            destination_country_id: destinationCountryId,
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
          <div className="space-y-4">
            {Array.from(groups.values()).map((g) => {
              const groupState = groupSelectionState(g.items as any[]);
              return (
              <section key={g.vendorId} className="overflow-hidden rounded-xl bg-card shadow-soft">
                <header className="flex items-center gap-3 border-b border-border bg-accent/40 px-3 py-2.5">
                  <Checkbox
                    checked={groupState}
                    onCheckedChange={(v) => toggleGroup(g.items as any[], v === true)}
                    aria-label={g.shopName}
                  />
                  <Store className="h-4 w-4 text-primary" />
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
                          "flex gap-3 border-b border-border p-3 last:border-0 transition-colors",
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
                          <div className="mt-auto flex items-end justify-between pt-2">
                            <p className="text-sm font-bold text-primary min-h-5">
                              {pricesReady ? (
                                <>{price.toLocaleString("fr-FR")} FCFA</>
                              ) : (
                                <span className="inline-block h-4 w-20 animate-pulse rounded bg-muted" />
                              )}
                            </p>
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
                  <>{grandTotal.toLocaleString("fr-FR")} FCFA</>
                ) : (
                  <span className="inline-block h-6 w-28 animate-pulse rounded bg-muted" />
                )}
              </p>
            </div>
            <Button
              className="h-12 rounded-full px-5 text-sm font-semibold"
              onClick={() => setCheckoutOpen(true)}
              disabled={!pricesReady || selectedItems.length === 0}
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
