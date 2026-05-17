import { useMemo, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Upload, X, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/shops/$shopId/products/new")({
  component: NewAdminShopProductPage,
});

type VariantInput = {
  size: string;
  color: string;
  color_hex: string;
  stock: number;
  price_override: string;
  image_file: File | null;
};

function NewAdminShopProductPage() {
  const { shopId } = Route.useParams();
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [designation, setDesignation] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<string>("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [images, setImages] = useState<File[]>([]);
  const [variants, setVariants] = useState<VariantInput[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { data: shop } = useQuery({
    queryKey: ["admin-shop-min", shopId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, shop_name, is_admin_shop")
        .eq("id", shopId)
        .maybeSingle();
      return data;
    },
  });

  const { data: cats } = useQuery({
    queryKey: ["all-categories-flat-admin-new"],
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("id, name, level, parent_id")
        .order("name");
      return data ?? [];
    },
  });

  const catOptions = useMemo(() => {
    const map = new Map((cats ?? []).map((c) => [c.id, c]));
    const path = (id: string): string => {
      const c = map.get(id);
      if (!c) return "";
      return c.parent_id ? `${path(c.parent_id)} › ${c.name}` : c.name;
    };
    return (cats ?? [])
      .filter((c) => c.level === 3)
      .map((c) => ({ id: c.id, label: path(c.id) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [cats]);

  const onPickImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setImages((prev) => [...prev, ...files].slice(0, 10));
    e.target.value = "";
  };
  const removeImage = (i: number) => setImages((prev) => prev.filter((_, idx) => idx !== i));
  const addVariant = () =>
    setVariants((v) => [...v, { size: "", color: "", color_hex: "", stock: 0, price_override: "", image_file: null }]);
  const updateVariant = (i: number, patch: Partial<VariantInput>) =>
    setVariants((v) => v.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const removeVariant = (i: number) => setVariants((v) => v.filter((_, idx) => idx !== i));

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
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      toast.error("Prix invalide.");
      return;
    }
    const cleanSourceUrl = sourceUrl.trim();
    if (cleanSourceUrl && !/^https?:\/\//.test(cleanSourceUrl)) {
      toast.error("Le lien source doit commencer par http(s)://");
      return;
    }

    setSubmitting(true);
    try {
      const { data: prod, error: prodErr } = await supabase
        .from("products")
        .insert({
          vendor_id: shopId,
          name: name.trim(),
          code: code.trim(),
          designation: designation.trim() || null,
          description: description.trim() || null,
          price: priceNum,
          category_id: categoryId || null,
          status: "approved",
        })
        .select("id")
        .single();
      if (prodErr) {
        if (prodErr.message.includes("unique") || prodErr.message.includes("duplicate")) {
          throw new Error("Ce code produit existe déjà dans cette boutique.");
        }
        throw prodErr;
      }
      const productId = prod.id as string;

      // Upload images
      const imageRows: { product_id: string; url: string; position: number }[] = [];
      for (let i = 0; i < images.length; i++) {
        const file = images[i];
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${shopId}/${productId}/${Date.now()}-${i}.${ext}`;
        const { error: upErr } = await supabase.storage.from("product-images").upload(path, file);
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
        imageRows.push({ product_id: productId, url: pub.publicUrl, position: i });
      }
      const { error: imgErr } = await supabase.from("product_images").insert(imageRows);
      if (imgErr) throw imgErr;

      // Variants
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
            const path = `${shopId}/${productId}/variants/${Date.now()}-${i}.${ext}`;
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

      // Admin-only source URL
      if (cleanSourceUrl) {
        const { error: pamErr } = await supabase
          .from("product_admin_metadata")
          .insert({ product_id: productId, source_url: cleanSourceUrl });
        if (pamErr) throw pamErr;
      }

      qc.invalidateQueries({ queryKey: ["admin-shops"] });
      toast.success("Produit créé dans la boutique.");
      router.navigate({ to: "/admin/shops" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-12">
      <div className="flex items-center gap-2">
        <Button asChild size="sm" variant="ghost">
          <Link to="/admin/shops"><ArrowLeft className="mr-1 h-4 w-4" /> Retour</Link>
        </Button>
        <h1 className="text-lg font-bold">
          Nouveau produit — {shop?.shop_name ?? "…"}
        </h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Photos</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {images.map((f, i) => (
              <div key={i} className="relative h-24 w-24 overflow-hidden rounded-lg bg-muted">
                <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
                <button type="button" onClick={() => removeImage(i)} className="absolute right-1 top-1 rounded-full bg-background/80 p-0.5">
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
            <Label>Code produit *</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ex : TB-12345" />
          </div>
          <div>
            <Label>Nom *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Désignation</Label>
            <Input value={designation} onChange={(e) => setDesignation(e.target.value)} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div>
            <Label>Prix (FCFA) *</Label>
            <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div>
            <Label>Catégorie</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="— Choisir —" /></SelectTrigger>
              <SelectContent>
                {catOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4" /> Lien source du produit (admin uniquement)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://item.taobao.com/... · https://www.1688.com/... · https://aliexpress.com/..."
          />
          <p className="text-[11px] text-muted-foreground">
            Visible uniquement par les administrateurs (pas par les clients ni dans les commandes côté client).
            Utile pour retrouver le fournisseur en dropshipping.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Variantes (optionnel)</CardTitle>
            <Button type="button" size="sm" variant="outline" onClick={addVariant}>
              <Plus className="mr-1 h-3 w-3" /> Ajouter
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {variants.length === 0 && (
            <p className="text-xs text-muted-foreground">Aucune variante. Le produit aura un seul prix / stock.</p>
          )}
          {variants.map((v, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-md border p-2">
              <Input placeholder="Taille" value={v.size} onChange={(e) => updateVariant(i, { size: e.target.value })} />
              <Input placeholder="Couleur" value={v.color} onChange={(e) => updateVariant(i, { color: e.target.value })} />
              <Input type="color" value={v.color_hex || "#000000"} onChange={(e) => updateVariant(i, { color_hex: e.target.value })} />
              <Input type="number" placeholder="Stock" value={v.stock} onChange={(e) => updateVariant(i, { stock: Number(e.target.value) || 0 })} />
              <Input type="number" placeholder="Prix variante (FCFA)" value={v.price_override} onChange={(e) => updateVariant(i, { price_override: e.target.value })} />
              <div className="flex items-center gap-1">
                <label className="cursor-pointer text-xs underline">
                  <input type="file" accept="image/*" className="hidden"
                    onChange={(e) => updateVariant(i, { image_file: e.target.files?.[0] ?? null })}
                  />
                  {v.image_file ? v.image_file.name.slice(0, 14) : "Image"}
                </label>
                <Button type="button" size="sm" variant="ghost" onClick={() => removeVariant(i)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" asChild>
          <Link to="/admin/shops">Annuler</Link>
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Publication…" : "Publier le produit"}
        </Button>
      </div>
    </form>
  );
}
