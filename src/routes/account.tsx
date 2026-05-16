import { useEffect, useState } from "react";
import { z } from "zod";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { MapPin, Plus, Pencil, Trash2, Star, Crosshair, ArrowLeft, Package, Store, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CountryPicker, PhoneDigitsInput, DEFAULT_COUNTRY, parsePhone, findCountryByCode, type Country } from "@/components/ui/phone-input";
import { CountrySelect } from "@/components/CountrySelect";
import { useCountries, useCountryLabel } from "@/hooks/use-countries";
import { useDeliveryCountry } from "@/hooks/use-delivery-country";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { supabase } from "@/integrations/supabase/client";
import { ChangePasswordCard } from "@/components/auth/ChangePasswordCard";
import { useServerFn } from "@tanstack/react-start";
import { removeVendorAccount } from "@/lib/vendor-offboarding.functions";

export const Route = createFileRoute("/account")({
  component: AccountPage,
});

const addressSchema = z.object({
  label: z.string().trim().min(1, "Libellé requis").max(50),
  full_name: z.string().trim().min(2, "Nom trop court").max(100),
  phone: z.string().trim().min(7, "Numéro invalide").max(20).regex(/^[+0-9 ()-]+$/, "Numéro invalide"),
  phone_secondary: z.string().trim().max(20).regex(/^[+0-9 ()-]*$/, "Numéro invalide").optional().or(z.literal("")),
  phone_alt: z.string().trim().max(20).regex(/^[+0-9 ()-]*$/, "Numéro invalide").optional().or(z.literal("")),
  address: z.string().trim().min(3, "Adresse requise").max(300),
  city: z.string().trim().min(2, "Quartier/Ville requis").max(100),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

export interface Address {
  id: string;
  user_id: string;
  label: string;
  full_name: string;
  phone: string;
  phone_secondary: string | null;
  phone_alt: string | null;
  address: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
  is_default: boolean;
  destination_country_id: string | null;
}

const emptyForm = {
  label: "Domicile",
  full_name: "",
  phone: "",
  phone_secondary: "",
  phone_alt: "",
  address: "",
  city: "",
  note: "",
  latitude: null as number | null,
  longitude: null as number | null,
};

function AccountPage() {
  const { user, profile, loading, isAdmin, isVendor } = useAuth();
  const { t, dir } = useI18n();
  const router = useRouter();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Address | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [destinationCountryId, setDestinationCountryId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const { data: countriesList } = useCountries({ onlyEnabled: true });
  const labelOfCountry = useCountryLabel();
  const { countryId: deliveryCountryId, setCountryId: setDeliveryCountryId } = useDeliveryCountry();

  useEffect(() => {
    if (!loading && !user) router.navigate({ to: "/login" });
  }, [loading, user, router]);

  const refresh = async () => {
    if (!user) return;
    setLoadingList(true);
    const { data } = await (supabase as any)
      .from("customer_addresses")
      .select("*")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    setAddresses((data ?? []) as Address[]);
    setLoadingList(false);
  };

  useEffect(() => { void refresh(); /* eslint-disable-next-line */ }, [user?.id]);

  const openNew = () => {
    setEditing(null);
    const parsedProfile = profile?.phone ? parsePhone(profile.phone) : null;
    setCountry(parsedProfile?.country ?? DEFAULT_COUNTRY);
    setForm({
      ...emptyForm,
      full_name: profile?.full_name ?? "",
      phone: parsedProfile?.local ?? "",
    });
    setDestinationCountryId(null);
    setErrors({});
    setOpen(true);
  };

  const openEdit = (a: Address) => {
    setEditing(a);
    const p1 = parsePhone(a.phone);
    const p2 = a.phone_secondary ? parsePhone(a.phone_secondary) : null;
    const p3 = a.phone_alt ? parsePhone(a.phone_alt) : null;
    setCountry(p1.country);
    setForm({
      label: a.label,
      full_name: a.full_name,
      phone: p1.local,
      phone_secondary: p2?.local ?? "",
      phone_alt: p3?.local ?? "",
      address: a.address,
      city: a.city,
      note: a.note ?? "",
      latitude: a.latitude,
      longitude: a.longitude,
    });
    setDestinationCountryId(a.destination_country_id ?? null);
    setErrors({});
    setOpen(true);
  };

  const useGeolocation = () => {
    if (!navigator.geolocation) {
      toast.error(t("common.location_unavailable"));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setForm((f) => ({ ...f, latitude, longitude }));
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&accept-language=fr&zoom=14`,
            { headers: { Accept: "application/json" } },
          );
          if (res.ok) {
            const data = await res.json();
            const a = data?.address ?? {};
            const cc = (a.country_code ?? "").toUpperCase();
            if (cc) {
              const matched = findCountryByCode(cc);
              if (matched) setCountry(matched);
            }
            const cityName: string | undefined =
              a.neighbourhood ||
              a.suburb ||
              a.quarter ||
              a.city_district ||
              a.village ||
              a.town ||
              a.city ||
              a.municipality ||
              a.county;
            if (cityName) {
              setForm((f) => ({ ...f, city: f.city?.trim() ? f.city : cityName }));
            }
            toast.success(t("common.location_detected"));
          } else {
            toast.success(t("common.location_saved"));
          }
        } catch {
          toast.success(t("common.location_saved"));
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        toast.error(t("common.location_failed"));
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const save = async () => {
    if (!user) return;
    const combine = (digits: string) => {
      const d = (digits ?? "").trim();
      return d ? `${country.dial} ${d}` : "";
    };
    const toValidate = {
      ...form,
      phone: combine(form.phone),
      phone_secondary: combine(form.phone_secondary),
      phone_alt: combine(form.phone_alt),
    };
    const parsed = addressSchema.safeParse(toValidate);
    if (!parsed.success) {
      const e: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const k = i.path[0] as string;
        if (!e[k]) e[k] = i.message;
      }
      setErrors(e);
      const first = Object.values(e)[0];
      toast.error(first ?? t("common.correct_fields"));
      return;
    }
    if (!destinationCountryId) {
      setErrors({ destination_country_id: "Pays de livraison requis" });
      toast.error("Sélectionnez le pays de livraison.");
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const payload = {
        ...parsed.data,
        note: parsed.data.note || null,
        phone_secondary: parsed.data.phone_secondary || null,
        phone_alt: parsed.data.phone_alt || null,
        latitude: form.latitude,
        longitude: form.longitude,
        destination_country_id: destinationCountryId,
        user_id: user.id,
        is_default: editing ? editing.is_default : addresses.length === 0,
      };
      if (editing) {
        const { error } = await (supabase as any)
          .from("customer_addresses")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("customer_addresses").insert(payload);
        if (error) throw error;
      }
      toast.success(t("common.saved"));
      setOpen(false);
      await refresh();
    } catch (e: any) {
      console.error("Save address error", e);
      toast.error(e?.message ?? t("checkout.address_save_error"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a: Address) => {
    if (!confirm(t("account.delete_confirm"))) return;
    const { error } = await (supabase as any).from("customer_addresses").delete().eq("id", a.id);
    if (error) return toast.error(t("common.error"));
    toast.success(t("common.deleted"));
    await refresh();
  };

  const setDefault = async (a: Address) => {
    if (!user) return;
    await (supabase as any)
      .from("customer_addresses")
      .update({ is_default: false })
      .eq("user_id", user.id);
    await (supabase as any)
      .from("customer_addresses")
      .update({ is_default: true })
      .eq("id", a.id);
    toast.success(t("account.default_updated"));
    await refresh();
  };

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-safe">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-[var(--page-px)] py-4">
        <div className="mb-3">
          <BackButton fallbackTo="/" />
        </div>

        <div className="mb-4 space-y-2">
          <Link
            to="/orders"
            className="flex items-center justify-between rounded-xl border border-border bg-card p-3 shadow-soft transition hover:bg-accent"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Package className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold">{t("nav.orders")}</span>
            </span>
            <ChevronRight className={`h-4 w-4 text-muted-foreground ${dir === "rtl" ? "rotate-180" : ""}`} />
          </Link>
          {(isVendor || isAdmin) ? (
            <Link
              to="/vendor"
              className="flex items-center justify-between rounded-xl border border-border bg-card p-3 shadow-soft transition hover:bg-accent"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Store className="h-4 w-4" />
                </span>
                <span className="text-sm font-semibold">{t("nav.vendor")}</span>
              </span>
              <ChevronRight className={`h-4 w-4 text-muted-foreground ${dir === "rtl" ? "rotate-180" : ""}`} />
            </Link>
          ) : (
            <Link
              to="/become-vendor"
              className="flex items-center justify-between rounded-xl border border-primary/40 bg-gradient-to-br from-primary/10 to-accent/10 p-3 shadow-soft transition hover:from-primary/20 hover:to-accent/20"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Store className="h-4 w-4" />
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-semibold">Devenir vendeur</span>
                  <span className="text-[11px] text-muted-foreground">Ouvrez votre boutique en quelques minutes</span>
                </span>
              </span>
              <ChevronRight className={`h-4 w-4 text-muted-foreground ${dir === "rtl" ? "rotate-180" : ""}`} />
            </Link>
          )}
        </div>

        <div className="mb-4 rounded-xl border border-border bg-card p-3 shadow-soft">
          <div className="mb-2 flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MapPin className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Pays de livraison</p>
              <p className="text-xs text-muted-foreground">
                Sélectionnez le pays où vous voulez être livré.
              </p>
            </div>
          </div>
          <CountrySelect
            value={deliveryCountryId}
            onChange={(id) => {
              setDeliveryCountryId(id);
              if (id) toast.success("Pays de livraison mis à jour");
            }}
            onlyEnabled
            placeholder="Choisir le pays de livraison"
          />
        </div>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-lg font-bold">{t("account.addresses")}</h1>
            <p className="text-xs text-muted-foreground">
              {t("account.description")}
            </p>
          </div>
          <Button onClick={openNew} size="sm" className="rounded-full">
            <Plus className="h-4 w-4" /> {t("common.add")}
          </Button>
        </div>

        {loadingList ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : addresses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center">
            <MapPin className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              {t("account.no_addresses")}
            </p>
            <Button onClick={openNew} className="mt-4 rounded-full">
              <Plus className="h-4 w-4" /> {t("account.add_first_address")}
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {addresses.map((a) => (
              <li key={a.id} className="rounded-xl border border-border bg-card p-3 shadow-soft">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{a.label}</span>
                      {a.is_default && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          <Star className="h-3 w-3" /> {t("common.default")}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm">{a.full_name}</p>
                    <p className="text-xs text-muted-foreground">{a.phone}{a.phone_secondary ? ` · ${a.phone_secondary}` : ""}{a.phone_alt ? ` · ${a.phone_alt}` : ""}</p>
                    <p className="mt-1 text-sm">{a.address}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.city}
                      {a.destination_country_id && (() => {
                        const c = countriesList?.find((x) => x.id === a.destination_country_id);
                        return c ? <> · <span className="font-medium">{c.flag_emoji} {labelOfCountry(c)}</span></> : null;
                      })()}
                    </p>
                    {a.note && <p className="mt-1 text-xs italic text-muted-foreground">« {a.note} »</p>}
                    {a.latitude != null && a.longitude != null && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        📍 {a.latitude.toFixed(5)}, {a.longitude.toFixed(5)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(a)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(a)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {!a.is_default && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-8 rounded-full text-xs"
                    onClick={() => setDefault(a)}
                  >
                    <Star className="h-3 w-3" /> {t("account.set_default_address")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6">
          <ChangePasswordCard />
        </div>

        {isVendor && !isAdmin && <RemoveVendorCard />}
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? t("account.edit_address") : t("account.new_address")}</DialogTitle>
            <DialogDescription>{t("account.delivery_info")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="a_label">{t("checkout.label")} *</Label>
              <Input id="a_label" placeholder={t("checkout.label_placeholder")} value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })} maxLength={50} />
              {errors.label && <p className="mt-1 text-xs text-destructive">{errors.label}</p>}
            </div>
            <div>
              <Label htmlFor="a_name">{t("account.full_name")} *</Label>
              <Input id="a_name" value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })} maxLength={100} />
              {errors.full_name && <p className="mt-1 text-xs text-destructive">{errors.full_name}</p>}
            </div>
            <div>
              <Label>{t("account.country")} *</Label>
              <CountryPicker value={country} onChange={setCountry} />
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t("account.dial_applies").replace("{dial}", country.dial)}
              </p>
            </div>
            <div>
              <Label htmlFor="a_phone">{t("account.primary_phone")} *</Label>
              <PhoneDigitsInput id="a_phone" dial={country.dial} value={form.phone}
                onChange={(v) => setForm({ ...form, phone: v })} />
              <p className="mt-1 text-[11px] text-muted-foreground">{t("account.whatsapp_available")}</p>
              {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone}</p>}
            </div>
            <div>
              <Label htmlFor="a_phone2">{t("account.secondary_phone")}</Label>
              <PhoneDigitsInput id="a_phone2" dial={country.dial} value={form.phone_secondary}
                onChange={(v) => setForm({ ...form, phone_secondary: v })} />
              {errors.phone_secondary && <p className="mt-1 text-xs text-destructive">{errors.phone_secondary}</p>}
            </div>
            <div>
              <Label htmlFor="a_phone3">{t("account.alt_phone")}</Label>
              <PhoneDigitsInput id="a_phone3" dial={country.dial} value={form.phone_alt}
                onChange={(v) => setForm({ ...form, phone_alt: v })} />
              <p className="mt-1 text-[11px] text-muted-foreground">{t("account.alt_phone_hint")}</p>
              {errors.phone_alt && <p className="mt-1 text-xs text-destructive">{errors.phone_alt}</p>}
            </div>
            <div>
              <Label htmlFor="a_addr">{t("checkout.address")} *</Label>
              <Input id="a_addr" value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={300} />
              {errors.address && <p className="mt-1 text-xs text-destructive">{errors.address}</p>}
            </div>
            <div>
              <Label htmlFor="a_city">{t("checkout.city")} *</Label>
              <Input id="a_city" value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })} maxLength={100} />
              {errors.city && <p className="mt-1 text-xs text-destructive">{errors.city}</p>}
            </div>
            <div>
              <Label>Pays de livraison *</Label>
              <CountrySelect
                value={destinationCountryId}
                onChange={setDestinationCountryId}
                onlyEnabled
                placeholder="Choisir le pays de livraison"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Détermine la commission appliquée aux produits livrés à cette adresse.
              </p>
              {errors.destination_country_id && (
                <p className="mt-1 text-xs text-destructive">{errors.destination_country_id}</p>
              )}
            </div>
            <div>
              <Button type="button" variant="outline" size="sm" onClick={useGeolocation} disabled={locating} className="w-full">
                <Crosshair className="h-4 w-4" />
                {locating ? t("common.loading") : form.latitude ? t("checkout.location_refresh") : t("checkout.use_location")}
              </Button>
            </div>
            <div>
              <Label htmlFor="a_note">{t("checkout.note")}</Label>
              <Textarea id="a_note" rows={2} value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={500} />
            </div>
            <Button onClick={save} disabled={saving} className="w-full">
              {saving ? t("common.saving") : t("account.save_address")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RemoveVendorCard() {
  const router = useRouter();
  const { user } = useAuth();
  const removeFn = useServerFn(removeVendorAccount);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) {
      toast.error("Email et mot de passe requis");
      return;
    }
    setLoading(true);
    try {
      await removeFn({ data: { email: email.trim(), password } });
      toast.success("Votre compte vendeur a été supprimé.");
      setOpen(false);
      setPassword("");
      router.invalidate();
      router.navigate({ to: "/account" });
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <h2 className="text-sm font-semibold text-destructive">Supprimer mon compte vendeur</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Votre boutique et le rôle vendeur seront retirés. Vos produits ne seront plus visibles.
        Votre compte acheteur restera actif.
      </p>
      <Button
        variant="destructive"
        size="sm"
        className="mt-3 rounded-full"
        onClick={() => { setEmail(user?.email ?? ""); setOpen(true); }}
      >
        <Trash2 className="h-4 w-4" /> Supprimer mon compte vendeur
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
            <DialogDescription>
              Confirmez avec votre email et mot de passe pour supprimer votre compte vendeur.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div>
              <Label>Mot de passe</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            <Button variant="destructive" onClick={submit} disabled={loading} className="w-full">
              {loading ? "Suppression…" : "Confirmer la suppression"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

