import { useMemo, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Upload, X } from "lucide-react";
import { RequestCategoryDialog } from "@/components/vendor/RequestCategoryDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/vendor/products/new")({
  component: NewProductPage,
});

const FONT_OPTIONS = [
  "Arial", "Helvetica", "Times New Roman", "Georgia", "Courier New",
  "Impact", "Comic Sans MS", "Pacifico", "Lobster", "Bebas Neue",
];

const COLOR_PRESETS = [
  "#000000", "#ffffff", "#e11d48", "#f59e0b", "#10b981",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280", "#fde047",
];

interface VariantInput {
  size: string;
  color: string;
  color_hex: string;
  stock: number;
  price_override: string; // string for input, parsed on submit
  image_file: File | null;
}

function NewProductPage() {
  const { user } = useAuth();
  const router = useRouter();

  // Basic fields
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [designation, setDesignation] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<string>("");

  // Category 3-level
  const [cat1, setCat1] = useState<string>("");
  const [cat2, setCat2] = useState<string>("");
  const [cat3, setCat3] = useState<string>("");

  const onPickImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setImages((prev) => [...prev, ...files].slice(0, 8));
    e.target.value = "";
  };

  const removeImage = (i: number) => setImages((prev) => prev.filter((_, idx) => idx !== i));

  const addVariant = () =>
    setVariants((v) => [...v, { size: "", color: "", color_hex: "", stock: 0, price_override: "", image_file: null }]);
  const updateVariant = (i: number, patch: Partial<VariantInput>) =>
    setVariants((v) => v.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const removeVariant = (i: number) => setVariants((v) => v.filter((_, idx) => idx !== i));

  const toggleFont = (f: string, checked: boolean) =>
    setAllowedFonts((prev) => (checked ? [...prev, f] : prev.filter((x) => x !== f)));
  const toggleColor = (c: string) =>
    setAllowedColors((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!name.trim() || !code.trim() || !price) {
      toast.error("Nom, code et prix sont obligatoires.");
      return;
    }
    if (images.length === 0) {
      toast.error("Ajoutez au moins une image.");
      return;
    }
    const priceNum = Number(price);
    if (Number.isNaN(priceNum) || priceNum < 0) {
      toast.error("Prix invalide.");
      return;
    }

    // Validate category — must have either an existing pick or a valid proposal
    let pendingReqId: string | null = null;
    if (proposeLevel > 0) {
      const trimmed = proposeName.trim();
      if (trimmed.length < 2) {
        toast.error("Nom de la nouvelle catégorie trop court.");
        return;
      }
      if (proposeLevel === 2 && !cat1) {
        toast.error("Choisissez d'abord le rayon parent.");
        return;
      }
      if (proposeLevel === 3 && !cat2) {
        toast.error("Choisissez d'abord la catégorie parente.");
        return;
      }
    } else if (!finalCategoryId) {
      toast.error("Choisissez une catégorie ou proposez-en une nouvelle.");
      return;
    }

    setSubmitting(true);
    try {
      // 0. If proposing a new category, create the request first
      if (proposeLevel > 0) {
        const { data: req, error: reqErr } = await supabase
          .from("category_requests")
          .insert({
            vendor_id: user.id,
            level: proposeLevel,
            name: proposeName.trim(),
            parent_id: proposalParentId,
          })
          .select("id")
          .single();
        if (reqErr) throw reqErr;
        pendingReqId = req.id as string;
      }

      // 1. Insert product
      const { data: prod, error: prodErr } = await supabase
        .from("products")
        .insert({
          vendor_id: user.id,
          name: name.trim(),
          code: code.trim(),
          designation: designation.trim() || null,
          description: description.trim() || null,
          price: priceNum,
          category_id: finalCategoryId,
          pending_category_request_id: pendingReqId,
          status: "pending",
        } as never)
        .select("id")
        .single();
      if (prodErr) {
        if (prodErr.message.includes("products_vendor_code_unique")) {
          throw new Error("Ce code-barres existe déjà dans votre boutique.");
        }
        throw prodErr;
      }
      const productId = prod.id as string;

      // 2. Upload images
      const imageRows: { product_id: string; url: string; position: number }[] = [];
      for (let i = 0; i < images.length; i++) {
        const file = images[i];
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${user.id}/${productId}/${Date.now()}-${i}.${ext}`;
        const { error: upErr } = await supabase.storage.from("product-images").upload(path, file);
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
        imageRows.push({ product_id: productId, url: pub.publicUrl, position: i });
      }
      const { error: imgErr } = await supabase.from("product_images").insert(imageRows);
      if (imgErr) throw imgErr;

      // 3. Insert variants (with optional per-variant image)
      if (variants.length > 0) {
        const variantRows: Array<{
          product_id: string; size: string | null; color: string | null;
          color_hex: string | null; stock: number; price_override: number | null;
          image_url: string | null;
        }> = [];
        for (let i = 0; i < variants.length; i++) {
          const v = variants[i];
          let image_url: string | null = null;
          if (v.image_file) {
            const ext = v.image_file.name.split(".").pop() || "jpg";
            const path = `${user.id}/${productId}/variants/${Date.now()}-${i}.${ext}`;
            const { error: upErr } = await supabase.storage.from("product-images").upload(path, v.image_file);
            if (upErr) throw upErr;
            image_url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
          }
          variantRows.push({
            product_id: productId,
            size: v.size.trim() || null,
            color: v.color.trim() || null,
            color_hex: v.color_hex || null,
            stock: v.stock || 0,
            price_override: v.price_override ? Number(v.price_override) : null,
            image_url,
          });
        }
        const { error: varErr } = await supabase.from("product_variants").insert(variantRows);
        if (varErr) throw varErr;
      }

      // 4. Insert customizations
      const customRows: {
        product_id: string;
        type: "image" | "name";
        image_size_message?: string | null;
        allowed_fonts?: string[];
        allow_all_fonts?: boolean;
        allowed_colors?: string[];
        allow_all_colors?: boolean;
      }[] = [];
      if (allowImage) {
        customRows.push({
          product_id: productId,
          type: "image",
          image_size_message: imageMessage.trim() || null,
        });
      }
      if (allowText) {
        customRows.push({
          product_id: productId,
          type: "name",
          allowed_fonts: allowAllFonts ? [] : allowedFonts,
          allow_all_fonts: allowAllFonts,
          allowed_colors: allowAllColors ? [] : allowedColors,
          allow_all_colors: allowAllColors,
        });
      }
      if (customRows.length > 0) {
        const { error: cErr } = await supabase.from("product_customizations").insert(customRows);
        if (cErr) throw cErr;
      }

      toast.success("Produit créé. En attente de validation par l'admin.");
      router.navigate({ to: "/vendor" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h1 className="text-xl font-bold">Nouveau produit</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">Photos</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {images.map((f, i) => (
              <div key={i} className="relative h-24 w-24 overflow-hidden rounded-lg bg-muted">
                <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute right-1 top-1 rounded-full bg-background/80 p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-xs text-muted-foreground hover:bg-accent">
              <Upload className="h-5 w-5" />
              Ajouter
              <input type="file" accept="image/*" multiple onChange={onPickImages} className="hidden" />
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Informations</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Code-barres *</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ex. ABC123" />
            <p className="mt-1 text-xs text-muted-foreground">Doit être unique dans votre boutique.</p>
          </div>
          <div>
            <Label>Nom *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Désignation</Label>
            <Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Ex. Robe été manches courtes" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div>
            <Label>Prix de base (FCFA) *</Label>
            <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Catégorie</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {/* Niveau 1 — Rayon */}
          {proposeLevel === 1 ? (
            <ProposeRow
              label="Nouveau rayon"
              value={proposeName}
              onChange={setProposeName}
              onCancel={cancelProposal}
            />
          ) : (
            <div>
              <div className="flex items-center justify-between">
                <Label>Rayon</Label>
                <button type="button" onClick={() => startProposal(1)} className="text-[11px] font-medium text-primary hover:underline">
                  + Nouveau rayon
                </button>
              </div>
              <Select value={cat1} onValueChange={(v) => { setCat1(v); setCat2(""); setCat3(""); }}>
                <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>
                  {cats1?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Niveau 2 — Catégorie */}
          {cat1 && proposeLevel !== 1 && (
            proposeLevel === 2 ? (
              <ProposeRow
                label="Nouvelle catégorie"
                value={proposeName}
                onChange={setProposeName}
                onCancel={cancelProposal}
              />
            ) : (
              <div>
                <div className="flex items-center justify-between">
                  <Label>Catégorie</Label>
                  <button type="button" onClick={() => startProposal(2)} className="text-[11px] font-medium text-primary hover:underline">
                    + Nouvelle catégorie
                  </button>
                </div>
                <Select value={cat2} onValueChange={(v) => { setCat2(v); setCat3(""); }}>
                  <SelectTrigger><SelectValue placeholder={cats2 && cats2.length > 0 ? "Choisir" : "Aucune — proposez-en une"} /></SelectTrigger>
                  <SelectContent>
                    {cats2?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )
          )}

          {/* Niveau 3 — Sous-catégorie */}
          {cat2 && proposeLevel !== 1 && proposeLevel !== 2 && (
            proposeLevel === 3 ? (
              <ProposeRow
                label="Nouvelle sous-catégorie"
                value={proposeName}
                onChange={setProposeName}
                onCancel={cancelProposal}
              />
            ) : (
              <div>
                <div className="flex items-center justify-between">
                  <Label>Sous-catégorie</Label>
                  <button type="button" onClick={() => startProposal(3)} className="text-[11px] font-medium text-primary hover:underline">
                    + Nouvelle sous-catégorie
                  </button>
                </div>
                <Select value={cat3} onValueChange={setCat3}>
                  <SelectTrigger><SelectValue placeholder={cats3 && cats3.length > 0 ? "Choisir" : "Aucune — proposez-en une"} /></SelectTrigger>
                  <SelectContent>
                    {cats3?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )
          )}

          {proposeLevel > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-[11px] text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
              <Sparkles className="mr-1 inline h-3 w-3" />
              Votre nouvelle catégorie sera envoyée à l'admin. Le produit reste en attente jusqu'à validation.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Variantes (taille / couleur ou modèle)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Une ligne par combinaison. Pour un <b>modèle</b> (Modèle A, B…), saisissez son nom dans « Couleur / Modèle » et laissez la pastille Hex vide. Ajoutez une image par variante : elle s'affichera quand le client la sélectionne.
          </p>
          {variants.map((v, i) => (
            <div key={i} className="rounded-lg border bg-background p-2 space-y-2">
              <div className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-2">
                  <Label className="text-[10px]">Taille</Label>
                  <Input className="h-8" value={v.size} onChange={(e) => updateVariant(i, { size: e.target.value })} placeholder="S, M, 42…" />
                </div>
                <div className="col-span-3">
                  <Label className="text-[10px]">Couleur / Modèle</Label>
                  <Input className="h-8" value={v.color} onChange={(e) => updateVariant(i, { color: e.target.value })} placeholder="Rouge ou Modèle A" />
                </div>
                <div className="col-span-1">
                  <Label className="text-[10px]">Hex</Label>
                  <input type="color" value={v.color_hex || "#000000"} onChange={(e) => updateVariant(i, { color_hex: e.target.value })} className="h-8 w-full rounded border" />
                </div>
                <div className="col-span-2">
                  <Label className="text-[10px]">Stock</Label>
                  <Input className="h-8" type="number" min={0} value={v.stock} onChange={(e) => updateVariant(i, { stock: Number(e.target.value) })} />
                </div>
                <div className="col-span-3">
                  <Label className="text-[10px]">Prix (opt.)</Label>
                  <Input className="h-8" type="number" min={0} value={v.price_override} onChange={(e) => updateVariant(i, { price_override: e.target.value })} placeholder="—" />
                </div>
                <div className="col-span-1">
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeVariant(i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {v.image_file ? (
                  <div className="relative h-14 w-14 overflow-hidden rounded border">
                    <img src={URL.createObjectURL(v.image_file)} alt="" className="h-full w-full object-cover" />
                    <button type="button" onClick={() => updateVariant(i, { image_file: null })}
                      className="absolute right-0 top-0 rounded-bl bg-background/80 p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <label className="flex h-14 w-14 cursor-pointer items-center justify-center rounded border-2 border-dashed text-xs text-muted-foreground">
                    <Upload className="h-4 w-4" />
                    <input type="file" accept="image/*" className="hidden"
                      onChange={(e) => updateVariant(i, { image_file: e.target.files?.[0] ?? null })} />
                  </label>
                )}
                <p className="text-[11px] text-muted-foreground">Image affichée quand cette variante est choisie (optionnel).</p>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addVariant}>
            <Plus className="mr-1 h-4 w-4" /> Ajouter une variante
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Personnalisation</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Image personnalisée</Label>
              <p className="text-xs text-muted-foreground">Le client peut envoyer une image (ex. coque téléphone).</p>
            </div>
            <Switch checked={allowImage} onCheckedChange={setAllowImage} />
          </div>
          {allowImage && (
            <div>
              <Label>Message à afficher au client</Label>
              <Textarea
                value={imageMessage}
                onChange={(e) => setImageMessage(e.target.value)}
                rows={2}
                placeholder="Ex. Image au format carré, 1500x1500 px minimum"
              />
            </div>
          )}

          <div className="border-t pt-4" />

          <div className="flex items-center justify-between">
            <div>
              <Label>Texte / logo personnalisé</Label>
              <p className="text-xs text-muted-foreground">Le client écrit un texte avec police et couleur.</p>
            </div>
            <Switch checked={allowText} onCheckedChange={setAllowText} />
          </div>

          {allowText && (
            <div className="space-y-3">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label>Polices autorisées</Label>
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox checked={allowAllFonts} onCheckedChange={(v) => setAllowAllFonts(!!v)} />
                    Toutes
                  </label>
                </div>
                {!allowAllFonts && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {FONT_OPTIONS.map((f) => (
                      <label key={f} className="flex items-center gap-2 rounded border bg-background p-2 text-xs">
                        <Checkbox
                          checked={allowedFonts.includes(f)}
                          onCheckedChange={(v) => toggleFont(f, !!v)}
                        />
                        <span style={{ fontFamily: f }}>{f}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label>Couleurs autorisées</Label>
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox checked={allowAllColors} onCheckedChange={(v) => setAllowAllColors(!!v)} />
                    Toutes
                  </label>
                </div>
                {!allowAllColors && (
                  <div className="flex flex-wrap gap-2">
                    {COLOR_PRESETS.map((c) => (
                      <button
                        type="button"
                        key={c}
                        onClick={() => toggleColor(c)}
                        className={`h-9 w-9 rounded-full border-2 ${
                          allowedColors.includes(c) ? "border-primary" : "border-border"
                        }`}
                        style={{ backgroundColor: c }}
                        aria-label={c}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="sticky bottom-0 -mx-3 border-t bg-background/95 p-3 pb-safe backdrop-blur">
        <Button type="submit" disabled={submitting} className="h-12 w-full rounded-full text-sm font-semibold">
          {submitting ? "Création…" : "Soumettre pour validation"}
        </Button>
      </div>
    </form>
  );
}

function ProposeRow({
  label, value, onChange, onCancel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <button type="button" onClick={onCancel} className="text-[11px] font-medium text-muted-foreground hover:text-foreground">
          Annuler
        </button>
      </div>
      <Input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={80}
        placeholder="Nom de la nouvelle catégorie"
      />
    </div>
  );
}

