import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Upload,
  X,
  Sparkles,
  Clock,
  Camera,
  Loader2,
  Wand2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { autoTranslateProduct } from "@/lib/auto-translate";
import { analyzeVariantsFromImages } from "@/lib/admin-generator.functions";
import { humanizeOcrError } from "@/lib/admin-error-messages";
import { logError } from "@/lib/error-logger";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { useImageCompression } from "@/hooks/use-image-compression";
import { pickI18n } from "@/lib/i18n/localized";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AiCopyGeneratorDialog } from "@/components/product/AiCopyGeneratorDialog";


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
  price_override: string;
  image_file: File | null;
}

// Encoded selector value: "cat:UUID" (approved) or "req:UUID" (pending request).
type Pick = string;
const isReq = (v: Pick) => v.startsWith("req:");
const idOf = (v: Pick) => v.slice(4);

type CatRow = { id: string; name: string; level: number; parent_id: string | null; name_i18n: unknown };
type ReqRow = { id: string; name: string; level: number; parent_id: string | null; parent_request_id: string | null; status: string };

function NewProductPage() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const { compress, compressMultiple } = useImageCompression();
  const router = useRouter();
  const qc = useQueryClient();

  // Basic
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [designation, setDesignation] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<string>("");
  const [requiresIntlShipping, setRequiresIntlShipping] = useState<boolean>(false);

  // Category picks (3 levels, each "cat:UUID" or "req:UUID")
  const [pick1, setPick1] = useState<Pick>("");
  const [pick2, setPick2] = useState<Pick>("");
  const [pick3, setPick3] = useState<Pick>("");

  // Inline creation state per level
  const [newOpen, setNewOpen] = useState<0 | 1 | 2 | 3>(0);
  const [newName, setNewName] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);

  // Images / variants / customizations
  const [images, setImages] = useState<File[]>([]);
  const [variants, setVariants] = useState<VariantInput[]>([]);
  const [allowImage, setAllowImage] = useState(false);
  const [imageMessage, setImageMessage] = useState(t("vendor.new.custom_image_msg_placeholder"));
  const [allowText, setAllowText] = useState(false);
  const [allowAllFonts, setAllowAllFonts] = useState(false);
  const [allowedFonts, setAllowedFonts] = useState<string[]>([]);
  const [allowAllColors, setAllowAllColors] = useState(false);
  const [allowedColors, setAllowedColors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [aiCopyOpen, setAiCopyOpen] = useState(false);

  // OCR: import des variantes depuis des captures (taille / couleur / prix)
  const analyzeVariantsImg = useServerFn(analyzeVariantsFromImages);
  const OCR_TIMEOUT_MS = 45_000;
  type OcrVariant = {
    name: string; color: string; size: string;
    price_xof_detected: number; source_image_index: number | null;
  };
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrFiles, setOcrFiles] = useState<File[]>([]);
  const [ocrHint, setOcrHint] = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<{ variants: OcrVariant[] } | null>(null);
  const [ocrSelected, setOcrSelected] = useState<Set<number>>(new Set());

  const ocrFileUrls = useMemo(
    () => ocrFiles.map((f) => URL.createObjectURL(f)),
    [ocrFiles],
  );
  useEffect(() => {
    return () => { ocrFileUrls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [ocrFileUrls]);

  // Approved categories (all levels)
  const { data: cats } = useQuery({
    queryKey: ["vendor-new", "cats"],
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("id, name, level, parent_id, name_i18n")
        .order("position");
      return (data ?? []) as CatRow[];
    },
  });

  // Vendor's pending requests (so they can reuse them across products)
  const { data: reqs } = useQuery({
    queryKey: ["vendor-new", "my-pending-requests", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("category_requests")
        .select("id, name, level, parent_id, parent_request_id, status")
        .eq("vendor_id", user!.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      return (data ?? []) as ReqRow[];
    },
  });

  // Build option lists per level
  function optionsFor(level: 1 | 2 | 3): { value: Pick; label: string; pending: boolean }[] {
    const approved = (cats ?? []).filter((c) => c.level === level);
    const pending = (reqs ?? []).filter((r) => r.level === level);
    if (level === 1) {
      return [
        ...approved.map((c) => ({ value: `cat:${c.id}`, label: pickI18n(c.name, c.name_i18n, lang), pending: false })),
        ...pending
          .filter((r) => r.parent_id === null && r.parent_request_id === null)
          .map((r) => ({ value: `req:${r.id}`, label: r.name, pending: true })),
      ];
    }
    const parent = level === 2 ? pick1 : pick2;
    if (!parent) return [];
    if (isReq(parent)) {
      return pending
        .filter((r) => r.parent_request_id === idOf(parent))
        .map((r) => ({ value: `req:${r.id}`, label: r.name, pending: true }));
    }
    const parentId = idOf(parent);
    return [
      ...approved.filter((c) => c.parent_id === parentId).map((c) => ({ value: `cat:${c.id}`, label: pickI18n(c.name, c.name_i18n, lang), pending: false })),
      ...pending.filter((r) => r.parent_id === parentId).map((r) => ({ value: `req:${r.id}`, label: r.name, pending: true })),
    ];
  }

  const opts1 = useMemo(() => optionsFor(1), [cats, reqs]); // eslint-disable-line react-hooks/exhaustive-deps
  const opts2 = useMemo(() => optionsFor(2), [cats, reqs, pick1]); // eslint-disable-line react-hooks/exhaustive-deps
  const opts3 = useMemo(() => optionsFor(3), [cats, reqs, pick2]); // eslint-disable-line react-hooks/exhaustive-deps

  // The "deepest" pick determines what goes onto the product
  const deepestPick = pick3 || pick2 || pick1 || "";

  // Appliquer une categorie detectee par l'IA (recoit un UUID)
  const handleCategoryApply = useCallback(
    (categoryId: string) => {
      const allCats = cats ?? [];
      const cat = allCats.find((c) => c.id === categoryId);
      if (!cat) {
        toast.error("Categorie introuvable.");
        return;
      }

      const catL3 = cat.level === 3 ? cat : null;
      const catL2 =
        cat.level === 3
          ? allCats.find((c) => c.id === cat.parent_id)
          : cat.level === 2
            ? cat
            : null;
      const catL1 =
        cat.level === 3
          ? catL2
            ? allCats.find((c) => c.id === catL2.parent_id)
            : null
          : cat.level === 2
            ? allCats.find((c) => c.id === cat.parent_id)
            : cat;

      if (catL1) {
        setPick1(`cat:${catL1.id}`);
      }
      if (catL2) {
        setPick2(`cat:${catL2.id}`);
      } else {
        setPick2("");
      }
      if (catL3) {
        setPick3(`cat:${catL3.id}`);
      } else {
        setPick3("");
      }

      toast.success("Categorie appliquée !");
    },
    [cats],
  );

  function startNew(level: 1 | 2 | 3) {
    if (level === 2 && !pick1) return toast.error("Choisissez d'abord le rayon.");
    if (level === 3 && !pick2) return toast.error("Choisissez d'abord la catégorie.");
    setNewOpen(level);
    setNewName("");
  }

  async function confirmNew() {
    if (!user || !newOpen) return;
    const trimmed = newName.trim();
    if (trimmed.length < 2 || trimmed.length > 80) {
      toast.error("Le nom doit faire entre 2 et 80 caractères.");
      return;
    }
    const level = newOpen;
    let parent_id: string | null = null;
    let parent_request_id: string | null = null;
    if (level >= 2) {
      const parentPick = level === 2 ? pick1 : pick2;
      if (!parentPick) return;
      if (isReq(parentPick)) parent_request_id = idOf(parentPick);
      else parent_id = idOf(parentPick);
    }
    setCreatingNew(true);
    try {
      const { data, error } = await supabase
        .from("category_requests")
        .insert({
          vendor_id: user.id,
          level,
          name: trimmed,
          parent_id,
          parent_request_id,
        })
        .select("id")
        .single();
      if (error) throw error;
      const newPick: Pick = `req:${data.id}`;
      // Auto-select at the right level
      if (level === 1) { setPick1(newPick); setPick2(""); setPick3(""); }
      else if (level === 2) { setPick2(newPick); setPick3(""); }
      else { setPick3(newPick); }
      setNewOpen(0);
      setNewName("");
      await qc.invalidateQueries({ queryKey: ["vendor-new", "my-pending-requests"] });
      toast.success(`« ${trimmed} » envoyé pour validation. Vous pouvez l'utiliser tout de suite.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la création.");
    } finally {
      setCreatingNew(false);
    }
  }

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

  // ---------------------- OCR variantes (vendeur) ----------------------
  function onPickOcrFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
    setOcrFiles((prev) => [...prev, ...files].slice(0, 10));
    e.target.value = "";
  }
  async function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("Lecture image impossible"));
      r.readAsDataURL(file);
    });
  }
  async function handleOcrAnalyze() {
    if (ocrFiles.length === 0) return;
    setOcrLoading(true);
    setOcrError(null);
    setOcrResult(null);
    const progressToast = toast.loading("Analyse des images…");
    try {
      const dataUrls = await Promise.all(ocrFiles.map(fileToDataUrl));
      const r = (await Promise.race([
        analyzeVariantsImg({ data: { images: dataUrls, hint: ocrHint } }),
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error("Analyse OCR a expiré.")), OCR_TIMEOUT_MS),
        ),
      ])) as { variants: OcrVariant[] };
      toast.dismiss(progressToast);
      const safe = Array.isArray(r.variants) ? r.variants.slice(0, 60) : [];
      setOcrResult({ variants: safe });
      setOcrSelected(new Set(safe.map((_, i) => i)));
      if (safe.length === 0) toast.warning("Aucune variante détectée.");
      else toast.success(`${safe.length} variante(s) détectée(s).`);
    } catch (err) {
      toast.dismiss(progressToast);
      logError({
        type: "manual",
        message: err instanceof Error ? err.message : "Échec OCR",
        stack: err instanceof Error ? err.stack : undefined,
        url: window.location.href,
      });
      const msg = humanizeOcrError(err);
      setOcrError(msg);
      toast.error(msg);
    } finally {
      setOcrLoading(false);
    }
  }
  function applyOcrVariants(onlySelected = false) {
    if (!ocrResult) return;
    const sourceFiles = ocrFiles.slice();
    const picked = onlySelected
      ? ocrResult.variants.filter((_, i) => ocrSelected.has(i))
      : ocrResult.variants;
    if (picked.length === 0) { toast.error("Aucune variante sélectionnée."); return; }
    const rows: VariantInput[] = picked.map((v) => {
      const idx = v.source_image_index;
      const file = idx !== null && idx !== undefined ? sourceFiles[idx] ?? null : null;
      return {
        size: v.size,
        color: v.color || v.name,
        color_hex: "",
        stock: 0,
        price_override: v.price_xof_detected > 0 ? String(v.price_xof_detected) : "",
        image_file: file,
      };
    });
    setImages((prev) => {
      const next = [...prev];
      const keys = new Set(next.map((f) => `${f.name}|${f.size}`));
      const referenced = new Set<number>();
      for (const v of picked) {
        if (v.source_image_index !== null && v.source_image_index !== undefined) {
          referenced.add(v.source_image_index);
        }
      }
      for (const i of referenced) {
        const f = sourceFiles[i];
        if (!f) continue;
        if (next.length >= 8) break;
        const k = `${f.name}|${f.size}`;
        if (!keys.has(k)) { next.push(f); keys.add(k); }
      }
      return next;
    });
    setVariants((prev) => [...prev, ...rows]);
    toast.success(`${rows.length} variante(s) ajoutée(s).`);
    setOcrOpen(false);
    setOcrFiles([]);
    setOcrResult(null);
    setOcrSelected(new Set());
    setOcrHint("");
  }
  // ---------------------- /OCR variantes ----------------------


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
    if (!deepestPick) {
      toast.error("Choisissez une catégorie.");
      return;
    }

    const category_id = isReq(deepestPick) ? null : idOf(deepestPick);
    const pending_category_request_id = isReq(deepestPick) ? idOf(deepestPick) : null;

    setSubmitting(true);
    try {
      const cleanCode = code.trim();
      const { data: duplicate, error: duplicateErr } = await supabase
        .from("products")
        .select("id")
        .eq("vendor_id", user.id)
        .eq("code", cleanCode)
        .maybeSingle();
      if (duplicateErr) throw duplicateErr;
      if (duplicate) {
        throw new Error("Ce code-barres existe déjà dans votre boutique.");
      }

      const { data: prod, error: prodErr } = await supabase
        .from("products")
        .insert({
          vendor_id: user.id,
          name: name.trim(),
          code: cleanCode,
          designation: designation.trim() || null,
          description: description.trim() || null,
          price: priceNum,
          category_id,
          pending_category_request_id,
          requires_international_shipping: requiresIntlShipping,
          status: "pending",
        })
        .select("id")
        .single();
      if (prodErr) {
        if (prodErr.message.includes("products_vendor_code_unique")) {
          throw new Error("Ce code-barres existe déjà dans votre boutique.");
        }
        throw prodErr;
      }
      const productId = prod.id as string;

      // COMPRESSION automatique des images produit avant upload
      const imageRows: { product_id: string; url: string; position: number }[] = [];
      const compressedImages = images.length > 0 ? await compressMultiple(images, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.85,
        maxSizeMB: 5,
      }) : [];
      for (let i = 0; i < compressedImages.length; i++) {
        const file = compressedImages[i];
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${user.id}/${productId}/${Date.now()}-${i}.${ext}`;
        const { error: upErr } = await supabase.storage.from("product-images").upload(path, file);
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
        imageRows.push({ product_id: productId, url: pub.publicUrl, position: i });
      }
      const { error: imgErr } = await supabase.from("product_images").insert(imageRows);
      if (imgErr) throw imgErr;

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
            // COMPRESSION automatique de l'image variante avant upload
            const compressedVariant = await compress(v.image_file, {
              maxWidth: 800,
              maxHeight: 800,
              quality: 0.85,
              maxSizeMB: 3,
            });
            const ext = compressedVariant.name.split(".").pop() || "jpg";
            const path = `${user.id}/${productId}/variants/${Date.now()}-${i}.${ext}`;
            const { error: upErr } = await supabase.storage.from("product-images").upload(path, compressedVariant);
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
        customRows.push({ product_id: productId, type: "image", image_size_message: imageMessage.trim() || null });
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

      // Fire-and-forget auto-translation FR → EN+AR (stored on the same row)
      void autoTranslateProduct({
        productId,
        name: name.trim(),
        designation: designation.trim() || null,
        description: description.trim() || null,
      });

      toast.success("Produit créé. En attente de validation par l'admin.");
      router.navigate({ to: "/vendor" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h1 className="text-xl font-bold">{t("vendor.products.new_title")}</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("vendor.new.photos")}</CardTitle></CardHeader>
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
              {t("vendor.new.add")}
              <input type="file" accept="image/*" multiple onChange={onPickImages} className="hidden" />
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">{t("vendor.new.info")}</CardTitle>
          <Button type="button" size="sm" variant="outline" onClick={() => setAiCopyOpen(true)} className="gap-1">
            <Sparkles className="h-4 w-4" /> Générer avec l'IA
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>{t("vendor.new.code_label")}</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("vendor.new.code_placeholder")} />
            <p className="mt-1 text-xs text-muted-foreground">{t("vendor.new.code_help")}</p>
          </div>
          <div>
            <Label>{t("vendor.new.name_label")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>{t("vendor.new.designation_label")}</Label>
            <Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder={t("vendor.new.designation_placeholder")} />
          </div>
          <div>
            <Label>{t("vendor.new.description_label")}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div>
            <Label>{t("vendor.new.price_label")}</Label>
            <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">
              Ce prix sera affiché tel quel au client (FCFA).
            </p>
          </div>
          <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/30 p-3">
            <div className="min-w-0 flex-1">
              <Label className="text-sm font-medium">Frais internationaux après pesée</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Activez si le colis doit être pesé à l'arrivée (ex : Chine → Sénégal). Le client choisira un service de transport et les frais réels seront calculés après pesée.
              </p>
            </div>
            <Switch checked={requiresIntlShipping} onCheckedChange={setRequiresIntlShipping} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("vendor.new.cat_card")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-[11px] text-muted-foreground">{t("vendor.new.cat_help")}</p>

          <CategoryLevel
            label={t("vendor.new.cat_section")}
            placeholder={t("vendor.new.cat_section_pick")}
            options={opts1}
            value={pick1}
            onChange={(v) => { setPick1(v); setPick2(""); setPick3(""); setNewOpen(0); }}
            isCreating={newOpen === 1}
            onStartNew={() => startNew(1)}
            newName={newName}
            setNewName={setNewName}
            onConfirmNew={confirmNew}
            onCancelNew={() => setNewOpen(0)}
            creating={creatingNew}
            disabled={false}
            t={t}
          />

          <CategoryLevel
            label={t("vendor.new.cat_cat")}
            placeholder={pick1 ? t("vendor.new.cat_cat_pick") : t("vendor.new.cat_cat_first")}
            options={opts2}
            value={pick2}
            onChange={(v) => { setPick2(v); setPick3(""); setNewOpen(0); }}
            isCreating={newOpen === 2}
            onStartNew={() => startNew(2)}
            newName={newName}
            setNewName={setNewName}
            onConfirmNew={confirmNew}
            onCancelNew={() => setNewOpen(0)}
            creating={creatingNew}
            disabled={!pick1}
            t={t}
          />

          <CategoryLevel
            label={t("vendor.new.cat_sub")}
            placeholder={pick2 ? t("vendor.new.cat_sub_pick") : t("vendor.new.cat_sub_first")}
            options={opts3}
            value={pick3}
            onChange={(v) => { setPick3(v); setNewOpen(0); }}
            isCreating={newOpen === 3}
            onStartNew={() => startNew(3)}
            newName={newName}
            setNewName={setNewName}
            onConfirmNew={confirmNew}
            onCancelNew={() => setNewOpen(0)}
            creating={creatingNew}
            disabled={!pick2}
            t={t}
          />

          {deepestPick && isReq(deepestPick) && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-[11px] text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{t("vendor.new.cat_pending")}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">{t("vendor.new.variants")}</CardTitle>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setOcrOpen(true)}
            className="gap-1"
          >
            <Camera className="h-4 w-4" />
            Importer depuis images
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">{t("vendor.new.variants_help")}</p>
          {variants.map((v, i) => (
            <div key={i} className="rounded-lg border bg-background p-2 space-y-2">
              <div className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-2">
                  <Label className="text-[10px]">{t("vendor.new.v_size")}</Label>
                  <Input className="h-8" value={v.size} onChange={(e) => updateVariant(i, { size: e.target.value })} placeholder="S, M, 42…" />
                </div>
                <div className="col-span-3">
                  <Label className="text-[10px]">{t("vendor.new.v_color")}</Label>
                  <Input className="h-8" value={v.color} onChange={(e) => updateVariant(i, { color: e.target.value })} placeholder={t("vendor.new.v_color_placeholder")} />
                </div>
                <div className="col-span-1">
                  <Label className="text-[10px]">{t("vendor.new.v_hex")}</Label>
                  <input type="color" value={v.color_hex || "#000000"} onChange={(e) => updateVariant(i, { color_hex: e.target.value })} className="h-8 w-full rounded border" />
                </div>
                <div className="col-span-2">
                  <Label className="text-[10px]">{t("vendor.new.v_stock")}</Label>
                  <Input className="h-8" type="number" min={0} value={v.stock} onChange={(e) => updateVariant(i, { stock: Number(e.target.value) })} />
                </div>
                <div className="col-span-3">
                  <Label className="text-[10px]">{t("vendor.new.v_price")}</Label>
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
                <p className="text-[11px] text-muted-foreground">{t("vendor.new.v_image_help")}</p>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addVariant}>
            <Plus className="mr-1 h-4 w-4" /> {t("vendor.new.v_add")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("vendor.new.custom")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>{t("vendor.new.custom_image")}</Label>
              <p className="text-xs text-muted-foreground">{t("vendor.new.custom_image_help")}</p>
            </div>
            <Switch checked={allowImage} onCheckedChange={setAllowImage} />
          </div>
          {allowImage && (
            <div>
              <Label>{t("vendor.new.custom_image_msg")}</Label>
              <Textarea
                value={imageMessage}
                onChange={(e) => setImageMessage(e.target.value)}
                rows={2}
                placeholder={t("vendor.new.custom_image_msg_placeholder")}
              />
            </div>
          )}

          <div className="border-t pt-4" />

          <div className="flex items-center justify-between">
            <div>
              <Label>{t("vendor.new.custom_text")}</Label>
              <p className="text-xs text-muted-foreground">{t("vendor.new.custom_text_help")}</p>
            </div>
            <Switch checked={allowText} onCheckedChange={setAllowText} />
          </div>

          {allowText && (
            <div className="space-y-3">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label>{t("vendor.new.custom_fonts")}</Label>
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox checked={allowAllFonts} onCheckedChange={(v) => setAllowAllFonts(!!v)} />
                    {t("vendor.new.custom_all")}
                  </label>
                </div>
                {!allowAllFonts && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {FONT_OPTIONS.map((f) => (
                      <label key={f} className="flex items-center gap-2 rounded border bg-background p-2 text-xs">
                        <Checkbox checked={allowedFonts.includes(f)} onCheckedChange={(v) => toggleFont(f, !!v)} />
                        <span style={{ fontFamily: f }}>{f}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label>{t("vendor.new.custom_colors")}</Label>
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox checked={allowAllColors} onCheckedChange={(v) => setAllowAllColors(!!v)} />
                    {t("vendor.new.custom_all")}
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

      <Dialog open={ocrOpen} onOpenChange={setOcrOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-4 w-4" /> Importer les variantes depuis des images
            </DialogTitle>
            <DialogDescription>
              Envoyez jusqu'à 10 captures qui montrent vos tailles, couleurs et prix.
              L'IA détecte automatiquement les combinaisons et le prix en FCFA.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{ocrFiles.length} / 10 image(s)</span>
              {ocrFiles.length > 0 && (
                <button type="button" className="underline" onClick={() => setOcrFiles([])}>
                  Tout retirer
                </button>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto rounded border bg-muted/20 p-2 sm:grid-cols-5">
              {ocrFiles.map((f, i) => (
                <div key={`${f.name}-${i}`} className="relative aspect-square overflow-hidden rounded border bg-background">
                  <img src={ocrFileUrls[i]} alt="" loading="lazy" className="h-full w-full object-cover" />
                  <span className="absolute left-0.5 top-0.5 rounded bg-background/85 px-1 text-[9px] font-medium">#{i + 1}</span>
                  <button
                    type="button"
                    onClick={() => setOcrFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute right-0 top-0 rounded-bl bg-background/85 p-0.5"
                    aria-label="Retirer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {ocrFiles.length < 10 && (
                <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded border-2 border-dashed text-[10px] text-muted-foreground hover:bg-accent">
                  <Upload className="h-4 w-4" />
                  Ajouter
                  <input type="file" accept="image/*" multiple onChange={onPickOcrFiles} className="hidden" />
                </label>
              )}
            </div>
            <div>
              <Label className="text-xs">Indice (optionnel)</Label>
              <Input
                value={ocrHint}
                onChange={(e) => setOcrHint(e.target.value)}
                placeholder="Ex. Couleurs en image 1, tailles en image 2"
                className="h-8"
              />
            </div>
            <Button
              type="button"
              onClick={handleOcrAnalyze}
              disabled={ocrLoading || ocrFiles.length === 0}
              className="w-full gap-2"
            >
              {ocrLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {ocrLoading ? "Analyse…" : "Analyser les images"}
            </Button>

            {ocrError && (
              <div className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
                {ocrError}
              </div>
            )}

            {ocrResult && ocrResult.variants.length > 0 && (
              <div className="space-y-2 rounded-md border bg-muted/30 p-2">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{ocrSelected.size} / {ocrResult.variants.length} sélectionnée(s)</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="underline"
                      onClick={() => setOcrSelected(new Set(ocrResult.variants.map((_, i) => i)))}
                    >
                      Tout cocher
                    </button>
                    <button
                      type="button"
                      className="underline"
                      onClick={() => setOcrSelected(new Set())}
                    >
                      Décocher
                    </button>
                  </div>
                </div>
                <div className="max-h-60 overflow-y-auto rounded border bg-background">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/80 text-left text-[10px] uppercase">
                      <tr>
                        <th className="w-7 p-1.5"></th>
                        <th className="p-1.5">Variante</th>
                        <th className="p-1.5">Image</th>
                        <th className="p-1.5">Prix suggéré (FCFA)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ocrResult.variants.map((v, i) => {
                        const checked = ocrSelected.has(i);
                        const srcIdx = v.source_image_index;
                        return (
                          <tr
                            key={i}
                            className={`border-t cursor-pointer ${checked ? "" : "opacity-50"}`}
                            onClick={() => {
                              setOcrSelected((prev) => {
                                const n = new Set(prev);
                                if (n.has(i)) n.delete(i);
                                else n.add(i);
                                return n;
                              });
                            }}
                          >
                            <td className="p-1.5">
                              <input type="checkbox" checked={checked} onChange={() => {}} className="h-3.5 w-3.5" />
                            </td>
                            <td className="p-1.5">{v.name}</td>
                            <td className="p-1.5">
                              {srcIdx !== null && srcIdx !== undefined && ocrFileUrls[srcIdx] ? (
                                <img src={ocrFileUrls[srcIdx]} alt="" loading="lazy" className="h-7 w-7 rounded border object-cover" />
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="p-1.5 whitespace-nowrap">
                              {v.price_xof_detected > 0 ? `${v.price_xof_detected.toLocaleString("fr-FR")} F` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setOcrResult(null); setOcrSelected(new Set()); }}
                  >
                    Annuler
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={ocrSelected.size === 0}
                    onClick={() => applyOcrVariants(true)}
                  >
                    Valider sélection ({ocrSelected.size})
                  </Button>
                  <Button type="button" size="sm" onClick={() => applyOcrVariants(false)}>
                    Tout appliquer
                  </Button>
                </div>
              </div>
            )}
          </div>
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
        onCategoryApply={handleCategoryApply}
      />


      <div className="sticky bottom-0 -mx-3 border-t bg-background/95 p-3 backdrop-blur" style={{ paddingBottom: "calc(0.75rem + var(--safe-bottom, 0px))" }}>
        <Button type="submit" disabled={submitting} className="h-12 w-full rounded-full text-sm font-semibold">
          {submitting ? t("vendor.new.submitting") : t("vendor.new.submit")}
        </Button>
      </div>
    </form>
  );
}

function CategoryLevel({
  label, placeholder, options, value, onChange,
  isCreating, onStartNew, newName, setNewName, onConfirmNew, onCancelNew, creating, disabled, t,
}: {
  label: string;
  placeholder: string;
  options: { value: Pick; label: string; pending: boolean }[];
  value: Pick;
  onChange: (v: Pick) => void;
  isCreating: boolean;
  onStartNew: () => void;
  newName: string;
  setNewName: (v: string) => void;
  onConfirmNew: () => void;
  onCancelNew: () => void;
  creating: boolean;
  disabled: boolean;
  t: (key: string, fallback?: string) => string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label className={disabled ? "text-muted-foreground" : ""}>{label}</Label>
        {!isCreating && !disabled && (
          <button
            type="button"
            onClick={onStartNew}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
          >
            <Plus className="h-3 w-3" /> {t("vendor.new.cat_new")}
          </button>
        )}
      </div>

      {isCreating ? (
        <div className="flex gap-2">
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={80}
            placeholder={t("vendor.new.cat_new_placeholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); onConfirmNew(); }
              if (e.key === "Escape") { e.preventDefault(); onCancelNew(); }
            }}
          />
          <Button type="button" size="sm" onClick={onConfirmNew} disabled={creating}>
            {creating ? "…" : t("vendor.new.cat_create")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancelNew} disabled={creating}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Select value={value} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {options.length === 0 && (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                {t("vendor.new.cat_empty")}
              </div>
            )}
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                <span className="inline-flex items-center gap-2">
                  {o.label}
                  {o.pending && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">
                      <Clock className="h-2.5 w-2.5" /> {t("vendor.new.cat_pending_badge")}
                    </span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

