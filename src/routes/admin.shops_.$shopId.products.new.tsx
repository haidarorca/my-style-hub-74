import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Upload,
  X,
  Sparkles,
  Clock,
  Link2,
  Loader2,
  Wand2,
  Camera,
  Eye,
  Pencil,
  Undo2,
} from "lucide-react";
import { analyzeSourceUrl, analyzeVariantsFromImages } from "@/lib/admin-generator.functions";
import { humanizeOcrError, humanizeUrlError } from "@/lib/admin-error-messages";

import { VariantImageEditor } from "@/components/admin/VariantImageEditor";
import { AiCopyGeneratorDialog } from "@/components/ai/AiCopyGeneratorDialog";
import { useSiteSettings } from "@/hooks/use-site-settings";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { autoTranslateProduct } from "@/lib/auto-translate";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { pickI18n } from "@/lib/i18n/localized";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CommissionPricePreview } from "@/components/product/CommissionPricePreview";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { logError } from "@/lib/error-logger";

export const Route = createFileRoute("/admin/shops_/$shopId/products/new")({
  component: AdminProductPageWithBoundary,
});

const OCR_TIMEOUT_MS = 45_000;

function AdminProductPageWithBoundary() {
  return (
    <ErrorBoundary label="Formulaire admin produit">
      <NewAdminShopProductPage />
    </ErrorBoundary>
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label} a expiré.`)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// (humanizeOcrError / humanizeUrlError moved to @/lib/admin-error-messages)

function useObjectUrls(files: (File | null | undefined)[]) {
  const urls = useMemo(
    () => files.map((file) => (file ? URL.createObjectURL(file) : "")),
    [files],
  );

  useEffect(() => {
    return () => {
      urls.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [urls]);

  return urls;
}

const FONT_OPTIONS = [
  "Arial",
  "Helvetica",
  "Times New Roman",
  "Georgia",
  "Courier New",
  "Impact",
  "Comic Sans MS",
  "Pacifico",
  "Lobster",
  "Bebas Neue",
];

const COLOR_PRESETS = [
  "#000000",
  "#ffffff",
  "#e11d48",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#6b7280",
  "#fde047",
];

interface VariantInput {
  size: string;
  color: string;
  color_hex: string;
  stock: number;
  source_price: string;
  source_currency: string;
  price_override: string;
  image_file: File | null;
  image_original: File | null;
}

type Pick = string;
const isReq = (v: Pick) => v.startsWith("req:");
const idOf = (v: Pick) => v.slice(4);

type CatRow = {
  id: string;
  name: string;
  level: number;
  parent_id: string | null;
  name_i18n: unknown;
};
type ReqRow = {
  id: string;
  name: string;
  level: number;
  parent_id: string | null;
  parent_request_id: string | null;
  status: string;
};

function NewAdminShopProductPage() {
  const { shopId } = Route.useParams();
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();

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

  // Basic
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [designation, setDesignation] = useState("");
  const [description, setDescription] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [price, setPrice] = useState<string>("");
  const [requiresIntlShipping, setRequiresIntlShipping] = useState(false);

  // Admin-only
  const [sourceUrl, setSourceUrl] = useState("");

  // Analyzer state
  const analyze = useServerFn(analyzeSourceUrl);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<Awaited<ReturnType<typeof analyzeSourceUrl>> | null>(
    null,
  );

  // OCR variants from images
  const analyzeVariantsImg = useServerFn(analyzeVariantsFromImages);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrFiles, setOcrFiles] = useState<File[]>([]);
  const [ocrHint, setOcrHint] = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState("");
  const [ocrResult, setOcrResult] = useState<Awaited<
    ReturnType<typeof analyzeVariantsFromImages>
  > | null>(null);
  const [ocrSelected, setOcrSelected] = useState<Set<number>>(new Set());

  // Image preview pinned from a variant click (Taobao-like behaviour)
  const [previewedVariantIdx, setPreviewedVariantIdx] = useState<number | null>(null);
  // Manual image editor (admin-only)
  const [editingVariantIdx, setEditingVariantIdx] = useState<number | null>(null);
  const siteSettings = useSiteSettings();

  // Category picks
  const [pick1, setPick1] = useState<Pick>("");
  const [pick2, setPick2] = useState<Pick>("");
  const [pick3, setPick3] = useState<Pick>("");

  const [newOpen, setNewOpen] = useState<0 | 1 | 2 | 3>(0);
  const [newName, setNewName] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);

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
  const safePreviewVariant =
    previewedVariantIdx !== null ? variants[previewedVariantIdx] ?? null : null;
  const variantFiles = useMemo(() => variants.map((v) => v.image_file), [variants]);
  const imageUrls = useObjectUrls(images);
  const variantImageUrls = useObjectUrls(variantFiles);
  const ocrFileUrls = useObjectUrls(ocrFiles);

  useEffect(() => {
    if (previewedVariantIdx !== null && !variants[previewedVariantIdx]?.image_file) {
      setPreviewedVariantIdx(null);
    }
  }, [previewedVariantIdx, variants]);

  const { data: cats } = useQuery({
    queryKey: ["admin-shop-new", "cats"],
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("id, name, level, parent_id, name_i18n")
        .order("position");
      return (data ?? []) as CatRow[];
    },
  });

  // Pending requests belonging to this admin shop (vendor_id = shopId)
  const { data: reqs } = useQuery({
    queryKey: ["admin-shop-new", "pending-requests", shopId],
    queryFn: async () => {
      const { data } = await supabase
        .from("category_requests")
        .select("id, name, level, parent_id, parent_request_id, status")
        .eq("vendor_id", shopId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      return (data ?? []) as ReqRow[];
    },
  });

  function optionsFor(level: 1 | 2 | 3): { value: Pick; label: string; pending: boolean }[] {
    const approved = (cats ?? []).filter((c) => c.level === level);
    const pending = (reqs ?? []).filter((r) => r.level === level);
    if (level === 1) {
      return [
        ...approved.map((c) => ({
          value: `cat:${c.id}`,
          label: pickI18n(c.name, c.name_i18n, lang),
          pending: false,
        })),
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
      ...approved
        .filter((c) => c.parent_id === parentId)
        .map((c) => ({
          value: `cat:${c.id}`,
          label: pickI18n(c.name, c.name_i18n, lang),
          pending: false,
        })),
      ...pending
        .filter((r) => r.parent_id === parentId)
        .map((r) => ({ value: `req:${r.id}`, label: r.name, pending: true })),
    ];
  }

  const opts1 = useMemo(() => optionsFor(1), [cats, reqs]); // eslint-disable-line react-hooks/exhaustive-deps
  const opts2 = useMemo(() => optionsFor(2), [cats, reqs, pick1]); // eslint-disable-line react-hooks/exhaustive-deps
  const opts3 = useMemo(() => optionsFor(3), [cats, reqs, pick2]); // eslint-disable-line react-hooks/exhaustive-deps

  const deepestPick = pick3 || pick2 || pick1 || "";

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
          vendor_id: shopId,
          level,
          name: trimmed,
          parent_id,
          parent_request_id,
        })
        .select("id")
        .single();
      if (error) throw error;
      const newPick: Pick = `req:${data.id}`;
      if (level === 1) {
        setPick1(newPick);
        setPick2("");
        setPick3("");
      } else if (level === 2) {
        setPick2(newPick);
        setPick3("");
      } else {
        setPick3(newPick);
      }
      setNewOpen(0);
      setNewName("");
      await qc.invalidateQueries({ queryKey: ["admin-shop-new", "pending-requests", shopId] });
      toast.success(`« ${trimmed} » créé.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la création.");
    } finally {
      setCreatingNew(false);
    }
  }

  const onPickImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((file) => file.type.startsWith("image/"));
    setImages((prev) => [...prev, ...files].slice(0, 25));
    e.target.value = "";
  };
  const removeImage = (i: number) => setImages((prev) => prev.filter((_, idx) => idx !== i));
  const addVariant = () =>
    setVariants((v) => [
      ...v,
      {
        size: "",
        color: "",
        color_hex: "",
        stock: 0,
        source_price: "",
        source_currency: "",
        price_override: "",
        image_file: null,
        image_original: null,
      },
    ]);
  const updateVariant = (i: number, patch: Partial<VariantInput>) =>
    setVariants((v) => v.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const removeVariant = (i: number) => setVariants((v) => v.filter((_, idx) => idx !== i));
  const toggleFont = (f: string, checked: boolean) =>
    setAllowedFonts((prev) => (checked ? [...prev, f] : prev.filter((x) => x !== f)));
  const toggleColor = (c: string) =>
    setAllowedColors((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  async function generateAvailableProductCode(baseCode: string) {
    const normalized = baseCode.trim().replace(/\s+/g, "-").toUpperCase() || "PRODUIT";
    for (let i = 0; i < 8; i++) {
      const candidate = `${normalized}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const { data, error } = await supabase
        .from("products")
        .select("id")
        .eq("vendor_id", shopId)
        .eq("code", candidate)
        .maybeSingle();
      if (error) throw error;
      if (!data) return candidate;
    }
    return `${normalized}-${Date.now().toString().slice(-6)}`;
  }

  function publicationErrorMessage(err: unknown, step: string) {
    const raw = err instanceof Error ? err.message : "Erreur inconnue";
    if (raw.includes("Ce code produit existe déjà")) return raw;
    if (/row-level security|violates row-level security/i.test(raw)) {
      return `Permission refusée pendant l'étape « ${step} ». Les accès admin ont été corrigés, reconnectez-vous puis réessayez.`;
    }
    if (/duplicate|unique/i.test(raw)) {
      return "Ce code produit existe déjà dans cette boutique.";
    }
    return `Échec pendant l'étape « ${step} » : ${raw}`;
  }

  // ── Source URL analyzer ──────────────────────────────────
  async function dataUrlToFile(dataUrl: string, idx: number): Promise<File | null> {
    try {
      const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
      if (!m) return null;
      const mime = m[1];
      const bin = atob(m[2]);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const ext = mime.split("/")[1]?.split("+")[0] || "jpg";
      return new File([arr], `source-${Date.now()}-${idx}.${ext}`, { type: mime });
    } catch {
      return null;
    }
  }

  async function handleAnalyze() {
    const raw = sourceUrl.trim();
    if (raw.length < 4 || !/https?:\/\//i.test(raw)) {
      toast.error(
        "Collez un lien (e.tb.cn, taobao, 1688, aliexpress…) ou le texte de partage complet.",
      );
      return;
    }
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const r = await analyze({ data: { url: raw } });
      setAnalysis(r);
      if (r.partial) {
        toast.warning(r.partial_reason ?? "Analyse partielle — complétez manuellement.");
      } else {
        toast.success("Analyse terminée — appliquez les sections souhaitées.");
      }
      // Remplacer le texte de partage par l'URL canonique résolue (sauvegarde propre)
      if (r.resolved_url && /^https?:\/\//.test(r.resolved_url)) {
        setSourceUrl(r.resolved_url);
      }
    } catch (err) {
      toast.error(humanizeUrlError(err));
    } finally {
      setAnalyzing(false);
    }
  }

  function applyName() {
    if (!analysis?.name_fr) return;
    setName(analysis.name_fr);
    toast.success("Nom appliqué.");
  }
  function applyDesignation() {
    if (!analysis?.designation_fr) return;
    setDesignation(analysis.designation_fr);
    toast.success("Désignation appliquée.");
  }
  function applyDescription() {
    if (!analysis?.description_fr) return;
    setDescription(analysis.description_fr);
    toast.success("Description appliquée.");
  }
  function applyPrice() {
    if (!analysis?.suggested_price_xof) return;
    setPrice(String(analysis.suggested_price_xof));
    toast.success(
      `Prix appliqué (${analysis.source_price} ${analysis.source_currency} × ${analysis.fx_rate}).`,
    );
  }
  async function applyImages() {
    if (!analysis?.images?.length) return;
    const files: File[] = [];
    for (let i = 0; i < analysis.images.length; i++) {
      const f = await dataUrlToFile(analysis.images[i], i);
      if (f) files.push(f);
    }
    if (files.length === 0) {
      toast.error("Aucune image récupérée.");
      return;
    }
    setImages((prev) => [...prev, ...files].slice(0, 25));
    toast.success(`${files.length} image(s) ajoutée(s).`);
  }
  // NOTE: l'import par lien ne génère plus de variantes automatiquement.
  // Les variantes restent saisies via le formulaire intelligent (manuel ou OCR captures).

  // ── OCR variants from screenshots ────────────────────────
  function onPickOcrFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const maxFiles = 10;
    const maxMb = 14;
    const files = Array.from(e.target.files ?? []).filter(
      (file) => file.type.startsWith("image/") && file.size <= maxMb * 1024 * 1024,
    );
    if (files.length === 0 && e.target.files?.length) {
      toast.error(`Images trop lourdes ou invalides. Maximum ${maxMb} Mo par capture.`);
    }
    setOcrError("");
    setOcrFiles((prev) => {
      const merged = [...prev, ...files].slice(0, maxFiles);
      if (prev.length + files.length > maxFiles) {
        toast.info(`Limite atteinte : maximum ${maxFiles} images par session.`);
      }
      return merged;
    });
    e.target.value = "";
  }
  // Downscale + JPEG-compress to keep total payload small for the AI gateway.
  async function compressImageForOcr(file: File): Promise<string> {
    const maxSide = 1200;
    const quality = 0.72;
    let url = "";
    try {
      url = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("decode"));
        el.src = url;
      });
      const ratio = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * ratio));
      const h = Math.max(1, Math.round(img.naturalHeight * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("ctx");
      ctx.drawImage(img, 0, 0, w, h);
      return canvas.toDataURL("image/jpeg", quality);
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }
  async function handleOcrAnalyze() {
    if (ocrFiles.length === 0) {
      toast.error("Ajoutez au moins une capture.");
      return;
    }
    setOcrLoading(true);
    setOcrResult(null);
    setOcrError("");
    const total = ocrFiles.length;
    const progressToast = toast.loading(`Préparation 0/${total}…`);
    try {
      // Sequential compression with a yield between each — keeps mobile responsive
      // and avoids the white-screen freeze caused by Promise.all on many images.
      const dataUrls: string[] = [];
      for (let i = 0; i < ocrFiles.length; i++) {
        try {
          const url = await compressImageForOcr(ocrFiles[i]);
          dataUrls.push(url);
        } catch (err) {
          logError({
            type: "manual",
            message: err instanceof Error ? `Image OCR ignorée: ${err.message}` : "Image OCR ignorée",
            stack: err instanceof Error ? err.stack : undefined,
            url: window.location.href,
          });
        }
        toast.loading(`Préparation ${i + 1}/${total}…`, { id: progressToast });
        // Yield to the event loop so the UI can repaint.
        await new Promise((r) => setTimeout(r, 0));
      }
      if (dataUrls.length === 0) {
        throw new Error("Aucune capture lisible pour l'OCR.");
      }
      toast.loading(`Analyse IA en cours…`, { id: progressToast });
      const r = await withTimeout(
        analyzeVariantsImg({ data: { images: dataUrls, hint: ocrHint } }),
        OCR_TIMEOUT_MS,
        "Analyse OCR",
      );
      toast.dismiss(progressToast);
      const safeVariants = Array.isArray(r.variants) ? r.variants.slice(0, 60) : [];
      setOcrResult({ ...r, variants: safeVariants });
      setOcrSelected(new Set(safeVariants.map((_, i) => i)));
      if (safeVariants.length === 0) {
        toast.warning("Aucune variante détectée. Réessayez avec d'autres captures.");
      } else {
        toast.success(`${safeVariants.length} variante(s) détectée(s).`);
      }
    } catch (err) {
      toast.dismiss(progressToast);
      logError({
        type: "manual",
        message: err instanceof Error ? err.message : "Échec OCR",
        stack: err instanceof Error ? err.stack : undefined,
        url: window.location.href,
      });
      setOcrError(humanizeOcrError(err));
      toast.error(humanizeOcrError(err));
    } finally {
      setOcrLoading(false);
    }
  }
  async function applyOcrVariants(onlySelected = false) {
    if (!ocrResult) return;
    const sourceFiles = ocrFiles.slice();
    const allVariants = ocrResult.variants;
    const picked = onlySelected
      ? allVariants.filter((_, i) => ocrSelected.has(i))
      : allVariants;
    if (picked.length === 0) {
      toast.error("Aucune variante sélectionnée.");
      return;
    }

    // ⚡ No automatic canvas processing — attach raw source files. Admin can
    // open the editor on demand for the few images that need touch-ups.
    const rows: VariantInput[] = picked.map((v) => {
      const idx = v.source_image_index;
      const file = idx !== null && idx !== undefined ? sourceFiles[idx] ?? null : null;
      return {
        size: v.size,
        color: v.color || v.name,
        color_hex: "",
        stock: 0,
        source_price: v.source_price > 0 ? String(v.source_price) : "",
        source_currency: ocrResult.source_currency,
        price_override: v.price_xof_detected > 0 ? String(v.price_xof_detected) : "",
        image_file: file,
        image_original: file,
      };
    });

    // Push referenced source files into the product gallery (cap 25).
    setImages((prev) => {
      const next = [...prev];
      const existingKeys = new Set(next.map((f) => `${f.name}|${f.size}`));
      const referenced = new Set<number>();
      for (const v of picked) {
        if (v.source_image_index !== null && v.source_image_index !== undefined) {
          referenced.add(v.source_image_index);
        }
      }
      for (const idx of referenced) {
        const f = sourceFiles[idx];
        if (!f) continue;
        if (next.length >= 25) break;
        const k = `${f.name}|${f.size}`;
        if (!existingKeys.has(k)) {
          next.push(f);
          existingKeys.add(k);
        }
      }
      return next;
    });

    setVariants((prev) => [...prev, ...rows]);
    const withImg = rows.filter((r) => r.image_file).length;
    toast.success(
      `${rows.length} variante(s) ajoutée(s)${withImg > 0 ? ` · ${withImg} image(s) associée(s) automatiquement` : ""}.`,
    );
    setOcrOpen(false);
    setOcrFiles([]);
    setOcrResult(null);
    setOcrSelected(new Set());
    setOcrHint("");
  }

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
    // Le champ peut contenir un texte de partage Taobao — extraire l'URL si nécessaire
    let cleanSourceUrl = sourceUrl.trim();
    if (cleanSourceUrl && !/^https?:\/\//i.test(cleanSourceUrl)) {
      const m = cleanSourceUrl.match(/https?:\/\/\S+/i);
      cleanSourceUrl = m ? m[0] : "";
    }

    const category_id = isReq(deepestPick) ? null : idOf(deepestPick);
    const pending_category_request_id = isReq(deepestPick) ? idOf(deepestPick) : null;

    setSubmitting(true);
    let createdProductId: string | null = null;
    const uploadedPaths: string[] = [];
    let currentStep = "vérification du code produit";
    try {
      const cleanCode = code.trim();
      const { data: duplicate, error: duplicateErr } = await supabase
        .from("products")
        .select("id")
        .eq("vendor_id", shopId)
        .eq("code", cleanCode)
        .maybeSingle();
      if (duplicateErr) throw duplicateErr;
      if (duplicate) {
        const suggestion = await generateAvailableProductCode(cleanCode);
        setCode(suggestion);
        toast.error(`Ce code existe déjà. Nouveau code proposé : ${suggestion}`);
        throw new Error("Ce code produit existe déjà dans cette boutique.");
      }

      currentStep = "création du produit";
      const { data: prod, error: prodErr } = await supabase
        .from("products")
        .insert({
          vendor_id: shopId,
          name: name.trim(),
          code: cleanCode,
          designation: designation.trim() || null,
          description: description.trim() || null,
          price: priceNum,
          category_id,
          pending_category_request_id,
          requires_international_shipping: requiresIntlShipping,
          status: "approved",
        })
        .select("id")
        .single();
      if (prodErr) {
        if (prodErr.message.includes("unique") || prodErr.message.includes("duplicate")) {
          const suggestion = await generateAvailableProductCode(cleanCode);
          setCode(suggestion);
          toast.error(`Ce code existe déjà. Nouveau code proposé : ${suggestion}`);
          throw new Error("Ce code produit existe déjà dans cette boutique.");
        }
        throw prodErr;
      }
      const productId = prod.id as string;
      createdProductId = productId;

      currentStep = "enregistrement des images";
      const imageRows: { product_id: string; url: string; position: number }[] = [];
      for (let i = 0; i < images.length; i++) {
        const file = images[i];
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${shopId}/${productId}/${Date.now()}-${i}.${ext}`;
        const { error: upErr } = await supabase.storage.from("product-images").upload(path, file);
        if (upErr) throw upErr;
        uploadedPaths.push(path);
        const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
        imageRows.push({ product_id: productId, url: pub.publicUrl, position: i });
      }
      const { error: imgErr } = await supabase.from("product_images").insert(imageRows);
      if (imgErr) throw imgErr;

      if (variants.length > 0) {
        currentStep = "création des variantes et liaison des images";
        const variantRows: Array<{
          product_id: string;
          size: string | null;
          color: string | null;
          color_hex: string | null;
          stock: number;
          price_override: number | null;
          image_url: string | null;
        }> = [];
        for (let i = 0; i < variants.length; i++) {
          const v = variants[i];
          let image_url: string | null = null;
          if (v.image_file) {
            const ext = v.image_file.name.split(".").pop() || "jpg";
            const path = `${shopId}/${productId}/variants/${Date.now()}-${i}.${ext}`;
            const { error: upErr } = await supabase.storage
              .from("product-images")
              .upload(path, v.image_file);
            if (upErr) throw upErr;
            uploadedPaths.push(path);
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
        currentStep = "enregistrement des options de personnalisation";
        const { error: cErr } = await supabase.from("product_customizations").insert(customRows);
        if (cErr) throw cErr;
      }

      // Admin-only source URL (Taobao/1688/AliExpress/…)
      if (cleanSourceUrl) {
        currentStep = "enregistrement des informations admin";
        const { error: pamErr } = await supabase
          .from("product_admin_metadata")
          .insert({ product_id: productId, source_url: cleanSourceUrl });
        if (pamErr) throw pamErr;
      }

      void autoTranslateProduct({
        productId,
        name: name.trim(),
        designation: designation.trim() || null,
        description: description.trim() || null,
      });

      qc.invalidateQueries({ queryKey: ["admin-shops"] });
      toast.success("Produit créé dans la boutique.");
      router.navigate({ to: "/admin/shops" });
    } catch (err) {
      if (createdProductId) {
        await supabase.from("product_admin_metadata").delete().eq("product_id", createdProductId);
        await supabase.from("product_customizations").delete().eq("product_id", createdProductId);
        await supabase.from("product_variants").delete().eq("product_id", createdProductId);
        await supabase.from("product_images").delete().eq("product_id", createdProductId);
        await supabase.from("products").delete().eq("id", createdProductId);
      }
      if (uploadedPaths.length > 0) {
        await supabase.storage.from("product-images").remove(uploadedPaths);
      }
      toast.error(publicationErrorMessage(err, currentStep));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild size="sm" variant="ghost">
          <Link to="/admin/shops">
            <ArrowLeft className="mr-1 h-4 w-4" /> Retour
          </Link>
        </Button>
        <h1 className="text-xl font-bold">
          {t("vendor.products.new_title")} — {shop?.shop_name ?? "…"}
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("vendor.new.photos")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {previewedVariantIdx !== null && safePreviewVariant?.image_file && variantImageUrls[previewedVariantIdx] && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-2">
              <img
                src={variantImageUrls[previewedVariantIdx]}
                alt=""
                className="h-32 w-32 rounded-lg object-cover"
              />
              <div className="min-w-0 flex-1 text-xs">
                <div className="text-[10px] uppercase text-muted-foreground">Variante affichée</div>
                <div className="truncate font-medium">
                  {[safePreviewVariant.color, safePreviewVariant.size]
                    .filter(Boolean)
                    .join(" + ") || "—"}
                </div>
                {safePreviewVariant.source_price && (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Prix fournisseur :{" "}
                    <span className="text-foreground">
                      {safePreviewVariant.source_price} {safePreviewVariant.source_currency}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewedVariantIdx(null)}
                  className="mt-1 text-[11px] text-primary hover:underline"
                >
                  Retirer l'aperçu
                </button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {images.map((f, i) => (
              <div key={i} className="relative h-24 w-24 overflow-hidden rounded-lg bg-muted">
                <img src={imageUrls[i]} alt="" className="h-full w-full object-cover" />
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
              {t("vendor.new.add")}
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={onPickImages}
                className="hidden"
              />
            </label>
          </div>
          <p className="text-[10px] text-muted-foreground">Jusqu'à 25 images.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("vendor.new.info")}</CardTitle>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setAiOpen(true)}
            className="gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Generer avec l'IA
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>{t("vendor.new.code_label")}</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("vendor.new.code_placeholder")}
            />
            <p className="mt-1 text-xs text-muted-foreground">{t("vendor.new.code_help")}</p>
          </div>
          <div>
            <Label>{t("vendor.new.name_label")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>{t("vendor.new.designation_label")}</Label>
            <Input
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              placeholder={t("vendor.new.designation_placeholder")}
            />
          </div>
          <div>
            <Label>{t("vendor.new.description_label")}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div>
            <Label>{t("vendor.new.price_label")}</Label>
            <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
            <CommissionPricePreview
              vendorId={shopId}
              basePrice={price}
              categoryId={deepestPick && !isReq(deepestPick) ? idOf(deepestPick) : null}
            />
          </div>
          <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/30 p-3">
            <div className="min-w-0 flex-1">
              <Label className="text-sm font-medium">Frais internationaux après pesée</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Activez si ce produit doit afficher le choix Express, Fret ou Bateau dans le panier.
              </p>
            </div>
            <Switch checked={requiresIntlShipping} onCheckedChange={setRequiresIntlShipping} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("vendor.new.cat_card")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-[11px] text-muted-foreground">{t("vendor.new.cat_help")}</p>

          <CategoryLevel
            label={t("vendor.new.cat_section")}
            placeholder={t("vendor.new.cat_section_pick")}
            options={opts1}
            value={pick1}
            onChange={(v) => {
              setPick1(v);
              setPick2("");
              setPick3("");
              setNewOpen(0);
            }}
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
            onChange={(v) => {
              setPick2(v);
              setPick3("");
              setNewOpen(0);
            }}
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
            onChange={(v) => {
              setPick3(v);
              setNewOpen(0);
            }}
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
                <div className="col-span-3 sm:col-span-2">
                  <Label className="text-[10px]">{t("vendor.new.v_size")}</Label>
                  <Input
                    className="h-8"
                    value={v.size}
                    onChange={(e) => updateVariant(i, { size: e.target.value })}
                    placeholder="S, M, 42…"
                  />
                </div>
                <div className="col-span-5 sm:col-span-3">
                  <Label className="text-[10px]">{t("vendor.new.v_color")}</Label>
                  <Input
                    className="h-8"
                    value={v.color}
                    onChange={(e) => updateVariant(i, { color: e.target.value })}
                    placeholder={t("vendor.new.v_color_placeholder")}
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-[10px]">{t("vendor.new.v_hex")}</Label>
                  <input
                    type="color"
                    value={v.color_hex || "#000000"}
                    onChange={(e) => updateVariant(i, { color_hex: e.target.value })}
                    className="h-8 w-full rounded border"
                  />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <Label className="text-[10px]">Prix fournisseur</Label>
                  <Input
                    className="h-8"
                    value={v.source_price ? `${v.source_price} ${v.source_currency}` : "—"}
                    readOnly
                  />
                </div>
                <div className="col-span-6 sm:col-span-3">
                  <Label className="text-[10px]">Prix de vente estimé (FCFA)</Label>
                  <Input
                    className="h-8"
                    type="number"
                    min={0}
                    value={v.price_override}
                    onChange={(e) => updateVariant(i, { price_override: e.target.value })}
                    placeholder="—"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1 flex items-center gap-1">
                  {v.image_file && (
                    <Button
                      type="button"
                      variant={previewedVariantIdx === i ? "default" : "ghost"}
                      size="icon"
                      className="h-8 w-8"
                      title="Aperçu de cette variante"
                      onClick={() =>
                        setPreviewedVariantIdx((cur) => (cur === i ? null : i))
                      }
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      removeVariant(i);
                      setPreviewedVariantIdx((cur) =>
                        cur === i ? null : cur !== null && cur > i ? cur - 1 : cur,
                      );
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {v.image_file ? (
                  <div className="relative h-14 w-14 overflow-hidden rounded border">
                    <img
                      src={variantImageUrls[i]}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => updateVariant(i, { image_file: null, image_original: null })}
                      className="absolute right-0 top-0 rounded-bl bg-background/80 p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <label className="flex h-14 w-14 cursor-pointer items-center justify-center rounded border-2 border-dashed text-xs text-muted-foreground">
                    <Upload className="h-4 w-4" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        updateVariant(i, { image_file: f, image_original: f });
                      }}
                    />
                  </label>
                )}
                <div className="flex flex-col gap-1">
                  {v.image_file && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => setEditingVariantIdx(i)}
                    >
                      <Pencil className="mr-1 h-3 w-3" /> Modifier l'image
                    </Button>
                  )}
                  {v.image_original && v.image_file && v.image_file !== v.image_original && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => updateVariant(i, { image_file: v.image_original })}
                    >
                      <Undo2 className="mr-1 h-3 w-3" /> Originale
                    </Button>
                  )}
                </div>
              </div>
              <AdminPriceNote
                variant={v}
                rate={siteSettings.cny_to_xof_rate || 85}
              />
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addVariant}>
            <Plus className="mr-1 h-4 w-4" /> {t("vendor.new.v_add")}
          </Button>
        </CardContent>
      </Card>

      <VariantImageEditor
        open={editingVariantIdx !== null}
        file={editingVariantIdx !== null ? variants[editingVariantIdx]?.image_file ?? null : null}
        originalFile={
          editingVariantIdx !== null
            ? variants[editingVariantIdx]?.image_original ??
              variants[editingVariantIdx]?.image_file ??
              null
            : null
        }
        onClose={() => setEditingVariantIdx(null)}
        onSave={(file) => {
          if (editingVariantIdx === null) return;
          const cur = variants[editingVariantIdx];
          if (!cur) return;
          updateVariant(editingVariantIdx, {
            image_file: file,
            image_original: cur.image_original ?? cur.image_file,
          });
        }}
        onResetOriginal={() => {
          if (editingVariantIdx === null) return;
          const cur = variants[editingVariantIdx];
          if (!cur) return;
          updateVariant(editingVariantIdx, { image_file: cur.image_original ?? cur.image_file });
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("vendor.new.custom")}</CardTitle>
        </CardHeader>
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
                    <Checkbox
                      checked={allowAllFonts}
                      onCheckedChange={(v) => setAllowAllFonts(!!v)}
                    />
                    {t("vendor.new.custom_all")}
                  </label>
                </div>
                {!allowAllFonts && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {FONT_OPTIONS.map((f) => (
                      <label
                        key={f}
                        className="flex items-center gap-2 rounded border bg-background p-2 text-xs"
                      >
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
                  <Label>{t("vendor.new.custom_colors")}</Label>
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={allowAllColors}
                      onCheckedChange={(v) => setAllowAllColors(!!v)}
                    />
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

      {/* Admin-only: source URL + semi-automatic analyzer */}
      <Card className="border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4" /> Import semi-automatique (admin uniquement)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2">
            <Textarea
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder={
                "Collez ici :\n• un lien direct (item.taobao.com, 1688.com, aliexpress.com…)\n• un lien mobile court (https://e.tb.cn/...)\n• ou le texte de partage complet copié depuis l'app Taobao"
              }
              rows={3}
              className="font-mono text-xs"
            />
            <Button
              type="button"
              onClick={handleAnalyze}
              disabled={analyzing || !sourceUrl.trim()}
              className="gap-2 sm:self-end"
            >
              {analyzing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              {analyzing ? "Analyse…" : "Analyser le lien"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Visible uniquement par les administrateurs. Jamais affiché aux clients ni aux vendeurs.
            Le système suit automatiquement les redirections mobiles (e.tb.cn) et bascule sur un
            mode dégradé si Taobao bloque la page (récupération images + titre uniquement, le reste
            est à remplir à la main).
          </p>

          {analysis && (
            <div className="space-y-2 rounded-md border border-border bg-background/60 p-3 text-sm">
              {analysis.partial && (
                <div className="rounded border border-amber-500/40 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  ⚠ Analyse partielle : {analysis.partial_reason}
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  {analysis.source_price > 0 ? (
                    <>
                      Prix source :{" "}
                      <span className="font-medium text-foreground">
                        {analysis.source_price} {analysis.source_currency}
                      </span>{" "}
                      × {analysis.fx_rate} ={" "}
                      <span className="font-medium text-foreground">
                        {analysis.suggested_price_xof.toLocaleString("fr-FR")} XOF
                      </span>
                    </>
                  ) : (
                    <span className="italic">Prix non détecté — saisissez-le manuellement.</span>
                  )}
                </div>
              </div>

              {analysis.name_fr && (
                <div className="flex items-start justify-between gap-2 border-t border-border/60 pt-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] uppercase text-muted-foreground">Nom</div>
                    <div className="truncate">{analysis.name_fr}</div>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={applyName}>
                    Appliquer
                  </Button>
                </div>
              )}

              {analysis.designation_fr && (
                <div className="flex items-start justify-between gap-2 border-t border-border/60 pt-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] uppercase text-muted-foreground">Désignation</div>
                    <div className="line-clamp-2 text-xs">{analysis.designation_fr}</div>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={applyDesignation}>
                    Appliquer
                  </Button>
                </div>
              )}

              {analysis.description_fr && (
                <div className="flex items-start justify-between gap-2 border-t border-border/60 pt-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] uppercase text-muted-foreground">Description</div>
                    <div className="line-clamp-2 text-xs">{analysis.description_fr}</div>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={applyDescription}>
                    Appliquer
                  </Button>
                </div>
              )}

              {analysis.suggested_price_xof > 0 && (
                <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] uppercase text-muted-foreground">
                      Prix suggéré (XOF)
                    </div>
                    <div>{analysis.suggested_price_xof.toLocaleString("fr-FR")} F</div>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={applyPrice}>
                    Appliquer
                  </Button>
                </div>
              )}

              {analysis.images.length > 0 && (
                <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] uppercase text-muted-foreground">Images</div>
                    <div className="flex gap-1 overflow-x-auto py-1">
                      {analysis.images.slice(0, 6).map((src, i) => (
                        <img
                          key={i}
                          src={src}
                          alt=""
                          loading="lazy"
                          className="h-12 w-12 rounded object-cover"
                        />
                      ))}
                    </div>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={applyImages}>
                    Ajouter
                  </Button>
                </div>
              )}

              {/* Import par lien Taobao = texte produit uniquement.
                  Les variantes restent gérées exclusivement dans le formulaire
                  intelligent ci-dessous (saisie manuelle ou OCR à partir de captures). */}

              {analysis.suggested_category_name && (
                <div className="border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
                  Catégorie suggérée :{" "}
                  <span className="text-foreground">{analysis.suggested_category_name}</span>
                  {!analysis.suggested_category_id && " (non reconnue — sélectionnez manuellement)"}
                </div>
              )}
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
              Envoyez jusqu'à 10 captures (couleurs, tailles, prix). L'IA
              les analyse une par une et reconstruit les combinaisons en français.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{ocrFiles.length} / 10 image(s)</span>
              {ocrFiles.length > 0 && (
                <button
                  type="button"
                  className="underline"
                  onClick={() => setOcrFiles([])}
                >
                  Tout retirer
                </button>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto rounded border bg-muted/20 p-2 sm:grid-cols-5">
              {ocrFiles.map((f, i) => (
                <div key={`${f.name}-${i}`} className="relative aspect-square overflow-hidden rounded border bg-background">
                  <img src={ocrFileUrls[i]} alt="" loading="lazy" className="h-full w-full object-cover" />
                  <span className="absolute left-0.5 top-0.5 rounded bg-background/85 px-1 text-[9px] font-medium">
                    #{i + 1}
                  </span>
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
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={onPickOcrFiles}
                    className="hidden"
                  />
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
                  <span>
                    {ocrSelected.size} / {ocrResult.variants.length} sélectionnée(s) · devise :{" "}
                    {ocrResult.source_currency}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="underline"
                      onClick={() =>
                        setOcrSelected(new Set(ocrResult.variants.map((_, i) => i)))
                      }
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
                        <th className="p-1.5">Prix</th>
                        <th className="p-1.5">FCFA</th>
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
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {}}
                                className="h-3.5 w-3.5"
                              />
                            </td>
                            <td className="p-1.5">{v.name}</td>
                            <td className="p-1.5">
                              {srcIdx !== null && srcIdx !== undefined && ocrFileUrls[srcIdx] ? (
                                <div className="flex items-center gap-1">
                                  <img
                                    src={ocrFileUrls[srcIdx]}
                                    alt=""
                                    loading="lazy"
                                    className="h-7 w-7 rounded border object-cover"
                                  />
                                  <span className="text-[10px] text-muted-foreground">#{srcIdx + 1}</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="p-1.5 whitespace-nowrap">
                              {v.source_price > 0
                                ? `${v.source_price} ${ocrResult.source_currency}`
                                : "—"}
                            </td>
                            <td className="p-1.5 whitespace-nowrap">
                              {v.price_xof_detected > 0
                                ? `${v.price_xof_detected.toLocaleString("fr-FR")} F`
                                : "—"}
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
                    onClick={() => {
                      setOcrResult(null);
                      setOcrSelected(new Set());
                    }}
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

      <div
        className="sticky bottom-0 -mx-3 border-t bg-background/95 p-3 backdrop-blur"
        style={{ paddingBottom: "calc(0.75rem + var(--safe-bottom, 0px))" }}
      >
        <Button
          type="submit"
          disabled={submitting}
          className="h-12 w-full rounded-full text-sm font-semibold"
        >
          {submitting ? t("vendor.new.submitting") : "Publier le produit"}
        </Button>
      </div>
      {/* Dialog IA - Generateur de fiche produit */}
      <AiCopyGeneratorDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        onApply={(r) => {
          if (r.name) setName(r.name);
          if (r.designation) setDesignation(r.designation);
          if (r.description) setDescription(r.description);
          toast.success("Fiche produit generee ! Verifiez et ajustez si besoin.");
        }}
        title="Generer la fiche produit avec l'IA"
      />
    </form>
  );
}

function CategoryLevel({
  label,
  placeholder,
  options,
  value,
  onChange,
  isCreating,
  onStartNew,
  newName,
  setNewName,
  onConfirmNew,
  onCancelNew,
  creating,
  disabled,
  t,
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
              if (e.key === "Enter") {
                e.preventDefault();
                onConfirmNew();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                onCancelNew();
              }
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

// Admin-only internal price note (CNY → FCFA estimate + margin).
// Never rendered to the buyer — the buyer only sees `price_override`.
function AdminPriceNote({
  variant,
  rate,
}: {
  variant: VariantInput;
  rate: number;
}) {
  const src = Number(variant.source_price);
  const cur = (variant.source_currency || "").toUpperCase();
  const sale = Number(variant.price_override);
  if (!Number.isFinite(src) || src <= 0) return null;
  const inXof =
    cur === "CNY" ? src * rate : cur === "XOF" || cur === "FCFA" ? src : null;
  const margin =
    Number.isFinite(sale) && sale > 0 && inXof !== null && inXof > 0
      ? Math.round(((sale - inXof) / inXof) * 100)
      : null;
  return (
    <div className="rounded border border-dashed border-amber-300/70 bg-amber-50/60 px-2 py-1 text-[10px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
      <span className="font-medium">Note interne admin :</span> fournisseur {src} {cur}
      {inXof !== null && <> · ≈ {Math.round(inXof).toLocaleString("fr-FR")} FCFA</>}
      {margin !== null && (
        <>
          {" "}
          ·{" "}
          <span className={margin >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}>
            marge {margin >= 0 ? "+" : ""}
            {margin}%
          </span>
        </>
      )}
      <span className="ml-1 text-muted-foreground">(jamais visible côté client)</span>
    </div>
  );
}
