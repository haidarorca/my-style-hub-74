import { useEffect, useRef, useState } from "react";
import { Upload, RotateCw, Smartphone, Tablet, Monitor, Move } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { HomeBanner } from "@/hooks/use-site-settings";
import { BANNER_DEFAULTS } from "@/hooks/use-site-settings";
import { BannerSlide } from "@/components/home/BannerSlide";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type BannerDraft = Partial<HomeBanner> & { image_url: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  banner: HomeBanner | null; // null = create
  nextPosition: number;
  onSaved: () => void;
}

const VIEWPORTS = [
  { key: "mobile" as const, label: "Mobile", icon: Smartphone, w: "max-w-[360px]" },
  { key: "tablet" as const, label: "Tablette", icon: Tablet, w: "max-w-[720px]" },
  { key: "desktop" as const, label: "Desktop", icon: Monitor, w: "max-w-full" },
];

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_MB = 10;

async function uploadImage(file: File, prefix: string): Promise<string | null> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    toast.error("Format non supporté. Utilisez JPG, PNG ou WEBP.");
    return null;
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    toast.error(`Image trop volumineuse (max ${MAX_SIZE_MB} Mo).`);
    return null;
  }
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const path = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("site-assets")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (error) {
    toast.error(error.message);
    return null;
  }
  return supabase.storage.from("site-assets").getPublicUrl(path).data.publicUrl;
}

