import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, Store, ArrowLeft } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { CountrySelect } from "@/components/CountrySelect";
import { useCountries, useCountryLabel } from "@/hooks/use-countries";
import {
  DAY_ORDER, DEFAULT_SCHEDULE, type DayKey, type ShopSchedule,
} from "@/lib/shop-hours";
import {
  COUNTRIES, DEFAULT_COUNTRY_CODE, getCountryByCode, joinPhone, splitPhone,
} from "@/lib/phone-countries";
import { becomeVendor } from "@/lib/vendor-onboarding.functions";

export const Route = createFileRoute("/become-vendor")({
  component: BecomeVendorPage,
  head: () => ({
    meta: [
      { title: "Devenir vendeur — Kawzone" },
      { name: "description", content: "Rejoignez Kawzone et vendez vos produits en ligne au Sénégal. Inscription rapide et boutique personnalisée." },
      { property: "og:title", content: "Devenir vendeur — Kawzone" },
      { property: "og:description", content: "Rejoignez Kawzone et vendez vos produits en ligne au Sénégal." },
      { property: "og:url", content: "https://kawzone.com/become-vendor" },
    ],
    links: [{ rel: "canonical", href: "https://kawzone.com/become-vendor" }],
  }),
});

function BecomeVendorPage() {
  const { user, profile, loading, isVendor, refreshProfile } = useAuth();
  const router = useRouter();
  const call = useServerFn(becomeVendor);
  const { data: countriesList } = useCountries({ onlyEnabled: true });
  const labelOfCountry = useCountryLabel();

  const [shopName, setShopName] = useState("");
  const [fullName, setFullName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [hoursNote, setHoursNote] = useState("");
  const [schedule, setSchedule] = useState<ShopSchedule>(DEFAULT_SCHEDULE);
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_COUNTRY_CODE);
  const [phoneLocal, setPhoneLocal] = useState("");
  const [waCountry, setWaCountry] = useState(DEFAULT_COUNTRY_CODE);
  const [waLocal, setWaLocal] = useState("");
  const [sourceCountryId, setSourceCountryId] = useState<string | null>(null);
  const [shipsIntl, setShipsIntl] = useState(false);
  const [allowedDest, setAllowedDest] = useState<string[]>([]);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"logo" | "banner" | null>(null);
  const [saving, setSaving] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) router.navigate({ to: "/login" });
    if (!loading && isVendor) router.navigate({ to: "/vendor" });
  }, [loading, user, isVendor, router]);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? "");
    if (profile.phone) {
      const p = splitPhone(profile.phone);
      setPhoneCountry(p.code);
      setPhoneLocal(p.local);
    }
    if (profile.address) setAddress(profile.address);
  }, [profile]);

  const upload = async (file: File, kind: "logo" | "banner") => {
    if (!user) return;
    setUploading(kind);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `vendors/${user.id}/${kind}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("site-assets").upload(path, file, { upsert: true });
    if (error) {
      toast.error("Erreur d'envoi : " + error.message);
      setUploading(null);
      return;
    }
    const { data } = supabase.storage.from("site-assets").getPublicUrl(path);
    if (kind === "logo") setLogoUrl(data.publicUrl);
    else setBannerUrl(data.publicUrl);
    setUploading(null);
  };

  const updateDay = (day: DayKey, patch: Partial<ShopSchedule[DayKey]>) =>
    setSchedule((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));

  const toggleDest = (id: string) => {
    setAllowedDest((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const submit = async () => {
    if (!shopName.trim()) return toast.error("Nom de la boutique requis");
    if (!fullName.trim()) return toast.error("Nom complet requis");
    if (!phoneLocal.trim()) return toast.error("Téléphone requis");
    if (!sourceCountryId) return toast.error("Pays d'origine requis");

    setSaving(true);
    try {
      await call({
        data: {
          shop_name: shopName.trim(),
          full_name: fullName.trim(),
          phone: joinPhone(phoneCountry, phoneLocal),
          shop_whatsapp: waLocal.trim() ? joinPhone(waCountry, waLocal) : null,
          address: address.trim() || null,  // NOTE: profile.address = adresse publique boutique (affichée aux clients). Les adresses logistiques sont dans la table `addresses`.
          shop_description: description.trim() || null,
          shop_hours: hoursNote.trim() || null,
          shop_hours_schedule: schedule,
          shop_logo_url: logoUrl,
          shop_banner_url: bannerUrl,
          source_country_id: sourceCountryId,
          ships_internationally: shipsIntl,
          allowed_destination_country_ids: shipsIntl ? allowedDest : [],
          vendor_mode: "no_commission",
        },
      });
      toast.success("Félicitations ! Votre boutique est activée.");
      await refreshProfile();
      router.navigate({ to: "/vendor" });
    } catch (e) {
      toast.error((e as Error).message ?? "Erreur lors de l'activation");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Chargement…</div>;
  }

  return (
    <div className="min-h-screen bg-background pb-safe">
      <AppHeader />
      <main className="mx-auto max-w-2xl space-y-5 px-[var(--page-px)] py-4">
        <BackButton fallbackTo="/account" />

        <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-accent/10 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Devenir vendeur</h1>
              <p className="text-xs text-muted-foreground">Remplissez les informations de votre boutique pour commencer à vendre.</p>
            </div>
          </div>
        </div>

        {/* Banner + logo */}
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div
            className="relative h-28 w-full bg-gradient-to-br from-primary/40 to-accent/40"
            style={bannerUrl ? { backgroundImage: `url(${bannerUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
          >
            <button type="button" onClick={() => bannerRef.current?.click()}
              className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white">
              {uploading === "banner" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />}
              Bannière
            </button>
            <input ref={bannerRef} type="file" accept="image/*" hidden
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "banner")} />
          </div>
          <div className="flex items-center gap-3 p-3">
            <button type="button" onClick={() => logoRef.current?.click()}
              className="relative -mt-10 flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-muted">
              {logoUrl ? <img src={logoUrl} alt="logo" className="h-full w-full object-cover" />
                : uploading === "logo" ? <Loader2 className="h-5 w-5 animate-spin" />
                : <ImagePlus className="h-5 w-5 text-muted-foreground" />}
            </button>
            <input ref={logoRef} type="file" accept="image/*" hidden
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "logo")} />
            <p className="text-xs text-muted-foreground">Ajoutez votre logo et une bannière pour votre boutique.</p>
          </div>
        </div>

        {/* Identity */}
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <div className="space-y-1.5">
            <Label htmlFor="shop">Nom de la boutique *</Label>
            <Input id="shop" value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="Ex. KawZone Store" maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="full">Votre nom complet *</Label>
            <Input id="full" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc">Description</Label>
            <Textarea id="desc" rows={3} maxLength={500} value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Parlez de votre boutique en quelques mots." />
          </div>
        </div>

        {/* Country & shipping */}
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <Label className="text-base font-semibold">Pays d'origine des produits *</Label>
          <CountrySelect value={sourceCountryId} onChange={setSourceCountryId} placeholder="Choisir votre pays" onlyEnabled />

          <div className="flex items-center justify-between pt-2">
            <div>
              <p className="text-sm font-semibold">Livraison internationale</p>
              <p className="text-[11px] text-muted-foreground">Choisissez les pays vers lesquels vous livrez.</p>
            </div>
            <Switch checked={shipsIntl} onCheckedChange={setShipsIntl} />
          </div>
          {shipsIntl && (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border bg-background p-2">
              {(countriesList ?? []).map((c) => (
                <label key={c.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                  <input type="checkbox" checked={allowedDest.includes(c.id)} onChange={() => toggleDest(c.id)} />
                  <span>{c.flag_emoji} {labelOfCountry(c)}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Contact */}
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <Label className="text-base font-semibold">Contact</Label>
          <PhoneRow label="Téléphone *" country={phoneCountry} local={phoneLocal} onCountry={setPhoneCountry} onLocal={setPhoneLocal} />
          <PhoneRow label="WhatsApp" country={waCountry} local={waLocal} onCountry={setWaCountry} onLocal={setWaLocal} />
          <div className="space-y-1.5">
            <Label htmlFor="addr">Adresse</Label>
            <Textarea id="addr" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} />
          </div>
        </div>

        {/* Schedule */}
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <Label className="text-base font-semibold">Horaires d'ouverture</Label>
          <div className="space-y-2">
            {DAY_ORDER.map((day) => {
              const d = schedule[day];
              return (
                <div key={day} className="flex items-center gap-2 rounded-lg border bg-background p-2.5">
                  <div className="flex w-24 shrink-0 items-center gap-2">
                    <Switch checked={d.open} onCheckedChange={(open) => updateDay(day, { open })} />
                    <span className="text-sm font-medium capitalize">{day}</span>
                  </div>
                  {d.open ? (
                    <div className="flex flex-1 items-center gap-1.5">
                      <Input type="time" value={d.slots[0]?.from ?? "09:00"}
                        onChange={(e) => updateDay(day, { slots: [{ from: e.target.value, to: d.slots[0]?.to ?? "19:00" }] })}
                        className="h-9 flex-1 px-2 text-sm" />
                      <span className="text-xs text-muted-foreground">à</span>
                      <Input type="time" value={d.slots[0]?.to ?? "19:00"}
                        onChange={(e) => updateDay(day, { slots: [{ from: d.slots[0]?.from ?? "09:00", to: e.target.value }] })}
                        className="h-9 flex-1 px-2 text-sm" />
                    </div>
                  ) : <span className="text-sm text-muted-foreground">Fermé</span>}
                </div>
              );
            })}
          </div>
          <div className="space-y-1.5 pt-1">
            <Label htmlFor="hnote">Note de livraison</Label>
            <Input id="hnote" value={hoursNote} onChange={(e) => setHoursNote(e.target.value)} placeholder="Ex. Livraison sous 24h" />
          </div>
        </div>

        <Button onClick={submit} disabled={saving} size="lg" className="w-full">
          {saving ? "Activation…" : "Activer ma boutique"}
        </Button>
        <Link to="/account" className="block text-center text-xs text-muted-foreground underline">
          Annuler et revenir au compte
        </Link>
      </main>
    </div>
  );
}

function PhoneRow({ label, country, local, onCountry, onLocal }: {
  label: string; country: string; local: string;
  onCountry: (c: string) => void; onLocal: (v: string) => void;
}) {
  const c = getCountryByCode(country);
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <select value={country} onChange={(e) => onCountry(e.target.value)}
          className="h-10 shrink-0 rounded-md border border-input bg-background px-2 text-sm">
          {COUNTRIES.map((co) => (
            <option key={co.code} value={co.code}>{co.flag} +{co.dial}</option>
          ))}
        </select>
        <Input inputMode="tel" value={local}
          onChange={(e) => onLocal(e.target.value.replace(/[^\d\s]/g, ""))}
          placeholder={c?.example ?? ""} className="flex-1" />
      </div>
    </div>
  );
}
