import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { useImageCompression } from "@/hooks/use-image-compression";
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
import { SmartImageUpload } from "@/components/images/SmartImageUpload";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrenciesProvider, useCurrencies } from "@/hooks/use-currencies";

export const Route = createFileRoute("/vendor/settings")({
  component: () => (
    <CurrenciesProvider>
      <VendorSettings />
    </CurrenciesProvider>
  ),
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
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_COUNTRY_CODE);
  const [phoneLocal, setPhoneLocal] = useState("");
  const [waCountry, setWaCountry] = useState(DEFAULT_COUNTRY_CODE);
  const [waLocal, setWaLocal] = useState("");
  const [sourceCountryId, setSourceCountryId] = useState<string | null>(null);
  const [vendorMode, setVendorMode] = useState<"commission" | "no_commission">("no_commission");
  const [defaultCurrency, setDefaultCurrency] = useState<string>("XOF");
  const { currencies } = useCurrencies();
  const { compress } = useImageCompression();

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
    setDefaultCurrency(((p.default_currency_code as string | undefined) ?? "XOF"));
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

  const save = async () => {
    if (!user) return;
    if (!sourceCountryId) {
      toast.error("Le pays d'origine de vos produits est obligatoire.");
      return;
    }
    setSaving(true);
    const phoneFull = joinPhone(phoneCountry, phoneLocal);
    const waFull = joinPhone(waCountry, waLocal);
    const payload = { ...f, phone: phoneFull, shop_whatsapp: waFull, shop_hours_schedule: schedule, source_country_id: sourceCountryId, vendor_mode: vendorMode };
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

      {/* Banner + logo upload avec compression auto */}
      <div className="overflow-hidden rounded-2xl border bg-card">
        <SmartImageUpload
          value={f.shop_banner_url}
          onUpload={(url) => setF((prev) => ({ ...prev, shop_banner_url: url }))}
          onRemove={() => setF((prev) => ({ ...prev, shop_banner_url: null }))}
          bucket="site-assets"
          folder={`vendors/${user?.id ?? "temp"}`}
          maxWidth={1200}
          maxHeight={400}
          aspectRatio="wide"
          label=""
          className="rounded-none border-0"
        />
        <div className="flex items-center gap-3 p-3">
          <div className="relative -mt-10">
            <SmartImageUpload
              value={f.shop_logo_url}
              onUpload={(url) => setF((prev) => ({ ...prev, shop_logo_url: url }))}
              onRemove={() => setF((prev) => ({ ...prev, shop_logo_url: null }))}
              bucket="site-assets"
              folder={`vendors/${user?.id ?? "temp"}`}
              maxWidth={400}
              maxHeight={400}
              aspectRatio="square"
              label=""
              className="h-16 w-16 rounded-full border-4 border-background"
            />
          </div>
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
        <Label className="text-base font-semibold">Pays d'origine des produits *</Label>
        <p className="text-[11px] text-muted-foreground">
          Obligatoire. Utilisé pour calculer la commission selon le pays de livraison de l'acheteur.
        </p>
        <CountrySelect
          value={sourceCountryId}
          onChange={setSourceCountryId}
          placeholder="Choisir votre pays"
          onlyEnabled
        />
        {!sourceCountryId && (
          <p className="text-[11px] font-medium text-destructive">Champ obligatoire.</p>
        )}

        <div className="pt-2 space-y-2">
          <Label className="text-base font-semibold">Mode commission</Label>
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {vendorMode === "commission" ? "Avec commission" : "Sans commission"}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {vendorMode === "commission"
                    ? "Les commandes sont reçues et gérées par la plateforme. Vous n'avez pas accès aux infos client : l'admin vous transmet la préparation par WhatsApp."
                    : "Vous recevez vos commandes directement et gérez la livraison vous-même."}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${vendorMode === "commission" ? "bg-primary/15 text-primary" : "bg-emerald-500/15 text-emerald-700"}`}>
                {vendorMode === "commission" ? "Plateforme" : "Direct"}
              </span>
            </div>
            <p className="mt-2 text-[11px] italic text-muted-foreground">
              Ce mode est défini par l'administration et ne peut pas être modifié ici.
            </p>
          </div>
        </div>
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
