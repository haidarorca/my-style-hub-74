import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  DAY_ORDER, DEFAULT_SCHEDULE, normalizeSchedule,
  type DayKey, type ShopSchedule,
} from "@/lib/shop-hours";
import {
  COUNTRIES, DEFAULT_COUNTRY_CODE, getCountryByCode, splitPhone, joinPhone,
} from "@/lib/phone-countries";
import { CountrySelect } from "@/components/CountrySelect";

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
  const { t } = useI18n();
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
  const [sourceCountryId, setSourceCountryId] = useState<string | null>(null);
  const [vendorMode, setVendorMode] = useState<"commission" | "no_commission">("no_commission");
  const logoRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  const DAY_T: Record<DayKey, string> = {
    mon: t("vset.day.mon"), tue: t("vset.day.tue"), wed: t("vset.day.wed"),
    thu: t("vset.day.thu"), fri: t("vset.day.fri"), sat: t("vset.day.sat"), sun: t("vset.day.sun"),
  };

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
    setSourceCountryId((p.source_country_id as string | null) ?? null);
    setVendorMode(((p.vendor_mode as "commission" | "no_commission" | undefined) ?? "no_commission"));
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
    toast.success(t("vset.copied_toast"));
  };

  const upload = async (file: File, kind: "logo" | "banner") => {
    if (!user) return;
    setUploading(kind);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `vendors/${user.id}/${kind}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("site-assets").upload(path, file, { upsert: true });
    if (error) {
      toast.error(t("vset.upload_err") + error.message);
      setUploading(null);
      return;
    }
    const { data } = supabase.storage.from("site-assets").getPublicUrl(path);
    setF((prev) => ({ ...prev, [kind === "logo" ? "shop_logo_url" : "shop_banner_url"]: data.publicUrl }));
    setUploading(null);
    toast.success(kind === "logo" ? t("vset.logo_ready") : t("vset.banner_ready"));
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const phoneFull = joinPhone(phoneCountry, phoneLocal);
    const waFull = joinPhone(waCountry, waLocal);
    const payload = { ...f, phone: phoneFull, shop_whatsapp: waFull, shop_hours_schedule: schedule, source_country_id: sourceCountryId };
    const { error } = await supabase.from("profiles").update(payload as never).eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error(t("vset.err_prefix") + error.message);
      return;
    }
    await refreshProfile();
    toast.success(t("vset.saved_toast"));
  };

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="text-xl font-bold">{t("vset.title")}</h1>

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
            {t("vset.banner")}
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
              <img src={f.shop_logo_url} alt={t("vset.logo_alt")} className="h-full w-full object-cover" />
            ) : uploading === "logo" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ImagePlus className="h-5 w-5 text-muted-foreground" />
            )}
          </button>
          <input ref={logoRef} type="file" accept="image/*" hidden
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "logo")} />
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">{t("vset.touch_hint")}</p>
            <p className="text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">{t("vset.dims_banner")}</span> {t("vset.dims_banner_val")} · <span className="font-medium text-foreground">{t("vset.dims_logo")}</span> {t("vset.dims_logo_val")}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="space-y-1.5">
          <Label htmlFor="shop">{t("vset.shop_name")}</Label>
          <Input id="shop" value={f.shop_name} onChange={(e) => setF({ ...f, shop_name: e.target.value })} placeholder={t("vset.shop_name_ph")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="desc">{t("vset.desc")}</Label>
          <Textarea id="desc" rows={3} maxLength={200}
            value={f.shop_description}
            onChange={(e) => setF({ ...f, shop_description: e.target.value })}
            placeholder={t("vset.desc_ph")} />
        </div>
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-4">
        <Label className="text-base font-semibold">Pays d'origine des produits</Label>
        <p className="text-[11px] text-muted-foreground">
          Utilisé pour calculer la commission en fonction du pays de livraison de l'acheteur.
        </p>
        <CountrySelect
          value={sourceCountryId}
          onChange={setSourceCountryId}
          allowNull
          nullLabel="— Non défini —"
          placeholder="Choisir votre pays"
          onlyEnabled
        />
      </div>
      {/* Schedule editor */}
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">{t("vset.hours_title")}</Label>
          <button type="button" onClick={applyMonToSat} className="text-xs font-medium text-primary">
            {t("vset.copy_mon_sat")}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">{t("vset.slot_hint")}</p>
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
                    <span className="text-sm font-medium">{DAY_T[day]}</span>
                  </div>
                  {!d.open && <span className="flex-1 text-sm text-muted-foreground">{t("vset.closed")}</span>}
                  {d.open && (
                    <button
                      type="button"
                      onClick={addSlot}
                      className="ml-auto text-xs font-medium text-primary"
                    >
                      {t("vset.add_slot")}
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
                        <span className="text-xs text-muted-foreground">{t("vset.to")}</span>
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
                            aria-label={t("vset.remove_slot")}
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
          <Label htmlFor="hours">{t("vset.delivery_note")}</Label>
          <Input id="hours" value={f.shop_hours} onChange={(e) => setF({ ...f, shop_hours: e.target.value })} placeholder={t("vset.delivery_note_ph")} />
        </div>
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-4">
        <Label className="text-base font-semibold">{t("vset.contact")}</Label>
        <PhoneField
          id="phone"
          label={t("vset.phone")}
          country={phoneCountry}
          local={phoneLocal}
          onCountryChange={setPhoneCountry}
          onLocalChange={setPhoneLocal}
          dialAria={t("vset.dial_aria")}
          willSave={t("vset.will_save")}
          testWa={t("vset.test_wa")}
        />
        <PhoneField
          id="wa"
          label={t("vset.wa")}
          country={waCountry}
          local={waLocal}
          onCountryChange={setWaCountry}
          onLocalChange={setWaLocal}
          showWaTest
          dialAria={t("vset.dial_aria")}
          willSave={t("vset.will_save")}
          testWa={t("vset.test_wa")}
        />
        <div className="space-y-1.5">
          <Label htmlFor="addr">{t("vset.address")}</Label>
          <Textarea id="addr" rows={2} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        </div>
        <Button onClick={save} disabled={saving} size="lg" className="w-full">
          {saving ? t("vset.saving") : t("vset.save")}
        </Button>
      </div>

      <Link to="/account" className="block text-center text-sm text-muted-foreground underline">
        {t("vset.edit_account")}
      </Link>
    </div>
  );
}

function PhoneField({
  id, label, country, local, onCountryChange, onLocalChange, showWaTest,
  dialAria, willSave, testWa,
}: {
  id: string;
  label: string;
  country: string;
  local: string;
  onCountryChange: (code: string) => void;
  onLocalChange: (v: string) => void;
  showWaTest?: boolean;
  dialAria: string;
  willSave: string;
  testWa: string;
}) {
  const c = getCountryByCode(country);
  const fullDigits = c ? c.dial + local.replace(/\D/g, "") : local.replace(/\D/g, "");
  const waLink = fullDigits ? `https://wa.me/${fullDigits}` : "";
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <select
          aria-label={dialAria}
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
          <span>{willSave} <span className="font-mono">+{fullDigits}</span></span>
          {showWaTest && (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary"
            >
              {testWa}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
