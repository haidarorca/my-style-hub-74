import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Upload, X, Sparkles } from "lucide-react";
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
import { AiCopyGeneratorDialog } from "@/components/product/AiCopyGeneratorDialog";

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
type ReqRow = { id: string; name: string; level: number; status: string; parent_id: string | null; parent_request_id: string | null };
type CatPick = string;

const catValue = (id: string) => `cat:${id}`;
const reqValue = (id: string) => `req:${id}`;
const isReq = (value: CatPick) => value.startsWith("req:");
const idOf = (value: CatPick) => value.slice(4);

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
  const [weightKg, setWeightKg] = useState<string>("");
  const [lengthCm, setLengthCm] = useState<string>("");
  const [widthCm, setWidthCm] = useState<string>("");
  const [heightCm, setHeightCm] = useState<string>("");
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [rejectionReason, setRejectionReason] = useState("");
  const [vendorId, setVendorId] = useState<string>("");
  const [aiCopyOpen, setAiCopyOpen] = useState(false);

  // Category 3 levels (approved only)
  const [cat1, setCat1] = useState<CatPick>("");
  const [cat2, setCat2] = useState<CatPick>("");
  const [cat3, setCat3] = useState<CatPick>("");

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
      if (cats.error) throw cats.error;
      let pendingReq: ReqRow | null = null;
      let categoryRequests: ReqRow[] = [];
      if (prod.data?.pending_category_request_id) {
        const { data: pr } = await supabase
          .from("category_requests")
          .select("id, name, level, status, parent_id, parent_request_id")
          .eq("id", prod.data.pending_category_request_id)
          .maybeSingle();
        pendingReq = (pr ?? null) as ReqRow | null;
      }
      if (prod.data?.vendor_id) {
        const { data: reqRows, error: reqErr } = await supabase
          .from("category_requests")
          .select("id, name, level, status, parent_id, parent_request_id")
          .eq("vendor_id", prod.data.vendor_id)
          .order("level");
        if (reqErr) throw reqErr;
        categoryRequests = (reqRows ?? []) as ReqRow[];
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
        categoryRequests,
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
    setWeightKg((p as any).weight_kg != null ? String((p as any).weight_kg) : "");
    setLengthCm((p as any).length_cm != null ? String((p as any).length_cm) : "");
    setWidthCm((p as any).width_cm != null ? String((p as any).width_cm) : "");
    setHeightCm((p as any).height_cm != null ? String((p as any).height_cm) : "");
    setStatus((["pending","approved","rejected"].includes(p.status as string) ? p.status : "pending") as typeof status);
    setRejectionReason(p.rejection_reason ?? "");
    setVendorId(p.vendor_id ?? "");
    setExistingImages(data.images);
    setVariants(data.variants.map(fromExisting));

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

  // Pre-fill the exact category chain selected by the vendor, including pending requests.
  useEffect(() => {
    const p = data?.product;
    const cats = data?.categories;
    const reqs = data?.categoryRequests ?? [];
    if (!p || !cats?.length) return;
    const byId = new Map(cats.map(c => [c.id, c]));
    const reqById = new Map(reqs.map(r => [r.id, r]));
    const chain: CatPick[] = [];

    if (p.pending_category_request_id) {
      let curReq = reqById.get(p.pending_category_request_id) ?? data?.pendingCategoryRequest ?? undefined;
      while (curReq) {
        chain.unshift(reqValue(curReq.id));
        if (curReq.parent_request_id) {
          curReq = reqById.get(curReq.parent_request_id);
        } else if (curReq.parent_id) {
          let curCat: CatRow | undefined = byId.get(curReq.parent_id);
          while (curCat) {
            chain.unshift(catValue(curCat.id));
            curCat = curCat.parent_id ? byId.get(curCat.parent_id) : undefined;
          }
          curReq = undefined;
        } else {
          curReq = undefined;
        }
      }
    } else if (p.category_id) {
      let curCat: CatRow | undefined = byId.get(p.category_id);
      while (curCat) {
        chain.unshift(catValue(curCat.id));
        curCat = curCat.parent_id ? byId.get(curCat.parent_id) : undefined;
      }
    }

    setCat1(chain[0] ?? "");
    setCat2(chain[1] ?? "");
    setCat3(chain[2] ?? "");
  }, [data?.product?.id, data?.product?.category_id, data?.product?.pending_category_request_id, data?.categories, data?.categoryRequests, data?.pendingCategoryRequest]);

  const categoryOptions = useMemo(() => {
    const cats = data?.categories ?? [];
    const reqs = data?.categoryRequests ?? [];
    const level1 = [
      ...cats.filter(c => c.level === 1).map(c => ({ value: catValue(c.id), label: c.name, pending: false })),
      ...reqs.filter(r => r.level === 1 && !r.parent_id && !r.parent_request_id).map(r => ({ value: reqValue(r.id), label: `${r.name} (en attente)`, pending: true })),
    ];
    const childrenOf = (level: 2 | 3, parent: CatPick) => {
      if (!parent) return [];
      if (isReq(parent)) {
        return reqs.filter(r => r.level === level && r.parent_request_id === idOf(parent)).map(r => ({ value: reqValue(r.id), label: `${r.name} (en attente)`, pending: true }));
      }
      const parentId = idOf(parent);
      return [
        ...cats.filter(c => c.level === level && c.parent_id === parentId).map(c => ({ value: catValue(c.id), label: c.name, pending: false })),
        ...reqs.filter(r => r.level === level && r.parent_id === parentId).map(r => ({ value: reqValue(r.id), label: `${r.name} (en attente)`, pending: true })),
      ];
    };
    return { level1, level2: childrenOf(2, cat1), level3: childrenOf(3, cat2) };
  }, [data?.categories, data?.categoryRequests, cat1, cat2]);

  const categoryLabelByValue = useMemo(() => {
    const labels = new Map<string, string>();
    (data?.categories ?? []).forEach(c => labels.set(catValue(c.id), c.name));
    (data?.categoryRequests ?? []).forEach(r => labels.set(reqValue(r.id), `${r.name} (en attente)`));
    const pending = data?.pendingCategoryRequest as ReqRow | null | undefined;
    if (pending) {
      labels.set(reqValue(pending.id), `${pending.name} (en attente)`);
    }
    return labels;
  }, [data?.categories, data?.categoryRequests, data?.pendingCategoryRequest]);

  const withSelectedCategory = (
    options: Array<{ value: string; label: string; pending: boolean }>,
    selected: CatPick,
  ) => {
    if (!selected || options.some(o => o.value === selected)) return options;
    const label = categoryLabelByValue.get(selected);
    return label ? [{ value: selected, label, pending: isReq(selected) }, ...options] : options;
  };

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
    if (!name.trim() || !code.trim() || !price) {
      toast.error("Nom, code et prix obligatoires.");
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
      const cleanCode = code.trim();
      const { data: duplicate, error: duplicateErr } = await supabase
        .from("products")
        .select("id")
        .eq("vendor_id", vendorId)
        .eq("code", cleanCode)
        .neq("id", productId)
        .maybeSingle();
      if (duplicateErr) throw duplicateErr;
      if (duplicate) {
        throw new Error("Ce code produit existe déjà dans cette boutique.");
      }

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

      // Resolve final category pick (deepest selected), preserving pending category requests.
      const finalCategoryPick = cat3 || cat2 || cat1 || "";
      const finalCategoryId = finalCategoryPick && !isReq(finalCategoryPick) ? idOf(finalCategoryPick) : null;
      const finalPendingCategoryRequestId = finalCategoryPick && isReq(finalCategoryPick) ? idOf(finalCategoryPick) : null;

      // Product update
      const w = weightKg.trim() ? Number(weightKg) : null;
      const l = lengthCm.trim() ? Math.round(Number(lengthCm)) : null;
      const wi = widthCm.trim() ? Math.round(Number(widthCm)) : null;
      const h = heightCm.trim() ? Math.round(Number(heightCm)) : null;
      const updatePayload: any = {
        name: name.trim(),
        code: cleanCode,
        designation: designation.trim() || null,
        description: description.trim() || null,
        price: Number(price) || 0,
        category_id: finalCategoryId,
        pending_category_request_id: finalPendingCategoryRequestId,
        vendor_id: vendorId,
        status: (["pending","approved","rejected"].includes(status) ? status : "pending"),
        rejection_reason: status === "rejected" ? (rejectionReason.trim() || "Non conforme") : null,
        weight_kg: w && w > 0 ? w : null,
        length_cm: l && l > 0 ? l : null,
        width_cm: wi && wi > 0 ? wi : null,
        height_cm: h && h > 0 ? h : null,
        weight_source: w && w > 0 ? "vendor_declared" : null,
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
      console.error("[admin-edit-product] save failed:", err);
      const msg = err instanceof Error && err.message ? err.message : (typeof err === "object" ? JSON.stringify(err) : "Erreur inconnue");
      toast.error(msg);
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
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Informations</CardTitle>
          <Button type="button" size="sm" variant="outline" onClick={() => setAiCopyOpen(true)} className="gap-1">
            <Sparkles className="h-4 w-4" /> Générer avec l'IA
          </Button>
        </CardHeader>
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
          <div>
            <Label>Prix (FCFA) * <span className="text-xs text-amber-600">(sensible)</span></Label>
            <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <div>
              <Label className="text-sm font-medium">Poids et dimensions (optionnel)</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Si renseigné, une estimation transport sera proposée au client pour les commandes internationales. Sinon : "Transport calculé après réception et pesée".
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
        <CardHeader><CardTitle className="text-base">Catégorisation</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(() => {
            const chain = [cat1, cat2, cat3].filter(Boolean) as string[];
            if (chain.length === 0) {
              return (
                <div className="rounded-lg border border-dashed bg-muted/30 p-2 text-xs text-muted-foreground">
                  Aucune catégorie sélectionnée.
                </div>
              );
            }
            return (
              <div className="rounded-lg border bg-muted/30 p-2 text-xs">
                <span className="font-semibold text-muted-foreground">Catégorie actuelle :</span>{" "}
                <span className="font-medium">
                  {chain.map((v, i) => (
                    <span key={v}>
                      {i > 0 && <span className="mx-1 text-muted-foreground">›</span>}
                      {categoryLabelByValue.get(v) ?? "?"}
                    </span>
                  ))}
                </span>
              </div>
            );
          })()}
          {(() => {
            const pending = data.pendingCategoryRequest as { id: string; name: string; level: number; status: string; parent_id: string | null } | null;
            if (!pending) return null;
            return (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs">
                <span className="font-semibold text-amber-700">Demande de nouvelle catégorie (niveau {pending.level}) :</span>{" "}
                <span className="font-medium">« {pending.name} »</span>{" "}
                <span className="text-muted-foreground">— {pending.status}</span>
              </div>
            );
          })()}
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label>Catégorie</Label>
              <select
                value={cat1}
                onChange={(e) => { setCat1(e.target.value); setCat2(""); setCat3(""); }}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">—</option>
                {withSelectedCategory(categoryOptions.level1, cat1).map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <Label>Sous-catégorie</Label>
              <select
                value={cat2}
                onChange={(e) => { setCat2(e.target.value); setCat3(""); }}
                disabled={!cat1}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">—</option>
                {withSelectedCategory(categoryOptions.level2, cat2).map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <Label>Sous-sous-catégorie</Label>
              <select
                value={cat3}
                onChange={(e) => setCat3(e.target.value)}
                disabled={!cat2}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">—</option>
                {withSelectedCategory(categoryOptions.level3, cat3).map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
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
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs font-semibold text-muted-foreground">Variante {i + 1}</div>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 -mt-1 -mr-1" onClick={() => removeVariant(i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  <div>
                    <Label className="text-[10px]">Taille</Label>
                    <Input className="h-9" value={v.size} onChange={(e) => updateVariant(i, { size: e.target.value })} />
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    <Label className="text-[10px]">Couleur / Modèle</Label>
                    <Input className="h-9" value={v.color} onChange={(e) => updateVariant(i, { color: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-[10px]">Hex</Label>
                    <input type="color" value={v.color_hex || "#000000"} onChange={(e) => updateVariant(i, { color_hex: e.target.value })} className="h-9 w-full rounded border" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Stock</Label>
                    <Input className="h-9" type="number" min={0} value={v.stock} onChange={(e) => updateVariant(i, { stock: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label className="text-[10px]">Prix (opt.)</Label>
                    <Input className="h-9" type="number" min={0} value={v.price_override} onChange={(e) => updateVariant(i, { price_override: e.target.value })} />
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

      <div className="sticky bottom-0 -mx-3 flex flex-col-reverse gap-2 border-t bg-background/95 p-3 backdrop-blur sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => router.navigate({ to: "/admin/products" })}>Annuler</Button>
        <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
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

      <AiCopyGeneratorDialog
        open={aiCopyOpen}
        onOpenChange={setAiCopyOpen}
        onApply={(r) => {
          if (r.name) setName(r.name);
          if (r.designation) setDesignation(r.designation);
          if (r.description) setDescription(r.description);
        }}
      />
    </form>
  );
}
