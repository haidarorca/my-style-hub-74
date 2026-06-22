import { useEffect, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Upload, X, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AiCopyGeneratorDialog } from "@/components/product/AiCopyGeneratorDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CountrySelect } from "@/components/CountrySelect";
import { isClothingContext, getMeasurementFields } from "@/lib/clothing-categories";
import { FIT_TYPES, fitTypeOption } from "@/lib/fit-types";
import { CompositionEditor } from "@/components/product/CompositionEditor";
import { BrandCombobox } from "@/components/product/BrandCombobox";
import { VideoUrlInput } from "@/components/product/VideoUrlInput";
import { WarrantyPicker, warrantyValueToDays, warrantyDaysToValue, type WarrantyValue } from "@/components/product/WarrantyPicker";
import { ClothingExtraFields } from "@/components/product/ClothingExtraFields";
import { type CompositionItem, isValidComposition, primaryMaterial, formatComposition } from "@/lib/textile-materials";
import { ChevronDown, Settings2, Ruler } from "lucide-react";



export const Route = createFileRoute("/vendor/products/$productId/edit")({
  component: EditProductPage,
});

type ExistingImage = { id: string; url: string; position: number };
type ExistingVariant = {
  id: string;
  size: string | null;
  color: string | null;
  color_hex: string | null;
  stock: number;
  price_override: number | null;
  image_url: string | null;
  variant_ref: string | null;
  measurements: Record<string, number> | null;
};

type VariantDraft = {
  id: string | null; // null = new
  size: string;
  color: string;
  color_hex: string;
  stock: number;
  price_override: string;
  image_url: string | null; // existing url
  image_file: File | null; // new replacement
  remove_image: boolean;
  variant_ref: string;
  measurements: Record<string, string>;
};

function fromExisting(v: ExistingVariant): VariantDraft {
  const m: Record<string, string> = {};
  if (v.measurements && typeof v.measurements === "object") {
    for (const [k, val] of Object.entries(v.measurements)) {
      if (val != null && String(val) !== "") m[k] = String(val);
    }
  }
  return {
    id: v.id,
    size: v.size ?? "",
    color: v.color ?? "",
    color_hex: v.color_hex ?? "",
    stock: v.stock ?? 0,
    price_override: v.price_override != null ? String(v.price_override) : "",
    image_url: v.image_url,
    image_file: null,
    remove_image: false,
    variant_ref: v.variant_ref ?? "",
    measurements: m,
  };
}

function emptyVariant(): VariantDraft {
  return { id: null, size: "", color: "", color_hex: "", stock: 0, price_override: "", image_url: null, image_file: null, remove_image: false, variant_ref: "", measurements: {} };
}

