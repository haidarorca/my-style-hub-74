import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SiteSettings } from "@/hooks/use-site-settings";
import { BannersManager } from "@/components/admin/BannersManager";

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
            <Label>Numéro principal (format international, ex: 221776533606)</Label>
            <Input value={form.whatsapp_number ?? ""} onChange={(e) => set("whatsapp_number", e.target.value)} />
            <p className="mt-1 text-[11px] text-muted-foreground">Utilisé pour le bouton WhatsApp général du site et pour les commandes sans commission.</p>
          </div>
          <div>
            <Label>Numéro WhatsApp commission (admin)</Label>
            <Input
              value={form.commission_whatsapp_number ?? ""}
              onChange={(e) => set("commission_whatsapp_number", e.target.value)}
              placeholder="Ex: 221770000000"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Numéro dédié à la réception des commandes des vendeurs <strong>avec commission</strong>. Modifiable à tout moment. Si vide, le numéro principal sera utilisé.
            </p>
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

      <Card>
        <CardHeader><CardTitle className="text-base">Emails (réinitialisation de mot de passe)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">📧 Compte expéditeur</p>
            <p className="mt-1">Les emails de réinitialisation de mot de passe sont envoyés via le compte Gmail connecté à Lovable (<strong>haidarorca@gmail.com</strong>). Vous pouvez personnaliser ci-dessous l'adresse et le nom affichés comme expéditeur.</p>
          </div>
          <div>
            <Label>Email expéditeur</Label>
            <Input
              type="email"
              value={form.auth_sender_email ?? ""}
              onChange={(e) => set("auth_sender_email", e.target.value)}
              placeholder="haidarorca@gmail.com"
            />
            <p className="mt-1 text-xs text-muted-foreground">Doit correspondre (ou être un alias) du compte Gmail connecté, sinon Gmail réécrira l'expéditeur.</p>
          </div>
          <div>
            <Label>Nom expéditeur</Label>
            <Input
              value={form.auth_sender_name ?? ""}
              onChange={(e) => set("auth_sender_name", e.target.value)}
              placeholder="KawZone"
            />
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



