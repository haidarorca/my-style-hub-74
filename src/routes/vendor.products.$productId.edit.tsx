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
};

function fromExisting(v: ExistingVariant): VariantDraft {
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
  };
}

function emptyVariant(): VariantDraft {
  return { id: null, size: "", color: "", color_hex: "", stock: 0, price_override: "", image_url: null, image_file: null, remove_image: false };
}

function EditProductPage() {
  const { productId } = Route.useParams();
  const { user } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [requiresIntlShipping, setRequiresIntlShipping] = useState<boolean>(false);
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
    setRequiresIntlShipping(Boolean((p as any).requires_international_shipping));
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
        const payload = {
          product_id: productId,
          size: v.size.trim() || null,
          color: v.color.trim() || null,
          color_hex: v.color_hex || null,
          stock: Number(v.stock) || 0,
          price_override: v.price_override ? Number(v.price_override) : null,
          image_url,
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

      const updatePayload = {
        name: name.trim(),
        designation: designation.trim() || null,
        description: description.trim() || null,
        price: Number(price) || 0,
        requires_international_shipping: requiresIntlShipping,
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
          <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/30 p-3">
            <div className="min-w-0 flex-1">
              <Label className="text-sm font-medium">Frais internationaux après pesée</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Activez si le colis doit être pesé à l'arrivée. Le client choisira un service de transport au panier et les frais réels seront calculés après pesée.
              </p>
            </div>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={requiresIntlShipping}
                onChange={(e) => setRequiresIntlShipping(e.target.checked)}
              />
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Variantes (taille / couleur / modèle)</CardTitle></CardHeader>
        <CardContent className="space-y-2">
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