function EditProductPage() {
  const { productId } = Route.useParams();
  const { user } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [weightKg, setWeightKg] = useState<string>("");
  const [lengthCm, setLengthCm] = useState<string>("");
  const [widthCm, setWidthCm] = useState<string>("");
  const [heightCm, setHeightCm] = useState<string>("");

  // ── Options avancées ──
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [brand, setBrand] = useState("");
  const [brandId, setBrandId] = useState<string | null>(null);
  const [barcode, setBarcode] = useState("");
  const [warranty, setWarranty] = useState<WarrantyValue>({ enabled: false, preset: "12", customAmount: "", customUnit: "mois" });
  const [videoUrl, setVideoUrl] = useState("");
  const [originCountryId, setOriginCountryId] = useState<string | null>(null);
  const [isFragile, setIsFragile] = useState(false);
  const [minOrderQty, setMinOrderQty] = useState<string>("1");
  const [sku, setSku] = useState("");
  const [fitType, setFitType] = useState<string>("");
  const [compositionItems, setCompositionItems] = useState<CompositionItem[]>([]);
  const [season, setSeason] = useState<string>("");
  const [gender, setGender] = useState<string>("");
  const [ageGroup, setAgeGroup] = useState<string>("");
  const [careInstructions, setCareInstructions] = useState<string[]>([]);
  const [categoryName, setCategoryName] = useState<string>("");

  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");

  const [existingImages, setExistingImages] = useState<ExistingImage[]>([]);
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);
  const [newImages, setNewImages] = useState<File[]>([]);

  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [removedVariantIds, setRemovedVariantIds] = useState<string[]>([]);
  const [originalVariantsKey, setOriginalVariantsKey] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [aiCopyOpen, setAiCopyOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["vendor-edit-product", productId],
    queryFn: async () => {
      const [{ data: prod, error: e1 }, { data: imgs, error: e2 }, { data: vars, error: e3 }] = await Promise.all([
        supabase.from("products").select("*").eq("id", productId).maybeSingle(),
        supabase.from("product_images").select("id, url, position").eq("product_id", productId).order("position"),
        supabase.from("product_variants").select("*").eq("product_id", productId).order("created_at"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;
      return {
        product: prod,
        images: (imgs ?? []) as ExistingImage[],
        variants: (vars ?? []) as ExistingVariant[],
      };
    },
  });

  useEffect(() => {
    if (!data?.product) return;
    const p = data.product;
    setName(p.name ?? "");
    setDesignation(p.designation ?? "");
    setDescription(p.description ?? "");
    setPrice(String(p.price ?? ""));
    setWeightKg((p as any).weight_kg != null ? String((p as any).weight_kg) : "");
    setLengthCm((p as any).length_cm != null ? String((p as any).length_cm) : "");
    setWidthCm((p as any).width_cm != null ? String((p as any).width_cm) : "");
    setHeightCm((p as any).height_cm != null ? String((p as any).height_cm) : "");
    setBrand((p as any).brand ?? "");
    setBrandId((p as any).brand_id ?? null);
    setBarcode((p as any).barcode ?? "");
    setWarranty(warrantyDaysToValue((p as any).warranty_days ?? null));
    setVideoUrl((p as any).video_url ?? "");
    setOriginCountryId((p as any).origin_country_id ?? null);
    setIsFragile(!!(p as any).is_fragile);
    setMinOrderQty(String((p as any).min_order_qty ?? 1));
    setSku((p as any).sku ?? "");
    setFitType((p as any).fit_type ?? "");
    const items = (p as any).material_composition_items;
    setCompositionItems(Array.isArray(items) ? items as CompositionItem[] : []);
    setSeason((p as any).season ?? "");
    setGender((p as any).gender ?? "");
    setAgeGroup((p as any).age_group ?? "");
    const care = (p as any).care_instructions;
    setCareInstructions(Array.isArray(care) ? care : []);

    // Charger le nom de la catégorie pour la détection vêtement
    const catId = (p as any).category_id;
    if (catId) {
      void supabase.from("categories").select("name").eq("id", catId).maybeSingle().then(({ data: c }) => {
        setCategoryName((c as any)?.name ?? "");
      });
    }

    setStatus((["pending","approved","rejected"].includes(p.status as string) ? p.status : "pending") as typeof status);
    setExistingImages(data.images);
    const drafts = data.variants.map(fromExisting);
    setVariants(drafts);
    setOriginalVariantsKey(JSON.stringify(data.variants));
  }, [data]);

  const onPickImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setNewImages((prev) => [...prev, ...files].slice(0, 8));
    e.target.value = "";
  };

  const removeExisting = (id: string) => {
    setExistingImages((prev) => prev.filter((im) => im.id !== id));
    setRemovedImageIds((prev) => [...prev, id]);
  };
  const removeNew = (i: number) => setNewImages((prev) => prev.filter((_, idx) => idx !== i));

  const updateVariant = (i: number, patch: Partial<VariantDraft>) =>
    setVariants((v) => v.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const addVariant = () => setVariants((v) => [...v, emptyVariant()]);
  const removeVariant = (i: number) => {
    setVariants((v) => {
      const row = v[i];
      if (row.id) setRemovedVariantIds((ids) => [...ids, row.id!]);
      return v.filter((_, idx) => idx !== i);
    });
  };

  const isClothing = isClothingContext(categoryName, name);
  const measurementFields = getMeasurementFields(categoryName, name);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !data?.product) return;
    if (!name.trim() || !price) {
      toast.error("Nom et prix obligatoires.");
      return;
    }
    if (existingImages.length + newImages.length === 0) {
      toast.error("Au moins une image est requise.");
      return;
    }
    const hasComposition = compositionItems.length > 0;
    if (hasComposition && !isValidComposition(compositionItems)) {
      toast.error("Composition invalide : le total des matières doit être exactement 100%.");
      return;
    }
    const derivedMaterial = hasComposition ? (primaryMaterial(compositionItems) ?? null) : null;
    const derivedCompositionText = hasComposition ? formatComposition(compositionItems) : null;
    if (isClothing && status === "approved") {
      if (!hasComposition) {
        toast.error("Pour publier un vêtement, renseignez la composition du tissu (100%).");
        return;
      }
      const hasMeasurements = variants.some((v) =>
        Object.values(v.measurements ?? {}).some((val) => {
          const n = Number(val);
          return Number.isFinite(n) && n > 0;
        }),
      );
      if (!hasMeasurements) {
        toast.error("Pour publier un vêtement, renseignez les mesures réelles d'au moins une variante.");
        return;
      }
    }
    setSubmitting(true);
    try {
      const orig = data.product;

      // Upload new images
      if (newImages.length > 0) {
        const rows: { product_id: string; url: string; position: number }[] = [];
        const basePos = existingImages.length;
        for (let i = 0; i < newImages.length; i++) {
          const file = newImages[i];
          const ext = file.name.split(".").pop() || "jpg";
          const path = `${user.id}/${productId}/${Date.now()}-${i}.${ext}`;
          const { error: upErr } = await supabase.storage.from("product-images").upload(path, file);
          if (upErr) throw upErr;
          const url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
          rows.push({ product_id: productId, url, position: basePos + i });
        }
        const { error: insErr } = await supabase.from("product_images").insert(rows);
        if (insErr) throw insErr;
      }

      if (removedImageIds.length > 0) {
        const { error: delErr } = await supabase.from("product_images").delete().in("id", removedImageIds);
        if (delErr) throw delErr;
      }

      // Variants: delete removed
      if (removedVariantIds.length > 0) {
        const { error: dvErr } = await supabase.from("product_variants").delete().in("id", removedVariantIds);
        if (dvErr) throw dvErr;
      }

      // Variants: upsert each
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        let image_url: string | null = v.remove_image ? null : v.image_url;
        if (v.image_file) {
          const ext = v.image_file.name.split(".").pop() || "jpg";
          const path = `${user.id}/${productId}/variants/${Date.now()}-${i}.${ext}`;
          const { error: upErr } = await supabase.storage.from("product-images").upload(path, v.image_file);
          if (upErr) throw upErr;
          image_url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
        }
        const cleanMeasurements: Record<string, number> = {};
        for (const [k, val] of Object.entries(v.measurements ?? {})) {
          const n = Number(val);
          if (Number.isFinite(n) && n > 0) cleanMeasurements[k] = n;
        }
        const payload = {
          product_id: productId,
          size: v.size.trim() || null,
          color: v.color.trim() || null,
          color_hex: v.color_hex || null,
          stock: Number(v.stock) || 0,
          price_override: v.price_override ? Number(v.price_override) : null,
          image_url,
          variant_ref: v.variant_ref.trim() || null,
          measurements: cleanMeasurements,
        };
        if (v.id) {
          const { error } = await supabase.from("product_variants").update(payload).eq("id", v.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("product_variants").insert(payload);
          if (error) throw error;
        }
      }

      // Detect "sensitive" changes — re-validation needed
      const variantsChanged =
        JSON.stringify(
          variants.map((v) => ({
            id: v.id,
            size: v.size.trim() || null,
            color: v.color.trim() || null,
            color_hex: v.color_hex || null,
            stock: Number(v.stock) || 0,
            price_override: v.price_override ? Number(v.price_override) : null,
            image_url: v.remove_image ? null : v.image_url,
            new_image: !!v.image_file,
          })),
        ) !==
          JSON.stringify(
            (data.variants as ExistingVariant[]).map((v) => ({
              id: v.id,
              size: v.size,
              color: v.color,
              color_hex: v.color_hex,
              stock: v.stock,
              price_override: v.price_override != null ? Number(v.price_override) : null,
              image_url: v.image_url,
              new_image: false,
            })),
          ) ||
        removedVariantIds.length > 0 ||
        originalVariantsKey === ""; // no-op safety

      const sensitiveChanged =
        name.trim() !== (orig.name ?? "") ||
        (designation.trim() || null) !== (orig.designation ?? null) ||
        (description.trim() || null) !== (orig.description ?? null) ||
        removedImageIds.length > 0 ||
        newImages.length > 0 ||
        variantsChanged;

      const w = weightKg.trim() ? Number(weightKg) : null;
      const l = lengthCm.trim() ? Math.round(Number(lengthCm)) : null;
      const wi = widthCm.trim() ? Math.round(Number(widthCm)) : null;
      const h = heightCm.trim() ? Math.round(Number(heightCm)) : null;

      const warrantyDays = warrantyValueToDays(warranty);
      const minQty = Math.max(1, Math.round(Number(minOrderQty) || 1));

      const updatePayload: any = {
        name: name.trim(),
        designation: designation.trim() || null,
        description: description.trim() || null,
        price: Number(price) || 0,
        weight_kg: w && w > 0 ? w : null,
        length_cm: l && l > 0 ? l : null,
        width_cm: wi && wi > 0 ? wi : null,
        height_cm: h && h > 0 ? h : null,
        weight_source: w && w > 0 ? "vendor_declared" : null,
        brand: brand.trim() || null,
        brand_id: brandId,
        barcode: barcode.trim() || null,
        warranty_days: warrantyDays,
        is_fragile: isFragile,
        min_order_qty: minQty,
        video_url: videoUrl.trim() || null,
        origin_country_id: originCountryId,
        sku: sku.trim() || null,
        fit_type: fitType || null,
        material: derivedMaterial,
        material_composition: derivedCompositionText,
        material_composition_items: hasComposition ? compositionItems : [],
        season: season || null,
        gender: gender || null,
        age_group: ageGroup || null,
        care_instructions: careInstructions.length > 0 ? careInstructions : null,
        ...(sensitiveChanged && status === "approved"
          ? { status: "pending" as const, is_edit: true, rejection_reason: null }
          : {}),
      };

      const { error: updErr } = await supabase.from("products").update(updatePayload).eq("id", productId);
      if (updErr) throw updErr;

      // Re-translate when the FR text changed so EN/AR stay in sync.
      const textChanged =
        name.trim() !== (orig.name ?? "") ||
        (designation.trim() || null) !== (orig.designation ?? null) ||
        (description.trim() || null) !== (orig.description ?? null);
      if (textChanged) {
        const { autoTranslateProduct } = await import("@/lib/auto-translate");
        void autoTranslateProduct({
          productId,
          name: name.trim(),
          designation: designation.trim() || null,
          description: description.trim() || null,
        });
      }

      if (sensitiveChanged && status === "approved") {
        toast.success("Modifications enregistrées. En attente de validation par l'admin.");
      } else {
        toast.success("Produit mis à jour.");
      }
      router.navigate({ to: "/vendor" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  if (!data?.product) return <p className="text-sm text-muted-foreground">Produit introuvable.</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h1 className="text-xl font-bold">Modifier le produit</h1>
      {status === "approved" && (
        <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          Toute modification du nom, description, images ou variantes repassera le produit en attente de validation par l'admin.
        </p>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Photos</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {existingImages.map((im) => (
              <div key={im.id} className="relative h-24 w-24 overflow-hidden rounded-lg bg-muted">
                <img src={im.url} alt="" className="h-full w-full object-cover" />
                <button type="button" onClick={() => removeExisting(im.id)}
                  className="absolute right-1 top-1 rounded-full bg-background/80 p-0.5">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {newImages.map((f, i) => (
              <div key={i} className="relative h-24 w-24 overflow-hidden rounded-lg bg-muted ring-2 ring-primary">
                <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
                <button type="button" onClick={() => removeNew(i)}
                  className="absolute right-1 top-1 rounded-full bg-background/80 p-0.5">
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
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Informations</CardTitle>
          <Button type="button" size="sm" variant="outline" onClick={() => setAiCopyOpen(true)} className="gap-1">
            <Sparkles className="h-4 w-4" /> Générer avec l'IA
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Nom *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Désignation</Label><Input value={designation} onChange={(e) => setDesignation(e.target.value)} /></div>
          <div><Label>Description</Label><Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div>
            <Label>Prix (FCFA) *</Label>
            <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">Prix affiché tel quel au client.</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <div>
              <Label className="text-sm font-medium">Poids et dimensions (optionnel)</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Si renseigné, une estimation transport sera affichée au client pour les commandes internationales. Sinon : "Transport calculé après réception et pesée".
              </p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <Label className="text-[10px]">Poids (kg)</Label>
                <Input className="h-8" type="number" min={0} step="0.01" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="2" />
              </div>
              <div>
                <Label className="text-[10px]">L (cm)</Label>
                <Input className="h-8" type="number" min={0} value={lengthCm} onChange={(e) => setLengthCm(e.target.value)} placeholder="—" />
              </div>
              <div>
                <Label className="text-[10px]">l (cm)</Label>
                <Input className="h-8" type="number" min={0} value={widthCm} onChange={(e) => setWidthCm(e.target.value)} placeholder="—" />
              </div>
              <div>
                <Label className="text-[10px]">H (cm)</Label>
                <Input className="h-8" type="number" min={0} value={heightCm} onChange={(e) => setHeightCm(e.target.value)} placeholder="—" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Variantes (taille / couleur / modèle)</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {isClothing && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                <Ruler className="h-3.5 w-3.5" /> Vêtement détecté — coupe & mesures
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
                <div>
                  <Label className="text-[11px]">Type de coupe</Label>
                  <Select value={fitType} onValueChange={setFitType}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Choisir…" /></SelectTrigger>
                    <SelectContent>
                      {FIT_TYPES.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          <div className="flex flex-col">
                            <span className="font-medium">{f.label}</span>
                            <span className="text-[11px] text-muted-foreground">{f.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <p className="text-[11px] text-muted-foreground">
                    {fitTypeOption(fitType)?.description ?? "Sélectionnez le type de coupe pour aider le client."}
                  </p>
                </div>
              </div>

              <CompositionEditor items={compositionItems} onChange={setCompositionItems} />

              <ClothingExtraFields
                season={season}
                gender={gender}
                ageGroup={ageGroup}
                careInstructions={careInstructions}
                onSeason={setSeason}
                onGender={setGender}
                onAgeGroup={setAgeGroup}
                onCareInstructions={setCareInstructions}
              />

              <p className="text-[11px] text-muted-foreground">
                Mesures réelles (cm) par variante affichées dans le « Guide des tailles » côté client. <b>Composition (100%) + au moins une variante avec mesures obligatoires pour publier.</b>
              </p>
            </div>
          )}
          {variants.length === 0 && (
            <p className="text-xs text-muted-foreground">Aucune variante. Ajoutez-en une si vous proposez plusieurs tailles, couleurs ou modèles.</p>
          )}
          {variants.map((v, i) => {
            const previewUrl = v.image_file
              ? URL.createObjectURL(v.image_file)
              : v.remove_image ? null : v.image_url;
            return (
              <div key={i} className="rounded-lg border bg-background p-2 space-y-2">
                <div className="grid grid-cols-12 items-end gap-2">
                  <div className="col-span-2">
                    <Label className="text-[10px]">Taille</Label>
                    <Input className="h-8" value={v.size} onChange={(e) => updateVariant(i, { size: e.target.value })} placeholder="S, M…" />
                  </div>
                  <div className="col-span-3">
                    <Label className="text-[10px]">Couleur / Modèle</Label>
                    <Input className="h-8" value={v.color} onChange={(e) => updateVariant(i, { color: e.target.value })} placeholder="Rouge / Modèle A" />
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
                <div>
                  <Label className="text-[10px]">Référence variante (interne)</Label>
                  <Input
                    className="h-8 font-mono"
                    value={v.variant_ref}
                    onChange={(e) => updateVariant(i, { variant_ref: e.target.value })}
                    placeholder="Ex. REF-001-R-S"
                  />
                </div>
                {isClothing && (
                  <div className="rounded-md border-2 border-primary/40 bg-primary/5 p-2.5 space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                      <Ruler className="h-3.5 w-3.5" />
                      📏 Mesures réelles de cette variante (cm) — obligatoire
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Chaque taille/couleur a ses propres mesures. Ces valeurs alimentent le guide des tailles côté client.
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {measurementFields.map((f) => (
                        <div key={f.key}>
                          <Label className="text-[10px]">{f.label}</Label>
                          <Input
                            className="h-8"
                            type="number" min={0} step="0.5"
                            value={v.measurements?.[f.key] ?? ""}
                            onChange={(e) => updateVariant(i, {
                              measurements: { ...(v.measurements ?? {}), [f.key]: e.target.value },
                            })}
                            placeholder="—"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  {previewUrl ? (
                    <div className="relative h-14 w-14 overflow-hidden rounded border">
                      <img src={previewUrl} alt="" className="h-full w-full object-cover" />
                      <button type="button"
                        onClick={() => updateVariant(i, { image_file: null, remove_image: !!v.image_url })}
                        className="absolute right-0 top-0 rounded-bl bg-background/80 p-0.5">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex h-14 w-14 cursor-pointer items-center justify-center rounded border-2 border-dashed text-xs text-muted-foreground">
                      <Upload className="h-4 w-4" />
                      <input type="file" accept="image/*" className="hidden"
                        onChange={(e) => updateVariant(i, { image_file: e.target.files?.[0] ?? null, remove_image: false })} />
                    </label>
                  )}
                  <p className="text-[11px] text-muted-foreground">Image affichée quand cette variante est choisie.</p>
                </div>
              </div>
            );
          })}
          <Button type="button" variant="outline" size="sm" onClick={addVariant}>
            <Plus className="mr-1 h-4 w-4" /> Ajouter une variante
          </Button>
        </CardContent>
      </Card>

      {/* ═══ Options avancées ═══ */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <button type="button" className="flex w-full items-center justify-between rounded-xl border bg-card px-4 py-3 text-sm font-semibold hover:bg-accent">
            <span className="inline-flex items-center gap-2">
              <Settings2 className="h-4 w-4" /> Options avancées
              <span className="text-[11px] font-normal text-muted-foreground">(facultatif)</span>
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <Card>
            <CardContent className="space-y-4 pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Marque</Label>
                  <BrandCombobox
                    value={brandId}
                    onChange={(id, name) => { setBrandId(id); setBrand(name ?? ""); }}
                  />
                </div>
                <div>
                  <Label className="text-xs">Code-barres / EAN / UPC</Label>
                  <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} />
                </div>
              </div>

              <WarrantyPicker value={warranty} onChange={setWarranty} />

              <div>
                <Label className="text-xs">Vidéo produit</Label>
                <VideoUrlInput value={videoUrl} onChange={setVideoUrl} />
              </div>

              <div>
                <Label className="text-xs">Pays d'origine (lieu de fabrication réel)</Label>
                <CountrySelect value={originCountryId} onChange={setOriginCountryId} placeholder="Choisir le pays de fabrication" allowNull nullLabel="— Non précisé —" />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Indiquez où le produit a été réellement fabriqué.
                </p>
              </div>

              <label className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
                <Checkbox checked={isFragile} onCheckedChange={(v) => setIsFragile(!!v)} />
                <span>
                  Produit fragile
                  <span className="block text-[11px] font-normal text-muted-foreground">
                    Si non coché, le produit est considéré comme non fragile.
                  </span>
                </span>
              </label>

              <div>
                <Label className="text-xs">Quantité minimale de commande</Label>
                <Input type="number" min={1} value={minOrderQty} onChange={(e) => setMinOrderQty(e.target.value)} />
              </div>

              <div>
                <Label className="text-xs">SKU vendeur global (facultatif)</Label>
                <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Laisser vide si vous utilisez les références variantes" />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  ⚠️ Optionnel et déconseillé si vous avez plusieurs variantes. Utilisez plutôt la <b>Référence variante</b> sur chaque ligne — c'est ce qui est utilisé pour le stock, les commandes et le SAV. Jamais affiché aux clients.
                </p>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>



      <AiCopyGeneratorDialog
        open={aiCopyOpen}
        onOpenChange={setAiCopyOpen}
        onApply={(r) => {
          if (r.name) setName(r.name);
          if (r.designation) setDesignation(r.designation);
          if (r.description) setDescription(r.description);
        }}
      />

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => router.navigate({ to: "/vendor" })}>Annuler</Button>
        <Button type="submit" disabled={submitting}>{submitting ? "Enregistrement…" : "Enregistrer"}</Button>
      </div>
    </form>
  );
}
