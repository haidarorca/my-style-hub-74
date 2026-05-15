import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Upload, X } from "lucide-react";
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/admin/products/$productId/edit")({
  component: AdminEditProductPage,
});

const FONT_OPTIONS = [
  "Arial", "Helvetica", "Times New Roman", "Georgia", "Courier New",
  "Impact", "Comic Sans MS", "Pacifico", "Lobster", "Bebas Neue",
];
const COLOR_PRESETS = [
  "#000000", "#ffffff", "#e11d48", "#f59e0b", "#10b981",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280", "#fde047",
];

type ExistingImage = { id: string; url: string; position: number };
type ExistingVariant = {
  id: string; size: string | null; color: string | null;
  color_hex: string | null; stock: number;
  price_override: number | null; image_url: string | null;
};
type VariantDraft = {
  id: string | null;
  size: string; color: string; color_hex: string;
  stock: number; price_override: string;
  image_url: string | null; image_file: File | null; remove_image: boolean;
};
type CatRow = { id: string; name: string; level: number; parent_id: string | null };

function fromExisting(v: ExistingVariant): VariantDraft {
  return {
    id: v.id,
    size: v.size ?? "", color: v.color ?? "", color_hex: v.color_hex ?? "",
    stock: v.stock ?? 0,
    price_override: v.price_override != null ? String(v.price_override) : "",
    image_url: v.image_url, image_file: null, remove_image: false,
  };
}
function emptyVariant(): VariantDraft {
  return { id: null, size: "", color: "", color_hex: "", stock: 0, price_override: "", image_url: null, image_file: null, remove_image: false };
}