export function BannerEditorDialog({ open, onOpenChange, banner, nextPosition, onSaved }: Props) {
  const [draft, setDraft] = useState<BannerDraft | null>(null);
  const [pendingFiles, setPendingFiles] = useState<Partial<Record<"image_url" | "image_url_mobile" | "image_url_tablet", File>>>({});
  const [previewVp, setPreviewVp] = useState<"mobile" | "tablet" | "desktop">("desktop");
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const objectUrls = useRef<string[]>([]);

  const revokeObjectUrls = () => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current = [];
  };

  const makePreviewUrl = (file: File) => {
    const url = URL.createObjectURL(file);
    objectUrls.current.push(url);
    return url;
  };

  const validateImage = (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Format non supporté. Utilisez JPG, PNG ou WEBP.");
      return false;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`Image trop volumineuse (max ${MAX_SIZE_MB} Mo).`);
      return false;
    }
    return true;
  };

  useEffect(() => {
    if (!open) return;
    revokeObjectUrls();
    setPendingFiles({});
    if (banner) {
      setDraft({ ...banner });
    } else {
      setDraft(null);
    }
    setPreviewVp("desktop");
  }, [open, banner]);

  useEffect(() => () => revokeObjectUrls(), []);

  const set = <K extends keyof BannerDraft>(k: K, v: BannerDraft[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  async function handleInitialUpload(file: File) {
    if (!validateImage(file)) return;
    setDraft({
      image_url: makePreviewUrl(file),
      ...BANNER_DEFAULTS,
    });
    setPendingFiles({ image_url: file });
  }

  async function handleVariantUpload(file: File, key: "image_url" | "image_url_mobile" | "image_url_tablet") {
    if (!draft || !validateImage(file)) return;
    set(key, makePreviewUrl(file));
    setPendingFiles((files) => ({ ...files, [key]: file }));
  }

  // Drag the image inside the canvas → updates focal_x / focal_y
  function startDrag(e: React.PointerEvent) {
    if (!canvasRef.current) return;
    dragging.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
    onDrag(e);
  }
  function onDrag(e: React.PointerEvent) {
    if (!dragging.current || !canvasRef.current || !draft) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setDraft({ ...draft, focal_x: Number(x.toFixed(3)), focal_y: Number(y.toFixed(3)) });
  }
  function endDrag(e: React.PointerEvent) {
    dragging.current = false;
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    const uploadedImageUrl = pendingFiles.image_url ? await uploadImage(pendingFiles.image_url, "banner") : draft.image_url;
    if (!uploadedImageUrl) {
      setSaving(false);
      return;
    }
    const uploadedTabletUrl = pendingFiles.image_url_tablet
      ? await uploadImage(pendingFiles.image_url_tablet, "banner-image_url_tablet")
      : draft.image_url_tablet;
    if (pendingFiles.image_url_tablet && !uploadedTabletUrl) {
      setSaving(false);
      return;
    }
    const uploadedMobileUrl = pendingFiles.image_url_mobile
      ? await uploadImage(pendingFiles.image_url_mobile, "banner-image_url_mobile")
      : draft.image_url_mobile;
    if (pendingFiles.image_url_mobile && !uploadedMobileUrl) {
      setSaving(false);
      return;
    }
    const payload = {
      image_url: uploadedImageUrl,
      image_url_mobile: uploadedMobileUrl ?? null,
      image_url_tablet: uploadedTabletUrl ?? null,
      link_url: draft.link_url ?? null,
      title: draft.title ?? null,
      subtitle: draft.subtitle ?? null,
      cta_label: draft.cta_label ?? null,
      text_align: draft.text_align ?? "left",
      text_color: draft.text_color ?? "#ffffff",
      overlay_opacity: draft.overlay_opacity ?? 0.35,
      height_mobile: draft.height_mobile ?? 220,
      height_tablet: draft.height_tablet ?? 320,
      height_desktop: draft.height_desktop ?? 480,
      object_fit: draft.object_fit ?? "cover",
      focal_x: draft.focal_x ?? 0.5,
      focal_y: draft.focal_y ?? 0.5,
      zoom: draft.zoom ?? 1,
      rotation: draft.rotation ?? 0,
      enabled: draft.enabled ?? true,
    };
    if (banner) {
      const { error } = await supabase
        .from("home_banners" as never)
        .update(payload as never)
        .eq("id", banner.id);
      setSaving(false);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase
        .from("home_banners" as never)
        .insert({ ...payload, position: nextPosition } as never);
      setSaving(false);
      if (error) return toast.error(error.message);
    }
    toast.success("Bannière enregistrée");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{banner ? "Modifier la bannière" : "Nouvelle bannière"}</DialogTitle>
        </DialogHeader>

        {!draft ? (
          <div className="rounded-xl border-2 border-dashed p-10 text-center">
            <Upload className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="mb-1 text-sm text-muted-foreground">
              Choisissez une image depuis votre galerie ou votre ordinateur
            </p>
            <p className="mb-3 text-xs text-muted-foreground">JPG, PNG ou WEBP — max {MAX_SIZE_MB} Mo</p>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
              <Upload className="h-4 w-4" /> Choisir une image
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleInitialUpload(e.target.files[0])}
              />
            </label>
          </div>
        ) : (
          <Tabs defaultValue="image" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="image">Image</TabsTrigger>
              <TabsTrigger value="content">Contenu</TabsTrigger>
              <TabsTrigger value="size">Dimensions</TabsTrigger>
              <TabsTrigger value="preview">Aperçu</TabsTrigger>
            </TabsList>

            {/* ─── Image ─── */}
            <TabsContent value="image" className="space-y-4 pt-4">
              <div className="flex items-center gap-2">
                {VIEWPORTS.map(({ key, label, icon: Icon }) => (
                  <Button
                    key={key}
                    variant={previewVp === key ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPreviewVp(key)}
                  >
                    <Icon className="mr-1 h-4 w-4" /> {label}
                  </Button>
                ))}
              </div>

              <div
                ref={canvasRef}
                onPointerDown={startDrag}
                onPointerMove={onDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                className="relative cursor-move touch-none select-none overflow-hidden rounded-lg border bg-muted"
                style={{ aspectRatio: previewVp === "mobile" ? "9/14" : previewVp === "tablet" ? "4/3" : "21/9" }}
              >
                <BannerSlide banner={draft} viewport={previewVp} asPreview />
                {/* focal point marker */}
                <div
                  className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-lg"
                  style={{
                    left: `${(draft.focal_x ?? 0.5) * 100}%`,
                    top: `${(draft.focal_y ?? 0.5) * 100}%`,
                    background: "rgba(232,93,58,0.7)",
                  }}
                />
                <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-xs text-white">
                  <Move className="h-3 w-3" /> Glissez pour recadrer
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Zoom ({(draft.zoom ?? 1).toFixed(2)}×)</Label>
                  <Slider
                    min={0.5}
                    max={3}
                    step={0.05}
                    value={[draft.zoom ?? 1]}
                    onValueChange={([v]) => set("zoom", v)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Rotation</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => set("rotation", ((draft.rotation ?? 0) + 90) % 360)}
                    >
                      <RotateCw className="mr-1 h-4 w-4" /> +90°
                    </Button>
                    <span className="text-sm text-muted-foreground">{draft.rotation ?? 0}°</span>
                    <Button variant="ghost" size="sm" onClick={() => set("rotation", 0)}>
                      Réinitialiser
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Mode d'affichage</Label>
                  <Select value={draft.object_fit ?? "cover"} onValueChange={(v) => set("object_fit", v as HomeBanner["object_fit"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cover">Cover (remplir)</SelectItem>
                      <SelectItem value="contain">Contain (entière)</SelectItem>
                      <SelectItem value="fill">Fill (étirer)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Point focal ({((draft.focal_x ?? 0.5) * 100).toFixed(0)}% × {((draft.focal_y ?? 0.5) * 100).toFixed(0)}%)</Label>
                  <Button variant="ghost" size="sm" onClick={() => setDraft({ ...draft, focal_x: 0.5, focal_y: 0.5 })}>
                    Centrer
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <Label className="text-sm font-semibold">Variantes optionnelles par appareil</Label>
                <p className="mb-3 mt-1 text-xs text-muted-foreground">
                  Pour avoir des images différentes selon le device, remplacez l'image originale (desktop) ou ajoutez une variante mobile/tablette.
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {[
                    { key: "image_url" as const, label: "Desktop (par défaut)" },
                    { key: "image_url_tablet" as const, label: "Tablette" },
                    { key: "image_url_mobile" as const, label: "Mobile" },
                  ].map(({ key, label }) => (
                    <label key={key} className="cursor-pointer rounded border p-2 text-center text-xs hover:bg-accent">
                      {draft[key] ? (
                        <img src={draft[key] as string} alt="" className="mx-auto mb-1 h-12 w-full rounded object-cover" />
                      ) : (
                        <div className="mx-auto mb-1 flex h-12 items-center justify-center rounded bg-muted text-muted-foreground">—</div>
                      )}
                      {label}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && handleVariantUpload(e.target.files[0], key)}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* ─── Contenu ─── */}
            <TabsContent value="content" className="space-y-3 pt-4">
              <div>
                <Label>Titre</Label>
                <Input value={draft.title ?? ""} onChange={(e) => set("title", e.target.value || null)} placeholder="Votre accroche" />
              </div>
              <div>
                <Label>Sous-titre / description</Label>
                <Input value={draft.subtitle ?? ""} onChange={(e) => set("subtitle", e.target.value || null)} placeholder="Texte secondaire" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Libellé du bouton</Label>
                  <Input value={draft.cta_label ?? ""} onChange={(e) => set("cta_label", e.target.value || null)} placeholder="Découvrir" />
                </div>
                <div>
                  <Label>Lien de redirection</Label>
                  <Input value={draft.link_url ?? ""} onChange={(e) => set("link_url", e.target.value || null)} placeholder="/categories/vetements" />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Alignement</Label>
                  <Select value={draft.text_align ?? "left"} onValueChange={(v) => set("text_align", v as HomeBanner["text_align"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Gauche</SelectItem>
                      <SelectItem value="center">Centre</SelectItem>
                      <SelectItem value="right">Droite</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Couleur du texte</Label>
                  <Input type="color" value={draft.text_color ?? "#ffffff"} onChange={(e) => set("text_color", e.target.value)} />
                </div>
                <div>
                  <Label>Voile sombre ({((draft.overlay_opacity ?? 0.35) * 100).toFixed(0)}%)</Label>
                  <Slider min={0} max={1} step={0.05} value={[draft.overlay_opacity ?? 0.35]} onValueChange={([v]) => set("overlay_opacity", v)} />
                </div>
              </div>
            </TabsContent>

            {/* ─── Dimensions ─── */}
            <TabsContent value="size" className="space-y-4 pt-4">
              {(["mobile", "tablet", "desktop"] as const).map((vp) => {
                const labels = { mobile: "Mobile", tablet: "Tablette", desktop: "Desktop" };
                const field = `height_${vp}` as const;
                const value = draft[field] ?? BANNER_DEFAULTS[field];
                return (
                  <div key={vp}>
                    <Label>Hauteur {labels[vp]} ({value}px)</Label>
                    <Slider min={120} max={800} step={10} value={[value]} onValueChange={([v]) => set(field, v)} />
                  </div>
                );
              })}
            </TabsContent>

            {/* ─── Aperçu ─── */}
            <TabsContent value="preview" className="space-y-4 pt-4">
              <div className="flex items-center gap-2">
                {VIEWPORTS.map(({ key, label, icon: Icon }) => (
                  <Button
                    key={key}
                    variant={previewVp === key ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPreviewVp(key)}
                  >
                    <Icon className="mr-1 h-4 w-4" /> {label}
                  </Button>
                ))}
              </div>
              <div className={cn("mx-auto overflow-hidden rounded-lg border bg-card shadow", VIEWPORTS.find((v) => v.key === previewVp)?.w)}>
                <BannerSlide banner={draft} viewport={previewVp} asPreview />
              </div>
            </TabsContent>
          </Tabs>
        )}

        {draft && (
          <DialogFooter className="gap-2 sm:gap-0">
            <div className="mr-auto flex items-center gap-2">
              <Switch checked={draft.enabled ?? true} onCheckedChange={(v) => set("enabled", v)} />
              <Label className="text-sm">{draft.enabled ? "Active" : "Désactivée"}</Label>
            </div>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button onClick={save} disabled={saving}>{saving ? "…" : "Enregistrer"}</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
