import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, ArrowUp, ArrowDown, Settings2, Pencil, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { HomeBanner, SiteSettings } from "@/hooks/use-site-settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BannerEditorDialog } from "./BannerEditorDialog";
import { BannerSlide } from "@/components/home/BannerSlide";

export function BannersManager() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<HomeBanner | null>(null);
  const [opening, setOpening] = useState(false);
  const [sliderSettingsOpen, setSliderSettingsOpen] = useState(false);

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

  async function update(id: string, patch: Partial<HomeBanner>) {
    const { error } = await supabase.from("home_banners" as never).update(patch as never).eq("id", id);
    if (error) toast.error(error.message);
    else refresh();
  }

  async function remove(id: string) {
    if (!confirm("Supprimer cette bannière ?")) return;
    const { error } = await supabase.from("home_banners" as never).delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Supprimée");
      refresh();
    }
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
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Bannières d'accueil</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setSliderSettingsOpen(true)}>
            <Settings2 className="mr-1 h-4 w-4" /> Slider
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setOpening(true); }}>
            <Plus className="mr-1 h-4 w-4" /> Nouvelle bannière
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!banners || banners.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune bannière. Cliquez sur « Nouvelle bannière » pour démarrer.
          </p>
        ) : (
          <ul className="space-y-3">
            {banners.map((b, i) => (
              <li key={b.id} className="overflow-hidden rounded-lg border">
                <div className="relative h-32 bg-muted">
                  <BannerSlide banner={b} viewport="desktop" asPreview className="!h-32" />
                  {!b.enabled && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm font-semibold">
                      Désactivée
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 p-3">
                  <span className="rounded bg-muted px-2 py-0.5 text-xs font-mono">#{i + 1}</span>
                  <div className="flex-1 truncate text-sm">
                    {b.title || <span className="text-muted-foreground">Sans titre</span>}
                  </div>
                  <Switch checked={b.enabled} onCheckedChange={(v) => update(b.id, { enabled: v })} />
                  {b.enabled ? <Eye className="h-4 w-4 text-muted-foreground" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => move(b.id, -1)} disabled={i === 0}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => move(b.id, 1)} disabled={i === banners.length - 1}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => { setEditing(b); setOpening(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(b.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <BannerEditorDialog
        open={opening}
        onOpenChange={setOpening}
        banner={editing}
        nextPosition={banners?.length ?? 0}
        onSaved={refresh}
      />

      <SliderSettingsDialog open={sliderSettingsOpen} onOpenChange={setSliderSettingsOpen} />
    </Card>
  );
}

function SliderSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({
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

  const [draft, setDraft] = useState<Partial<SiteSettings>>({});
  const merged = { ...(data ?? {}), ...draft } as SiteSettings;

  async function save() {
    const { error } = await supabase
      .from("site_settings" as never)
      .update(draft as never)
      .eq("id", "main");
    if (error) return toast.error(error.message);
    toast.success("Paramètres du slider enregistrés");
    qc.invalidateQueries({ queryKey: ["site_settings"] });
    qc.invalidateQueries({ queryKey: ["admin", "site_settings"] });
    setDraft({});
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Paramètres du slider</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Lecture automatique</Label>
            <Switch
              checked={merged.banner_autoplay ?? true}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, banner_autoplay: v }))}
            />
          </div>
          <div>
            <Label>Vitesse de défilement ({((merged.banner_interval_ms ?? 4500) / 1000).toFixed(1)} s)</Label>
            <Slider
              min={1500}
              max={12000}
              step={250}
              value={[merged.banner_interval_ms ?? 4500]}
              onValueChange={([v]) => setDraft((d) => ({ ...d, banner_interval_ms: v }))}
            />
          </div>
          <div>
            <Label>Transition</Label>
            <Select
              value={merged.banner_transition ?? "slide"}
              onValueChange={(v) => setDraft((d) => ({ ...d, banner_transition: v as SiteSettings["banner_transition"] }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="slide">Slide (glissement)</SelectItem>
                <SelectItem value="fade">Fade (fondu)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label>Afficher les flèches</Label>
            <Switch
              checked={merged.banner_show_arrows ?? true}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, banner_show_arrows: v }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Afficher les points</Label>
            <Switch
              checked={merged.banner_show_dots ?? true}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, banner_show_dots: v }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={save}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
