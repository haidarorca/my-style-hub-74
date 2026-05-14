import { useEffect, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/vendor/products/$productId/edit")({
  component: EditProductPage,
});

type ExistingImage = { id: string; url: string; position: number };

function EditProductPage() {
  const { productId } = Route.useParams();
  const { user } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");

  const [existingImages, setExistingImages] = useState<ExistingImage[]>([]);
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["vendor-edit-product", productId],
    queryFn: async () => {
      const [{ data: prod, error: e1 }, { data: imgs, error: e2 }] = await Promise.all([
        supabase.from("products").select("*").eq("id", productId).maybeSingle(),
        supabase.from("product_images").select("id, url, position").eq("product_id", productId).order("position"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return { product: prod, images: (imgs ?? []) as ExistingImage[] };
    },
  });

  useEffect(() => {
    if (!data?.product) return;
    const p = data.product;
    setName(p.name ?? "");
    setDesignation(p.designation ?? "");
    setDescription(p.description ?? "");
    setPrice(String(p.price ?? ""));
    setStatus(p.status);
    setExistingImages(data.images);
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
      // Detect "sensitive" changes that require re-validation
      const orig = data.product;
      const sensitiveChanged =
        name.trim() !== (orig.name ?? "") ||
        (designation.trim() || null) !== (orig.designation ?? null) ||
        (description.trim() || null) !== (orig.description ?? null) ||
        removedImageIds.length > 0 ||
        newImages.length > 0;

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

      // Delete removed images
      if (removedImageIds.length > 0) {
        const { error: delErr } = await supabase.from("product_images").delete().in("id", removedImageIds);
        if (delErr) throw delErr;
      }

      // Update product
      const updatePayload: Record<string, unknown> = {
        name: name.trim(),
        designation: designation.trim() || null,
        description: description.trim() || null,
        price: Number(price) || 0,
      };
      if (sensitiveChanged && status === "approved") {
        updatePayload.status = "pending";
        updatePayload.is_edit = true;
        updatePayload.rejection_reason = null;
      }
      const { error: updErr } = await supabase.from("products").update(updatePayload).eq("id", productId);
      if (updErr) throw updErr;

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
          Toute modification du nom, de la description ou des images repassera le produit en attente de validation par l'admin.
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
        <CardHeader><CardTitle className="text-base">Informations</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Nom *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Désignation</Label><Input value={designation} onChange={(e) => setDesignation(e.target.value)} /></div>
          <div><Label>Description</Label><Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div><Label>Prix (FCFA) *</Label><Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} /></div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => router.navigate({ to: "/vendor" })}>Annuler</Button>
        <Button type="submit" disabled={submitting}>{submitting ? "Enregistrement…" : "Enregistrer"}</Button>
      </div>
    </form>
  );
}
