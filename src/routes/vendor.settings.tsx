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
  const logoRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profile) return;
    const p = profile as unknown as Record<string, unknown>;
    setF({
      shop_name: (p.shop_name as string) ?? "",
      phone: (p.phone as string) ?? "",
      address: (p.address as string) ?? "",
      shop_description: (p.shop_description as string) ?? "",
      shop_hours: (p.shop_hours as string) ?? "",
      shop_whatsapp: (p.shop_whatsapp as string) ?? "",
      shop_logo_url: (p.shop_logo_url as string) ?? null,
      shop_banner_url: (p.shop_banner_url as string) ?? null,
    });
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
    const { error } = await supabase.from("profiles").update(f as never).eq("id", user.id);
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
          <p className="text-xs text-muted-foreground">Touchez le logo ou la bannière pour changer l'image.</p>
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
        <div className="space-y-1.5">
          <Label htmlFor="hours">Horaires de réponse / livraison</Label>
          <Input id="hours" value={f.shop_hours} onChange={(e) => setF({ ...f, shop_hours: e.target.value })} placeholder="Ex : Lun-Sam 9h-19h, livraison 24h" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Téléphone</Label>
          <Input id="phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+225 ..." />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wa">Numéro WhatsApp (optionnel)</Label>
          <Input id="wa" value={f.shop_whatsapp} onChange={(e) => setF({ ...f, shop_whatsapp: e.target.value })} placeholder="2250700000000" />
        </div>
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