function AdminEditProductPage() {
  const { productId } = Route.useParams();
  const { user } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [designation, setDesignation] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [rejectionReason, setRejectionReason] = useState("");
  const [vendorId, setVendorId] = useState<string>("");

  // Category 3 levels (approved only)
  const [cat1, setCat1] = useState<string>("");
  const [cat2, setCat2] = useState<string>("");
  const [cat3, setCat3] = useState<string>("");

  const [existingImages, setExistingImages] = useState<ExistingImage[]>([]);
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);
  const [newImages, setNewImages] = useState<File[]>([]);

  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [removedVariantIds, setRemovedVariantIds] = useState<string[]>([]);

  // Customizations
  const [allowImage, setAllowImage] = useState(false);
  const [imageMessage, setImageMessage] = useState("");
  const [allowText, setAllowText] = useState(false);
  const [allowAllFonts, setAllowAllFonts] = useState(false);
  const [allowedFonts, setAllowedFonts] = useState<string[]>([]);
  const [allowAllColors, setAllowAllColors] = useState(false);
  const [allowedColors, setAllowedColors] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwdChecking, setPwdChecking] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-edit-product", productId],
    queryFn: async () => {
      const [prod, imgs, vars, custs, cats, vendors] = await Promise.all([
        supabase.from("products").select("*").eq("id", productId).maybeSingle(),
        supabase.from("product_images").select("id, url, position").eq("product_id", productId).order("position"),
        supabase.from("product_variants").select("*").eq("product_id", productId).order("created_at"),
        supabase.from("product_customizations").select("*").eq("product_id", productId),
        supabase.from("categories").select("id, name, level, parent_id").order("level").order("name"),
        supabase.from("user_roles").select("user_id, profiles:profiles!inner(id, full_name, shop_name, email)").eq("role", "vendeur"),
      ]);
      if (prod.error) throw prod.error;
      let pendingReq: { id: string; name: string; level: number; status: string; parent_id: string | null } | null = null;
      if (prod.data?.pending_category_request_id) {
        const { data: pr } = await supabase
          .from("category_requests")
          .select("id, name, level, status, parent_id")
          .eq("id", prod.data.pending_category_request_id)
          .maybeSingle();
        pendingReq = pr as typeof pendingReq;
      }
      return {
        product: prod.data,
        images: (imgs.data ?? []) as ExistingImage[],
        variants: (vars.data ?? []) as ExistingVariant[],
        customizations: (custs.data ?? []) as Array<{
          id: string; type: "image" | "name";
          image_size_message: string | null;
          allow_all_fonts: boolean | null; allowed_fonts: string[] | null;
          allow_all_colors: boolean | null; allowed_colors: string[] | null;
        }>,
        categories: (cats.data ?? []) as CatRow[],
        vendors: ((vendors.data ?? []) as Array<{ user_id: string; profiles: { id: string; full_name: string | null; shop_name: string | null; email: string | null } }>)
          .map(r => r.profiles)
          .filter(Boolean),
        pendingCategoryRequest: pendingReq,
      };
    },
  });

  useEffect(() => {
    if (!data?.product) return;
    const p = data.product;
    setName(p.name ?? "");
    setCode(p.code ?? "");
    setDesignation(p.designation ?? "");
    setDescription(p.description ?? "");
    setPrice(String(p.price ?? ""));
    setStatus(p.status);
    setRejectionReason(p.rejection_reason ?? "");
    setVendorId(p.vendor_id ?? "");
    setExistingImages(data.images);
    setVariants(data.variants.map(fromExisting));

    // Determine cat1/cat2/cat3 from product.category_id by walking up parents
    if (p.category_id && data.categories.length) {
      const byId = new Map(data.categories.map(c => [c.id, c]));
      const chain: CatRow[] = [];
      let cur: CatRow | undefined = byId.get(p.category_id);
      while (cur) {
        chain.unshift(cur);
        cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
      }
      setCat1(chain[0]?.id ?? "");
      setCat2(chain[1]?.id ?? "");
      setCat3(chain[2]?.id ?? "");
    }

    // Customizations
    const imgC = data.customizations.find(c => c.type === "image");
    const txtC = data.customizations.find(c => c.type === "name");
    if (imgC) { setAllowImage(true); setImageMessage(imgC.image_size_message ?? ""); }
    if (txtC) {
      setAllowText(true);
      setAllowAllFonts(!!txtC.allow_all_fonts);
      setAllowedFonts(txtC.allowed_fonts ?? []);
      setAllowAllColors(!!txtC.allow_all_colors);
      setAllowedColors(txtC.allowed_colors ?? []);
    }
  }, [data]);

  const cats1 = useMemo(() => (data?.categories ?? []).filter(c => c.level === 1), [data]);
  const cats2 = useMemo(() => (data?.categories ?? []).filter(c => c.level === 2 && c.parent_id === cat1), [data, cat1]);
  const cats3 = useMemo(() => (data?.categories ?? []).filter(c => c.level === 3 && c.parent_id === cat2), [data, cat2]);

  const orig = data?.product;
  const sensitiveChanged = useMemo(() => {
    if (!orig) return false;
    if ((code ?? "").trim() !== (orig.code ?? "")) return true;
    if (Number(price || 0) !== Number(orig.price ?? 0)) return true;
    // Stock changes (any variant stock differs or new/removed variants)
    const origByIdStock = new Map((data?.variants ?? []).map(v => [v.id, v.stock]));
    if (removedVariantIds.length) return true;
    for (const v of variants) {
      if (!v.id) { if (Number(v.stock) !== 0) return true; continue; }
      if (Number(v.stock) !== Number(origByIdStock.get(v.id) ?? 0)) return true;
    }
    return false;
  }, [orig, code, price, variants, removedVariantIds, data]);

  function onPickImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setNewImages(prev => [...prev, ...files].slice(0, 8));
    e.target.value = "";
  }
  const removeExisting = (id: string) => {
    setExistingImages(prev => prev.filter(im => im.id !== id));
    setRemovedImageIds(prev => [...prev, id]);
  };
  const removeNew = (i: number) => setNewImages(prev => prev.filter((_, idx) => idx !== i));
  const updateVariant = (i: number, patch: Partial<VariantDraft>) =>
    setVariants(v => v.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const addVariant = () => setVariants(v => [...v, emptyVariant()]);
  const removeVariant = (i: number) => {
    setVariants(v => {
      const row = v[i];
      if (row.id) setRemovedVariantIds(ids => [...ids, row.id!]);
      return v.filter((_, idx) => idx !== i);
    });
  };

  function toggleArr<T>(arr: T[], val: T): T[] {
    return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !data?.product) return;
    if (!name.trim() || !price) {
      toast.error("Nom et prix obligatoires.");
      return;
    }
    if (!vendorId) {
      toast.error("Vendeur requis.");
      return;
    }
    if (sensitiveChanged) {
      setPwdOpen(true);
      return;
    }
    await persist();
  }

  async function confirmWithPassword() {
    if (!user?.email || !pwd) {
      toast.error("Mot de passe requis.");
      return;
    }
    setPwdChecking(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: pwd });
      if (error) {
        toast.error("Mot de passe admin incorrect.");
        return;
      }
      setPwdOpen(false);
      setPwd("");
      await persist();
    } finally {
      setPwdChecking(false);
    }
  }

  async function persist() {
    if (!user || !data?.product) return;
    setSubmitting(true);
    try {
      // Upload new images
      if (newImages.length > 0) {
        const rows: { product_id: string; url: string; position: number }[] = [];
        const basePos = existingImages.length;
        for (let i = 0; i < newImages.length; i++) {
          const file = newImages[i];
          const ext = file.name.split(".").pop() || "jpg";
          const path = `${vendorId}/${productId}/${Date.now()}-${i}.${ext}`;
          const { error: upErr } = await supabase.storage.from("product-images").upload(path, file);
          if (upErr) throw upErr;
          const url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
          rows.push({ product_id: productId, url, position: basePos + i });
        }
        const { error: insErr } = await supabase.from("product_images").insert(rows);
        if (insErr) throw insErr;
      }
      if (removedImageIds.length > 0) {
        const { error } = await supabase.from("product_images").delete().in("id", removedImageIds);
        if (error) throw error;
      }

      // Variants
      if (removedVariantIds.length > 0) {
        const { error } = await supabase.from("product_variants").delete().in("id", removedVariantIds);
        if (error) throw error;
      }
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        let image_url: string | null = v.remove_image ? null : v.image_url;
        if (v.image_file) {
          const ext = v.image_file.name.split(".").pop() || "jpg";
          const path = `${vendorId}/${productId}/variants/${Date.now()}-${i}.${ext}`;
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

      // Customizations: replace all
      const { error: dcErr } = await supabase.from("product_customizations").delete().eq("product_id", productId);
      if (dcErr) throw dcErr;
      const customRows: Array<{
        product_id: string; type: "image" | "name";
        image_size_message?: string | null;
        allowed_fonts?: string[]; allow_all_fonts?: boolean;
        allowed_colors?: string[]; allow_all_colors?: boolean;
      }> = [];
      if (allowImage) customRows.push({ product_id: productId, type: "image", image_size_message: imageMessage.trim() || null });
      if (allowText) customRows.push({
        product_id: productId, type: "name",
        allowed_fonts: allowAllFonts ? [] : allowedFonts, allow_all_fonts: allowAllFonts,
        allowed_colors: allowAllColors ? [] : allowedColors, allow_all_colors: allowAllColors,
      });
      if (customRows.length > 0) {
        const { error } = await supabase.from("product_customizations").insert(customRows);
        if (error) throw error;
      }

      // Resolve final category id (deepest selected)
      const finalCategoryId = cat3 || cat2 || cat1 || null;

      // Product update
      const updatePayload: {
        name: string; code: string; designation: string | null; description: string | null;
        price: number; category_id: string | null; vendor_id: string;
        status: "pending" | "approved" | "rejected"; rejection_reason: string | null;
        is_edit?: boolean;
      } = {
        name: name.trim(),
        code: code.trim(),
        designation: designation.trim() || null,
        description: description.trim() || null,
        price: Number(price) || 0,
        category_id: finalCategoryId,
        vendor_id: vendorId,
        status,
        rejection_reason: status === "rejected" ? (rejectionReason.trim() || "Non conforme") : null,
      };
      if (status === "approved") updatePayload.is_edit = false;
      const { error: updErr } = await supabase.from("products").update(updatePayload).eq("id", productId);
      if (updErr) throw updErr;

      // Re-translate FR → EN+AR after admin edit (stored on the same row).
      const { autoTranslateProduct } = await import("@/lib/auto-translate");
      void autoTranslateProduct({
        productId,
        name: name.trim(),
        designation: designation.trim() || null,
        description: description.trim() || null,
      });

      toast.success("Produit mis à jour.");
      router.navigate({ to: "/admin/products" });
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
      <div className="flex items-center justify-between">
        <Link to="/admin/products" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Link>
        <h1 className="text-xl font-bold">Édition admin</h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Photos</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {existingImages.map((im) => (
              <div key={im.id} className="relative h-24 w-24 overflow-hidden rounded-lg bg-muted">
                <img src={im.url} alt="" className="h-full w-full object-cover" />
                <button type="button" onClick={() => removeExisting(im.id)} className="absolute right-1 top-1 rounded-full bg-background/80 p-0.5">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {newImages.map((f, i) => (
              <div key={i} className="relative h-24 w-24 overflow-hidden rounded-lg bg-muted ring-2 ring-primary">
                <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
                <button type="button" onClick={() => removeNew(i)} className="absolute right-1 top-1 rounded-full bg-background/80 p-0.5">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-xs text-muted-foreground hover:bg-accent">
              <Upload className="h-5 w-5" /> Ajouter
              <input type="file" accept="image/*" multiple onChange={onPickImages} className="hidden" />
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Informations</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div><Label>Nom *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div>
              <Label>Code-barres <span className="text-xs text-amber-600">(sensible)</span></Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
          </div>
          <div><Label>Désignation</Label><Input value={designation} onChange={(e) => setDesignation(e.target.value)} /></div>
          <div><Label>Description</Label><Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Prix (FCFA) * <span className="text-xs text-amber-600">(sensible)</span></Label>
              <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div>
              <Label>Vendeur associé</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger><SelectValue placeholder="Choisir un vendeur" /></SelectTrigger>
                <SelectContent>
                  {data.vendors.map(v => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.shop_name || v.full_name || v.email || v.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Catégorisation</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(() => {
            const byId = new Map((data.categories ?? []).map(c => [c.id, c]));
            const chain: string[] = [];
            let cur = data.product.category_id ? byId.get(data.product.category_id) : undefined;
            while (cur) { chain.unshift(cur.name); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
            const currentLabel = chain.length ? chain.join(" › ") : null;
            const pending = data.pendingCategoryRequest;
            if (!currentLabel && !pending) return null;
            return (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
                {currentLabel && (
                  <div>
                    <span className="text-xs font-semibold text-muted-foreground">Choisi par le vendeur :</span>{" "}
                    <span className="font-medium">{currentLabel}</span>
                  </div>
                )}
                {pending && (
                  <div>
                    <span className="text-xs font-semibold text-amber-700">Demande de nouvelle catégorie (niveau {pending.level}) :</span>{" "}
                    <span className="font-medium">« {pending.name} »</span>{" "}
                    <span className="text-xs text-muted-foreground">— statut : {pending.status}</span>
                  </div>
                )}
              </div>
            );
          })()}
          <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>Catégorie</Label>
            <Select value={cat1} onValueChange={(v) => { setCat1(v); setCat2(""); setCat3(""); }}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {cats1.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Sous-catégorie</Label>
            <Select value={cat2} onValueChange={(v) => { setCat2(v); setCat3(""); }} disabled={!cat1}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {cats2.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Sous-sous-catégorie</Label>
            <Select value={cat3} onValueChange={setCat3} disabled={!cat2}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {cats3.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Variantes & stock <span className="text-xs text-amber-600 font-normal">(stock = sensible)</span></CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {variants.map((v, i) => {
            const previewUrl = v.image_file ? URL.createObjectURL(v.image_file) : v.remove_image ? null : v.image_url;
            return (
              <div key={i} className="rounded-lg border bg-background p-2 space-y-2">
                <div className="grid grid-cols-12 items-end gap-2">
                  <div className="col-span-2">
                    <Label className="text-[10px]">Taille</Label>
                    <Input className="h-8" value={v.size} onChange={(e) => updateVariant(i, { size: e.target.value })} />
                  </div>
                  <div className="col-span-3">
                    <Label className="text-[10px]">Couleur / Modèle</Label>
                    <Input className="h-8" value={v.color} onChange={(e) => updateVariant(i, { color: e.target.value })} />
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
                    <Input className="h-8" type="number" min={0} value={v.price_override} onChange={(e) => updateVariant(i, { price_override: e.target.value })} />
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
                </div>
              </div>
            );
          })}
          <Button type="button" variant="outline" size="sm" onClick={addVariant}>
            <Plus className="mr-1 h-4 w-4" /> Ajouter une variante
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Personnalisation</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border p-2">
            <div>
              <div className="text-sm font-medium">Image personnalisée</div>
              <div className="text-xs text-muted-foreground">Le client peut envoyer une image.</div>
            </div>
            <Switch checked={allowImage} onCheckedChange={setAllowImage} />
          </div>
          {allowImage && (
            <div>
              <Label className="text-xs">Consignes pour l'image</Label>
              <Textarea rows={2} value={imageMessage} onChange={(e) => setImageMessage(e.target.value)} />
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border p-2">
            <div>
              <div className="text-sm font-medium">Texte / nom personnalisé</div>
              <div className="text-xs text-muted-foreground">Le client peut écrire un texte.</div>
            </div>
            <Switch checked={allowText} onCheckedChange={setAllowText} />
          </div>
          {allowText && (
            <div className="space-y-2 rounded-lg border p-2">
              <div className="flex items-center gap-2">
                <Checkbox checked={allowAllFonts} onCheckedChange={(c) => setAllowAllFonts(!!c)} />
                <Label className="text-xs">Toutes les polices</Label>
              </div>
              {!allowAllFonts && (
                <div className="grid grid-cols-2 gap-1">
                  {FONT_OPTIONS.map(f => (
                    <label key={f} className="flex items-center gap-1 text-xs">
                      <Checkbox checked={allowedFonts.includes(f)} onCheckedChange={() => setAllowedFonts(toggleArr(allowedFonts, f))} />
                      <span style={{ fontFamily: f }}>{f}</span>
                    </label>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 pt-2">
                <Checkbox checked={allowAllColors} onCheckedChange={(c) => setAllowAllColors(!!c)} />
                <Label className="text-xs">Toutes les couleurs</Label>
              </div>
              {!allowAllColors && (
                <div className="flex flex-wrap gap-1">
                  {COLOR_PRESETS.map(c => (
                    <button key={c} type="button"
                      onClick={() => setAllowedColors(toggleArr(allowedColors, c))}
                      className={`h-6 w-6 rounded border-2 ${allowedColors.includes(c) ? "border-primary" : "border-transparent"}`}
                      style={{ background: c }} />
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Statut de publication</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Statut</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="approved">Validé</SelectItem>
                <SelectItem value="rejected">Refusé</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {status === "rejected" && (
            <div>
              <Label>Motif de refus</Label>
              <Input value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Non conforme" />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => router.navigate({ to: "/admin/products" })}>Annuler</Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Enregistrement…" : sensitiveChanged ? "Enregistrer (mot de passe requis)" : "Enregistrer"}
        </Button>
      </div>

      <Dialog open={pwdOpen} onOpenChange={(o) => { if (!o) { setPwdOpen(false); setPwd(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmation requise</DialogTitle>
            <DialogDescription>
              Vous modifiez des champs sensibles (code-barres, prix ou stock). Saisissez votre mot de passe admin pour confirmer.
            </DialogDescription>
          </DialogHeader>
          <Input type="password" placeholder="Mot de passe admin" value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmWithPassword(); } }}
            autoFocus />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setPwdOpen(false); setPwd(""); }}>Annuler</Button>
            <Button type="button" onClick={confirmWithPassword} disabled={pwdChecking || !pwd}>
              {pwdChecking ? "Vérification…" : "Confirmer & enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
