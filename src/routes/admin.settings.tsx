import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, Plus, Upload, ArrowUp, ArrowDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SiteSettings, HomeBanner } from "@/hooks/use-site-settings";

export const Route = createFileRoute("/admin/settings")({
  component: () => <PermissionGate superOnly><SettingsPage /></PermissionGate>,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { data: initial } = useQuery({
    queryKey: ["admin", "site_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings" as never)
        .select("*")
        .eq("id", "main")
        .maybeSingle();
      if (error) throw error;
      return data as SiteSettings | null;
    },
  });

  const [form, setForm] = useState<Partial<SiteSettings> | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (initial && !form) setForm(initial); }, [initial, form]);

  const set = <K extends keyof SiteSettings>(k: K, v: SiteSettings[K]) =>
    setForm((f) => ({ ...(f ?? {}), [k]: v }));

  async function uploadLogo(file: File) {
    const ext = file.name.split(".").pop() ?? "png";
    const path = `logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("site-assets").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return; }
    const { data } = supabase.storage.from("site-assets").getPublicUrl(path);
    set("logo_url", data.publicUrl);
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    const { error } = await supabase
      .from("site_settings" as never)
      .update(form as never)
      .eq("id", "main");
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Paramètres enregistrés");
    qc.invalidateQueries({ queryKey: ["site_settings"] });
    qc.invalidateQueries({ queryKey: ["admin", "site_settings"] });
  }

  if (!form) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Paramètres du site</h1>
        <Button onClick={save} disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Identité</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Nom du site</Label>
            <Input value={form.site_name ?? ""} onChange={(e) => set("site_name", e.target.value)} />
          </div>
          <div>
            <Label>Logo</Label>
            <div className="flex items-center gap-3">
              {form.logo_url && <img src={form.logo_url} alt="logo" className="h-10 w-auto rounded bg-muted p-1" />}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
                <Upload className="h-4 w-4" />
                <span>Téléverser</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
              </label>
              {form.logo_url && (
                <Button variant="ghost" size="sm" onClick={() => set("logo_url", null)}>Retirer</Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Couleurs</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div>
            <Label>Couleur principale</Label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.primary_color ?? "#e85d3a"} onChange={(e) => set("primary_color", e.target.value)} className="h-10 w-14 rounded border" />
              <Input value={form.primary_color ?? ""} onChange={(e) => set("primary_color", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Couleur d'accent</Label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.accent_color ?? "#1a1a1a"} onChange={(e) => set("accent_color", e.target.value)} className="h-10 w-14 rounded border" />
              <Input value={form.accent_color ?? ""} onChange={(e) => set("accent_color", e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">WhatsApp</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Numéro (format international, ex: 221776533606)</Label>
            <Input value={form.whatsapp_number ?? ""} onChange={(e) => set("whatsapp_number", e.target.value)} />
          </div>
          <div>
            <Label>Message par défaut</Label>
            <Textarea value={form.whatsapp_default_message ?? ""} onChange={(e) => set("whatsapp_default_message", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Bandeau promo (haut du site)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Switch checked={!!form.promo_bar_enabled} onCheckedChange={(v) => set("promo_bar_enabled", v)} />
            <span className="text-sm">Activer le bandeau</span>
          </div>
          <div>
            <Label>Texte</Label>
            <Input value={form.promo_bar_text ?? ""} onChange={(e) => set("promo_bar_text", e.target.value)} placeholder="Ex: 🚚 Livraison gratuite à Dakar" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Couleur de fond</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.promo_bar_bg_color ?? "#000000"} onChange={(e) => set("promo_bar_bg_color", e.target.value)} className="h-10 w-14 rounded border" />
                <Input value={form.promo_bar_bg_color ?? ""} onChange={(e) => set("promo_bar_bg_color", e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Couleur du texte</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.promo_bar_text_color ?? "#ffffff"} onChange={(e) => set("promo_bar_text_color", e.target.value)} className="h-10 w-14 rounded border" />
                <Input value={form.promo_bar_text_color ?? ""} onChange={(e) => set("promo_bar_text_color", e.target.value)} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Textes affichés</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Titre du héros (page d'accueil, si pas de bannière)</Label>
            <Input value={form.hero_title ?? ""} onChange={(e) => set("hero_title", e.target.value)} />
          </div>
          <div>
            <Label>Sous-titre</Label>
            <Textarea value={form.hero_subtitle ?? ""} onChange={(e) => set("hero_subtitle", e.target.value)} />
          </div>
          <div>
            <Label>Texte du pied de page</Label>
            <Textarea value={form.footer_text ?? ""} onChange={(e) => set("footer_text", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <BannersManager />

      <div className="flex justify-end">
        <Button onClick={save} disabled={busy} size="lg">{busy ? "Enregistrement…" : "Enregistrer tous les paramètres"}</Button>
      </div>
    </div>
  );
}

function BannersManager() {
  const qc = useQueryClient();
  const { data: banners } = useQuery({
    queryKey: ["admin", "home_banners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("home_banners" as never)
        .select("*")
        .order("position");
      if (error) throw error;
      return (data ?? []) as unknown as HomeBanner[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin", "home_banners"] });
    qc.invalidateQueries({ queryKey: ["home_banners"] });
  };

  async function addBanner(file: File) {
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `banner-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("site-assets").upload(path, file);
    if (upErr) { toast.error(upErr.message); return; }
    const { data: pub } = supabase.storage.from("site-assets").getPublicUrl(path);
    const nextPos = (banners?.length ?? 0);
    const { error } = await supabase.from("home_banners" as never).insert({
      image_url: pub.publicUrl, position: nextPos, enabled: true,
    } as never);
    if (error) { toast.error(error.message); return; }
    toast.success("Bannière ajoutée");
    refresh();
  }

  async function update(id: string, patch: Partial<HomeBanner>) {
    const { error } = await supabase.from("home_banners" as never).update(patch as never).eq("id", id);
    if (error) toast.error(error.message); else refresh();
  }

  async function remove(id: string) {
    if (!confirm("Supprimer cette bannière ?")) return;
    const { error } = await supabase.from("home_banners" as never).delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Supprimée"); refresh(); }
  }

  async function move(id: string, dir: -1 | 1) {
    if (!banners) return;
    const idx = banners.findIndex((b) => b.id === id);
    const swap = banners[idx + dir];
    if (!swap) return;
    await update(id, { position: swap.position });
    await update(swap.id, { position: banners[idx].position });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Bannières d'accueil (carrousel)</CardTitle>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Ajouter
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && addBanner(e.target.files[0])} />
        </label>
      </CardHeader>
      <CardContent>
        {!banners || banners.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune bannière. Ajoute-en pour activer le carrousel.</p>
        ) : (
          <ul className="space-y-2">
            {banners.map((b, i) => (
              <li key={b.id} className="flex items-center gap-3 rounded-md border p-2">
                <img src={b.image_url} alt="" className="h-14 w-24 rounded object-cover" />
                <div className="flex-1 space-y-1">
                  <Input
                    placeholder="Lien (optionnel)"
                    value={b.link_url ?? ""}
                    onBlur={(e) => e.target.value !== (b.link_url ?? "") && update(b.id, { link_url: e.target.value || null })}
                    onChange={(e) => { (b as HomeBanner).link_url = e.target.value; }}
                  />
                  <div className="flex items-center gap-2 text-xs">
                    <Switch checked={b.enabled} onCheckedChange={(v) => update(b.id, { enabled: v })} />
                    <span>{b.enabled ? "Visible" : "Masquée"}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Button variant="ghost" size="icon" onClick={() => move(b.id, -1)} disabled={i === 0}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => move(b.id, 1)} disabled={i === banners.length - 1}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(b.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
