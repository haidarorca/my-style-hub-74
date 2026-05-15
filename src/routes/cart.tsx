import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { BackButton } from "@/components/layout/BackButton";
import { EditableLabel } from "@/components/admin/EditableLabel";
import { Minus, Plus, Trash2, Store, ShoppingBag, MapPin, Crosshair, Check } from "lucide-react";
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
import { useCart, clearGuestCart } from "@/hooks/use-cart";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { buildWhatsAppMessage, whatsappUrl, type WhatsAppLine } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import { pickI18n } from "@/lib/i18n/localized";
import { CountrySelect } from "@/components/CountrySelect";
import { useDeliveryCountry } from "@/hooks/use-delivery-country";
import { useDisplayPriceLines } from "@/hooks/use-display-prices";

const newAddressSchema = z.object({
  label: z.string().trim().min(1, "Libellé requis").max(50),
  full_name: z.string().trim().min(2, "Nom trop court").max(100),
  phone: z.string().trim().min(7, "Numéro invalide").max(20).regex(/^[+0-9 ()-]+$/, "Numéro invalide"),
  address: z.string().trim().min(3, "Adresse requise").max(300),
  city: z.string().trim().min(2, "Quartier/Ville requis").max(100),
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
  const router = useRouter();

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"saved" | "new">("saved");
  const [newForm, setNewForm] = useState({
    label: "Domicile",
    full_name: "",
    phone: "",
    address: "",
    city: "",
    note: "",
    latitude: null as number | null,
    longitude: null as number | null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
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

  const fallbackUnitPrice = (it: any) => Number(it.product_variants?.price_override ?? it.products?.price ?? 0);
  const unitPrice = (it: any) => {
    const productId = it.products?.id ?? it.product_id;
    const key = `${productId}:${it.variant_id ?? ""}`;
    return displayPriceLines.get(key)?.final_price ?? fallbackUnitPrice(it);
  };
  const grandTotal = items.reduce((s, it: any) => s + unitPrice(it) * it.quantity, 0);

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

  const submitOrder = async (openWhatsApp: boolean) => {
    if (items.length === 0) return;
    setSubmitting(true);
    try {
      const addr = await resolveAddress();
      if (!addr) { setSubmitting(false); return; }

      const orderId = crypto.randomUUID();
      const { error: oErr } = await supabase
        .from("orders")
        .insert({
          id: orderId,
          buyer_id: user?.id ?? null,
          total: grandTotal,
          status: "new",
          customer_name: addr.full_name,
          customer_phone: addr.phone,
          address: addr.address,
          city: addr.city,
          note: addr.note,
          destination_country_id: destinationCountryId,
        } as any);
      if (oErr) throw oErr;
      const order = { id: orderId };

      const rows = items.map((it: any) => ({
        order_id: order.id,
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
      const { error: iErr } = await supabase.from("order_items").insert(rows);
      if (iErr) throw iErr;

      if (user) {
        await supabase.from("cart_items").delete().eq("user_id", user.id);
      } else {
        clearGuestCart();
      }
      refresh();
      setCheckoutOpen(false);
      toast.success(t("checkout.order_saved_pending"));
      if (user) router.navigate({ to: "/orders" });
      else router.navigate({ to: "/" });

      if (openWhatsApp) {
        const lines: WhatsAppLine[] = items.map((it: any) => ({
          shopName: it.products?.profiles?.shop_name || it.products?.profiles?.full_name || t("product.shop"),
          code: it.products?.code ?? "",
          name: pickI18n(it.products?.name ?? "", it.products?.name_i18n, lang),
          size: it.product_variants?.size ?? null,
          color: it.product_variants?.color ?? null,
          customization: customizationSummary(it.customization),
          quantity: it.quantity,
          unitPrice: unitPrice(it),
        }));
        const msg = buildWhatsAppMessage(lines, {
          name: addr.full_name,
          phone: addr.phone,
          address: addr.address,
          city: addr.city,
          note: addr.note,
          orderId: order.id,
        });
        window.open(whatsappUrl(msg), "_blank");
      }
    } catch (e) {
      console.error(e);
      toast.error(t("checkout.order_save_error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-[var(--page-px)] py-3">
        <BackButton fallbackTo="/" />
        <h1 className="mb-3 mt-2 text-lg font-bold">{t("cart.title")}</h1>

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            {t("cart.empty")}
          </div>
        ) : (
          <div className="space-y-4">
            {Array.from(groups.values()).map((g) => (
              <section key={g.vendorId} className="overflow-hidden rounded-xl bg-card shadow-soft">
                <header className="flex items-center gap-2 border-b border-border bg-accent/40 px-3 py-2">
                  <Store className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">{g.shopName}</span>
                </header>
                <ul>
                  {g.items.map((it: any) => {
                    const img = it.products?.product_images?.[0]?.url;
                    const price = unitPrice(it);
                    const cust = customizationSummary(it.customization);
                    return (
                      <li key={it.id} className="flex gap-3 border-b border-border p-3 last:border-0">
                        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                          {img && <img src={img} alt={it.products.name} className="h-full w-full object-cover" />}
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
                            <p className="text-sm font-bold text-primary">
                              {price.toLocaleString("fr-FR")} FCFA
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
            ))}
          </div>
        )}
      </main>

      {items.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur" style={{ paddingBottom: "var(--safe-bottom, 0px)" }}>
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-[var(--page-px)] py-3">
            <div className="flex-1">
                <p className="text-xs text-muted-foreground">{t("cart.total")}</p>
              <p className="text-lg font-extrabold text-primary">
                {grandTotal.toLocaleString("fr-FR")} FCFA
              </p>
            </div>
            <Button className="h-12 rounded-full px-6 text-sm font-semibold" onClick={() => setCheckoutOpen(true)}>
              <EditableLabel uiKey="cart.checkout" defaultLabel={t("cart.checkout")} defaultSize="md" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("checkout.delivery_address")}</DialogTitle>
            <DialogDescription>
              {t("checkout.address_choice_desc")}
            </DialogDescription>
          </DialogHeader>

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

          <div className="mt-4 space-y-2 border-t border-border pt-3">
            <Button onClick={() => submitOrder(true)} disabled={submitting} className="w-full bg-[#25D366] text-white hover:bg-[#1ebe5a]">
              {submitting ? t("checkout.submitting") : <EditableLabel uiKey="cart.confirm_whatsapp" defaultLabel={t("checkout.confirm_whatsapp")} defaultSize="md" />}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
