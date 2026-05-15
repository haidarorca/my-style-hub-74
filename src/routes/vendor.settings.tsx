import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  DAY_LABELS, DAY_ORDER, DEFAULT_SCHEDULE, normalizeSchedule,
  type DayKey, type ShopSchedule,
} from "@/lib/shop-hours";
import {
  COUNTRIES, DEFAULT_COUNTRY_CODE, getCountryByCode, splitPhone, joinPhone,
} from "@/lib/phone-countries";

export const Route = createFileRoute("/vendor/settings")({
  component: VendorSettings,
});

type ShopFields = {
  shop_name: string;
  phone: string;
  address: string;
  shop_description: string;
  shop_hours: string;
  shop_whatsapp: string;
  shop_logo_url: string | null;
  shop_banner_url: string | null;
};

function VendorSettings() {
  const { user, profile, refreshProfile } = useAuth();
  const [f, setF] = useState<ShopFields>({
    shop_name: "",
    phone: "",
    address: "",
    shop_description: "",
    shop_hours: "",
    shop_whatsapp: "",
    shop_logo_url: null,
    shop_banner_url: null,
  });
  const [schedule, setSchedule] = useState<ShopSchedule>(DEFAULT_SCHEDULE);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "banner" | null>(null);
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_COUNTRY_CODE);
  const [phoneLocal, setPhoneLocal] = useState("");
  const [waCountry, setWaCountry] = useState(DEFAULT_COUNTRY_CODE);
  const [waLocal, setWaLocal] = useState("");
  const logoRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profile) return;
    const p = profile as unknown as Record<string, unknown>;
    const phoneRaw = (p.phone as string) ?? "";
    const waRaw = (p.shop_whatsapp as string) ?? "";
    setF({
      shop_name: (p.shop_name as string) ?? "",
      phone: phoneRaw,
      address: (p.address as string) ?? "",
      shop_description: (p.shop_description as string) ?? "",
      shop_hours: (p.shop_hours as string) ?? "",
      shop_whatsapp: waRaw,
      shop_logo_url: (p.shop_logo_url as string) ?? null,
      shop_banner_url: (p.shop_banner_url as string) ?? null,
    });
    const ph = splitPhone(phoneRaw);
    setPhoneCountry(ph.code);
    setPhoneLocal(ph.local);
    const wa = splitPhone(waRaw);
    setWaCountry(wa.code);
    setWaLocal(wa.local);
    setSchedule(normalizeSchedule(p.shop_hours_schedule));
  }, [profile]);

  const updateDay = (day: DayKey, patch: Partial<ShopSchedule[DayKey]>) =>
    setSchedule((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));

  const applyMonToSat = () => {
    const ref = schedule.mon;
    setSchedule((prev) => {
      const next = { ...prev };
      (["tue", "wed", "thu", "fri", "sat"] as DayKey[]).forEach((d) => {
        next[d] = { ...ref };
      });
      return next;
    });
    toast.success("Horaires copiés du lundi au samedi");
  };

  const upload = async (file: File, kind: "logo" | "banner") => {
    if (!user) return;
    setUploading(kind);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `vendors/${user.id}/${kind}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("site-assets").upload(path, file, { upsert: true });
    if (error) {
      toast.error("Échec du téléversement : " + error.message);
      setUploading(null);
      return;
    }
    const { data } = supabase.storage.from("site-assets").getPublicUrl(path);
    setF((prev) => ({ ...prev, [kind === "logo" ? "shop_logo_url" : "shop_banner_url"]: data.publicUrl }));
    setUploading(null);
    toast.success(kind === "logo" ? "Logo prêt" : "Bannière prête");
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const phoneFull = joinPhone(phoneCountry, phoneLocal);
    const waFull = joinPhone(waCountry, waLocal);
    const payload = { ...f, phone: phoneFull, shop_whatsapp: waFull, shop_hours_schedule: schedule };
    const { error } = await supabase.from("profiles").update(payload as never).eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error("Erreur : " + error.message);
      return;
    }
    await refreshProfile();
    toast.success("Boutique enregistrée");
  };

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="text-xl font-bold">Paramètres boutique</h1>

      {/* Banner + logo preview */}
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div
          className="relative h-28 w-full bg-gradient-to-br from-primary/40 to-accent/40"
          style={f.shop_banner_url ? { backgroundImage: `url(${f.shop_banner_url})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        >
          <button
            type="button"
            onClick={() => bannerRef.current?.click()}
            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white"
          >
            {uploading === "banner" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />}
            Bannière
          </button>
          <input ref={bannerRef} type="file" accept="image/*" hidden
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "banner")} />
        </div>
        <div className="flex items-center gap-3 p-3">
          <button
            type="button"
            onClick={() => logoRef.current?.click()}
            className="relative -mt-10 flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-muted"
          >
            {f.shop_logo_url ? (
              <img src={f.shop_logo_url} alt="logo" className="h-full w-full object-cover" />
            ) : uploading === "logo" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ImagePlus className="h-5 w-5 text-muted-foreground" />
            )}
          </button>
          <input ref={logoRef} type="file" accept="image/*" hidden
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "logo")} />
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Touchez le logo ou la bannière pour changer l'image.</p>
            <p className="text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">Bannière :</span> 1600 × 500 px (16:5) · <span className="font-medium text-foreground">Logo :</span> 400 × 400 px (carré)
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="space-y-1.5">
          <Label htmlFor="shop">Nom de la boutique</Label>
          <Input id="shop" value={f.shop_name} onChange={(e) => setF({ ...f, shop_name: e.target.value })} placeholder="Ma boutique" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="desc">Description courte</Label>
          <Textarea id="desc" rows={3} maxLength={200}
            value={f.shop_description}
            onChange={(e) => setF({ ...f, shop_description: e.target.value })}
            placeholder="Une phrase qui présente votre boutique" />
        </div>
      </div>

      {/* Schedule editor */}
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Horaires d'ouverture</Label>
          <button type="button" onClick={applyMonToSat} className="text-xs font-medium text-primary">
            Copier Lun→Sam
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Astuce : ajoutez un 2<sup>e</sup> créneau pour gérer une pause (ex : 9h–12h puis 14h–19h).
        </p>
        <div className="space-y-2">
          {DAY_ORDER.map((day) => {
            const d = schedule[day];
            const updateSlot = (i: number, patch: Partial<{ from: string; to: string }>) => {
              const slots = d.slots.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
              updateDay(day, { slots });
            };
            const addSlot = () => {
              const last = d.slots[d.slots.length - 1];
              updateDay(day, { slots: [...d.slots, { from: last?.to ?? "14:00", to: "19:00" }] });
            };
            const removeSlot = (i: number) => {
              const slots = d.slots.filter((_, idx) => idx !== i);
              updateDay(day, { slots: slots.length > 0 ? slots : [{ from: "09:00", to: "19:00" }] });
            };
            return (
              <div key={day} className="rounded-lg border bg-background p-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex w-20 shrink-0 items-center gap-2">
                    <Switch checked={d.open} onCheckedChange={(open) => updateDay(day, { open })} />
                    <span className="text-sm font-medium">{DAY_LABELS[day].slice(0, 3)}</span>
                  </div>
                  {!d.open && <span className="flex-1 text-sm text-muted-foreground">Fermé</span>}
                  {d.open && (
                    <button
                      type="button"
                      onClick={addSlot}
                      className="ml-auto text-xs font-medium text-primary"
                    >
                      + Pause
                    </button>
                  )}
                </div>
                {d.open && (
                  <div className="mt-2 space-y-1.5">
                    {d.slots.map((s, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <Input
                          type="time"
                          value={s.from}
                          onChange={(e) => updateSlot(i, { from: e.target.value })}
                          className="h-9 flex-1 px-2 text-sm"
                        />
                        <span className="text-xs text-muted-foreground">à</span>
                        <Input
                          type="time"
                          value={s.to}
                          onChange={(e) => updateSlot(i, { to: e.target.value })}
                          className="h-9 flex-1 px-2 text-sm"
                        />
                        {d.slots.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSlot(i)}
                            className="px-2 text-xs font-medium text-destructive"
                            aria-label="Supprimer ce créneau"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="space-y-1.5 pt-2">
          <Label htmlFor="hours">Note de livraison (optionnel)</Label>
          <Input id="hours" value={f.shop_hours} onChange={(e) => setF({ ...f, shop_hours: e.target.value })} placeholder="Ex : Livraison sous 24h" />
        </div>
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-4">
        <Label className="text-base font-semibold">Contact</Label>
        <PhoneField
          id="phone"
          label="Téléphone"
          country={phoneCountry}
          local={phoneLocal}
          onCountryChange={setPhoneCountry}
          onLocalChange={setPhoneLocal}
        />
        <PhoneField
          id="wa"
          label="Numéro WhatsApp (optionnel)"
          country={waCountry}
          local={waLocal}
          onCountryChange={setWaCountry}
          onLocalChange={setWaLocal}
          showWaTest
        />
        <div className="space-y-1.5">
          <Label htmlFor="addr">Adresse</Label>
          <Textarea id="addr" rows={2} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        </div>
        <Button onClick={save} disabled={saving} size="lg" className="w-full">
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>

      <Link to="/account" className="block text-center text-sm text-muted-foreground underline">
        Modifier mon compte
      </Link>
    </div>
  );
}

function PhoneField({
  id, label, country, local, onCountryChange, onLocalChange, showWaTest,
}: {
  id: string;
  label: string;
  country: string;
  local: string;
  onCountryChange: (code: string) => void;
  onLocalChange: (v: string) => void;
  showWaTest?: boolean;
}) {
  const c = getCountryByCode(country);
  const fullDigits = c ? c.dial + local.replace(/\D/g, "") : local.replace(/\D/g, "");
  const waLink = fullDigits ? `https://wa.me/${fullDigits}` : "";
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <select
          aria-label="Indicatif pays"
          value={country}
          onChange={(e) => onCountryChange(e.target.value)}
          className="h-10 shrink-0 rounded-md border border-input bg-background px-2 text-sm"
        >
          {COUNTRIES.map((co) => (
            <option key={co.code} value={co.code}>
              {co.flag} +{co.dial}
            </option>
          ))}
        </select>
        <Input
          id={id}
          inputMode="tel"
          value={local}
          onChange={(e) => onLocalChange(e.target.value.replace(/[^\d\s]/g, ""))}
          placeholder={c?.example ?? ""}
          className="flex-1"
        />
      </div>
      {fullDigits && (
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Sera enregistré : <span className="font-mono">+{fullDigits}</span></span>
          {showWaTest && (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary"
            >
              Tester sur WhatsApp
            </a>
          )}
        </div>
      )}
    </div>
  );
}
