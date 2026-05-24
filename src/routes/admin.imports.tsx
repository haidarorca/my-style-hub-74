/**
 * admin.imports.tsx
 * -----------------
 * Import produits : Excel/CSV + IA Visuelle (images/videos/captures)
 *
 * L'admin upload des images/videos/captures, l'IA analyse visuellement
 * et cree un brouillon produit. Validation manuelle obligatoire.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Package, Trash2, Edit3, CheckCircle2, XCircle, ExternalLink,
  ImageIcon, Loader2, AlertTriangle, ChevronDown, ChevronUp,
  Save, FileSpreadsheet, Download, Table2, Sparkles, Bot,
  CircleCheck, CircleDashed, CircleX, Upload, Film, Camera,
  Eye, Wand2, GripVertical, Tag, Palette, Ruler, Box,
  Layers, Info, X, Plus, ArrowRight,
} from "lucide-react";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogHeader, DialogTitle, DialogContent } from "@/components/ui/dialog";
import {
  exportProducts, downloadTemplate, previewImport, commitImport,
} from "@/lib/import-export.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  uploadImportMedia, extractVideoFrames, analyzeVisualMedia,
  checkVisualDuplicate,
  type VisualProductDraft, type VisualVariant,
} from "@/lib/visual-ai-import.service";

export const Route = createFileRoute("/admin/imports")({
  component: () => (
    <PermissionGate perm="products">
      <AdminImports />
    </PermissionGate>
  ),
});

const fmtFcfa = (n: number | null) => n === null || n === undefined ? "—" : `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
const uid = () => `v-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;

// ── Types ──
interface DraftProduct {
  id: string;
  name: string;
  designation: string;
  description: string;
  price: number | null;
  priceNote: string;
  currency: string;
  images: string[];
  gallery: string[];
  variants: VisualVariant[];
  categoryId: string | null;
  categoryName: string | null;
  categoryConfidence: number;
  tags: string[];
  features: string[];
  materials: string[];
  colors: string[];
  detectedBrand: string | null;
  detectedText: string[];
  confidence: number;
  uncertainties: string[];
  sourceMedia: string[];
  packaging: string;
  style: string;
  accessories: string[];
  productType: string;
  status: "draft" | "published";
  createdAt: number;
}

const LS_KEY = "kawzone_visual_drafts";
function loadDrafts(): DraftProduct[] {
  try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveDrafts(drafts: DraftProduct[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(drafts));
}

// ── Convert VisualProductDraft to local DraftProduct ──
function visualToDraft(v: VisualProductDraft): DraftProduct {
  return {
    id: v.id,
    name: v.name,
    designation: v.designation,
    description: v.description,
    price: v.price,
    priceNote: v.priceNote,
    currency: v.currency,
    images: v.images,
    gallery: v.gallery,
    variants: v.variants,
    categoryId: v.categoryId,
    categoryName: v.categoryName,
    categoryConfidence: v.categoryConfidence,
    tags: v.tags,
    features: v.features,
    materials: v.materials,
    colors: v.colors,
    detectedBrand: v.detectedBrand,
    detectedText: v.detectedText,
    confidence: v.confidence,
    uncertainties: v.uncertainties,
    sourceMedia: v.sourceMedia,
    packaging: "",
    style: "",
    accessories: [],
    productType: "",
    status: "draft",
    createdAt: Date.now(),
  };
}

export default function AdminImports() {
  const [mainTab, setMainTab] = useState<"excel" | "visual" | "drafts">("visual");
  const [drafts, setDrafts] = useState<DraftProduct[]>(loadDrafts);
  useEffect(() => { saveDrafts(drafts); }, [drafts]);

  // Excel (keep existing)
  const fnExport = useServerFn(exportProducts);
  const fnTemplate = useServerFn(downloadTemplate);
  const fnPreview = useServerFn(previewImport);
  const fnCommit = useServerFn(commitImport);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const activeDrafts = drafts.filter(d => d.status === "draft");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Package className="h-5 w-5" /> Importation
        </h1>
        <p className="text-xs text-muted-foreground">Excel/CSV ou IA Visuelle (images / videos)</p>
      </div>

      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as "excel" | "visual" | "drafts")}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="excel" className="gap-1.5">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel/CSV
          </TabsTrigger>
          <TabsTrigger value="visual" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> IA Visuelle
          </TabsTrigger>
          <TabsTrigger value="drafts" className="gap-1.5">
            <Package className="h-3.5 w-3.5" /> Brouillons
            {activeDrafts.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px]">{activeDrafts.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Excel */}
        <TabsContent value="excel" className="space-y-4 pt-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" /> Excel / CSV
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => fnTemplate({}).then((r: any) => { const b = atob(r.base64); const bytes = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i); const blob = new Blob([bytes], { type: r.mime }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = r.fileName; a.click(); URL.revokeObjectURL(url); }).catch(() => toast.error("Erreur"))}>
                  <Download className="mr-1 h-3.5 w-3.5" /> Modele
                </Button>
                <Button variant="outline" size="sm" onClick={() => fnExport({ data: { scope: "admin", shopId: "", status: "any" } }).then((r: any) => { const b = atob(r.base64); const bytes = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i); const blob = new Blob([bytes], { type: r.mime }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = r.fileName; a.click(); URL.revokeObjectURL(url); }).catch(() => toast.error("Erreur"))}>
                  <Table2 className="mr-1 h-3.5 w-3.5" /> Exporter
                </Button>
              </div>
              <Separator />
              <Input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { setExcelFile(e.target.files?.[0] ?? null); setPreview(null); }} />
              <Button onClick={async () => { if (!excelFile) return; setPreviewLoading(true); try { const b64 = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve((r.result as string).split(",")[1] ?? ""); r.onerror = reject; r.readAsDataURL(excelFile); }); const r = await fnPreview({ data: { scope: "admin", shopId: "", fileBase64: b64, fileName: excelFile.name } }); setPreview(r); } catch (e: any) { toast.error(e.message); } setPreviewLoading(false); }} disabled={!excelFile || previewLoading} className="w-full">
                {previewLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Table2 className="h-4 w-4 mr-1" />}
              </Button>
              {preview && <Button onClick={async () => { try { const b64 = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve((r.result as string).split(",")[1] ?? ""); r.onerror = reject; r.readAsDataURL(excelFile!); }); await fnCommit({ data: { scope: "admin", shopId: "", fileBase64: b64, fileName: excelFile!.name } }); toast.success("Importe !"); setPreview(null); setExcelFile(null); } catch (e: any) { toast.error(e.message); } }} className="w-full"><CheckCircle2 className="h-4 w-4 mr-1" /> Importer</Button>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Visual AI Import */}
        <TabsContent value="visual" className="space-y-4 pt-3">
          <VisualImporter onDraftCreated={(d) => { setDrafts(prev => [d, ...prev]); setMainTab("drafts"); }} />
        </TabsContent>

        {/* Drafts */}
        <TabsContent value="drafts" className="space-y-4 pt-3">
          {activeDrafts.length === 0 ? (
            <div className="rounded-xl border border-dashed p-10 text-center">
              <Package className="mx-auto h-10 w-10 text-muted-foreground opacity-60" />
              <p className="text-sm font-semibold">Aucun brouillon</p>
              <p className="text-xs text-muted-foreground mt-1">Utilisez l&apos;IA Visuelle pour importer des produits</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setMainTab("visual")}>
                <Sparkles className="h-3.5 w-3.5 mr-1" /> Importer avec l&apos;IA
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {activeDrafts.map(d => (
                <DraftCard key={d.id} draft={d}
                  onPublish={async () => {
                    try {
                      const { data: product, error } = await supabase.from("products").insert({
                        name: d.name, designation: d.designation, description: d.description,
                        price: d.price || 0, status: "approved", is_active: true,
                        category_id: d.categoryId, code: `VIS-${Date.now().toString(36).toUpperCase()}`,
                      }).select().single();
                      if (error) throw error;
                      if (d.images.length > 0) await supabase.from("product_images").insert(d.images.map((url, i) => ({ product_id: product.id, url, position: i })));
                      if (d.variants.length > 0) await supabase.from("product_variants").insert(d.variants.map(v => ({ product_id: product.id, size: v.type === "size" ? v.value : "", color: v.type === "color" ? v.value : "", color_hex: v.hex || null, stock: 0 })));
                      setDrafts(prev => prev.filter(x => x.id !== d.id));
                      toast.success("Produit publie !");
                    } catch (e: any) { toast.error(e.message || "Erreur"); }
                  }}
                  onDiscard={() => setDrafts(prev => prev.filter(x => x.id !== d.id))}
                  onUpdate={(patch) => setDrafts(prev => prev.map(x => x.id === d.id ? { ...x, ...patch } : x))}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════════
//  VISUAL IMPORTER COMPONENT
// ═══════════════════════════════════════════════════
function VisualImporter({ onDraftCreated }: { onDraftCreated: (d: DraftProduct) => void }) {
  const [files, setFiles] = useState<{ file: File; preview: string; type: "image" | "video"; uploadedUrl?: string }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [logs, setLogs] = useState<{ msg: string; type: "info" | "ok" | "warn" | "err" }[]>([]);
  const [result, setResult] = useState<VisualProductDraft | null>(null);
  const [step, setStep] = useState<"upload" | "analyzing" | "preview">("upload");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fnUpload = useServerFn(uploadImportMedia);
  const fnExtractFrames = useServerFn(extractVideoFrames);
  const fnAnalyze = useServerFn(analyzeVisualMedia);
  const fnCheckDup = useServerFn(checkVisualDuplicate);

  const addLog = (msg: string, type: "info" | "ok" | "warn" | "err" = "info") => {
    setLogs(prev => [...prev, { msg, type }]);
  };

  // ── Drag & Drop ──
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(Array.from(e.dataTransfer.files));
  }, []);

  const handleFiles = (newFiles: File[]) => {
    const accepted = newFiles.filter(f =>
      f.type.startsWith("image/") || f.type.startsWith("video/")
    );
    if (accepted.length === 0) { toast.error("Images et videos uniquement"); return; }
    if (files.length + accepted.length > 20) { toast.error("Maximum 20 fichiers"); return; }

    const newItems = accepted.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      type: file.type.startsWith("video/") ? "video" as const : "image" as const,
    }));
    setFiles(prev => [...prev, ...newItems]);
    addLog(`${accepted.length} fichier(s) ajoute(s)`, "ok");
  };

  const removeFile = (idx: number) => {
    setFiles(prev => { const n = [...prev]; URL.revokeObjectURL(n[idx].preview); n.splice(idx, 1); return n; });
  };

  // ── Upload all files ──
  const uploadAll = async (): Promise<{ imageUrls: string[]; videoFrameUrls: string[] }> => {
    const imageUrls: string[] = [];
    const videoFrameUrls: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const item = files[i];
      addLog(`Upload ${i + 1}/${files.length}: ${item.file.name}...`, "info");

      try {
        // Convert to base64
        const b64 = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve((r.result as string).split(",")[1] ?? "");
          r.onerror = reject;
          r.readAsDataURL(item.file);
        });

        const res = await fnUpload({ data: {
          fileBase64: b64,
          fileName: item.file.name,
          mimeType: item.file.type,
        }}) as any;

        item.uploadedUrl = res.url;

        if (item.type === "image") {
          imageUrls.push(res.url);
          addLog(`  Image OK`, "ok");
        } else {
          addLog(`  Video OK, extraction frames...`, "info");
          const frames = await fnExtractFrames({ data: { videoUrl: res.url, maxFrames: 8 }}) as any;
          videoFrameUrls.push(...(frames.frameUrls || []));
          addLog(`  ${frames.frameCount || 0} frames extraites`, "ok");
        }
      } catch (e: any) {
        addLog(`  Erreur: ${e.message}`, "err");
      }
    }

    return { imageUrls, videoFrameUrls };
  };

  // ── Analyze ──
  const handleAnalyze = async () => {
    if (files.length === 0) { toast.error("Ajoutez des images ou videos"); return; }

    setIsAnalyzing(true);
    setStep("analyzing");
    setLogs([]);
    setResult(null);
    addLog("Demarrage de l'analyse visuelle...", "info");

    try {
      // Step 1: Upload
      addLog("Etape 1/3: Upload des medias...", "info");
      const { imageUrls, videoFrameUrls } = await uploadAll();

      if (imageUrls.length === 0 && videoFrameUrls.length === 0) {
        throw new Error("Aucun media n'a pu etre uploadé");
      }

      // Step 2: AI Analysis
      addLog("Etape 2/3: Analyse IA vision...", "info");
      const analysis = await fnAnalyze({ data: { imageUrls, videoFrameUrls }}) as any;

      if (analysis.logs) {
        for (const log of analysis.logs) {
          const type = log.includes("✓") || log.includes("OK") ? "ok" :
            log.includes("✗") || log.includes("Erreur") ? "err" : "info";
          addLog(log, type);
        }
      }

      if (!analysis.success || !analysis.draft) {
        throw new Error(analysis.errors?.[0] || "Analyse echouee");
      }

      // Step 3: Duplicate check
      addLog("Etape 3/3: Verification doublons...", "info");
      const dupCheck = await fnCheckDup({ data: {
        name: analysis.draft.name,
        brand: analysis.draft.detectedBrand,
        categoryId: analysis.draft.categoryId,
      }}) as any;

      if (dupCheck.isDuplicate) {
        addLog(`⚠ Doublon potentiel detecte (${dupCheck.matches?.length || 0} correspondance(s))`, "warn");
      } else {
        addLog("✓ Aucun doublon detecte", "ok");
      }

      setResult(analysis.draft);
      setStep("preview");
      toast.success(`Analyse terminee ! Confiance: ${analysis.draft.confidence}%`);

    } catch (e: any) {
      addLog(`Erreur: ${e.message}`, "err");
      toast.error(e.message || "Erreur");
      setStep("upload");
    }

    setIsAnalyzing(false);
  };

  // ── Save draft ──
  const handleSaveDraft = (editedDraft?: Partial<DraftProduct>) => {
    if (!result) return;
    const draft = visualToDraft({ ...result, ...editedDraft });
    onDraftCreated(draft);
    toast.success("Brouillon enregistre ! Verifiez les donnees avant publication.");
    // Reset
    setFiles([]);
    setResult(null);
    setStep("upload");
    setLogs([]);
  };

  return (
    <div className="space-y-4">
      {/* STEP 1: Upload */}
      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" /> Import IA Visuel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Info */}
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800 space-y-1.5">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="font-medium">Uploadez des images, videos ou captures d'ecran du produit. L'IA analysera visuellement et creera un brouillon.</span>
              </div>
              <ul className="list-disc list-inside ml-6 space-y-0.5">
                <li>Photos du produit (face, dos, details)</li>
                <li>Videos courtes (max 60s, frames auto-extraites)</li>
                <li>Captures d'ecran Taobao/1688</li>
              </ul>
            </div>

            {/* Drop Zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`
                border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                ${isDragging
                  ? "border-primary bg-primary/5 scale-[1.01]"
                  : "border-muted-foreground/20 hover:border-muted-foreground/40 hover:bg-muted/30"
                }
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => handleFiles(Array.from(e.target.files || []))}
              />
              <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Glissez-deposez vos images et videos ici</p>
              <p className="text-xs text-muted-foreground mt-1">ou cliquez pour parcourir</p>
              <p className="text-[10px] text-muted-foreground mt-1">PNG, JPG, WEBP, MP4, MOV — Max 20 fichiers</p>
            </div>

            {/* File Previews */}
            {files.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">{files.length} fichier(s)</span>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => { files.forEach(f => URL.revokeObjectURL(f.preview)); setFiles([]); }}>
                    <Trash2 className="h-3 w-3 mr-1" /> Tout supprimer
                  </Button>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {files.map((f, i) => (
                    <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border bg-muted">
                      {f.type === "video" ? (
                        <video src={f.preview} className="w-full h-full object-cover" muted preload="metadata" />
                      ) : (
                        <img src={f.preview} alt="" className="w-full h-full object-cover" />
                      )}
                      {f.type === "video" && (
                        <div className="absolute top-1 left-1 bg-black/70 text-white text-[9px] px-1 rounded flex items-center gap-0.5">
                          <Film className="h-2.5 w-2.5" /> Video
                        </div>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                        className="absolute top-1 right-1 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button
              onClick={handleAnalyze}
              disabled={files.length === 0 || isAnalyzing}
              className="w-full gap-2"
              size="lg"
            >
              <Sparkles className="h-4 w-4" />
              Analyser avec l'IA
            </Button>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: Analyzing */}
      {(step === "analyzing") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> Analyse en cours...
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Progress */}
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary animate-pulse rounded-full" style={{ width: isAnalyzing ? "60%" : "100%" }} />
              </div>
            </div>

            {/* Logs */}
            <div className="rounded-lg border bg-muted/30 p-3 max-h-[300px] overflow-y-auto space-y-1">
              {logs.map((log, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px]">
                  {log.type === "ok" && <CircleCheck className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />}
                  {log.type === "warn" && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />}
                  {log.type === "err" && <CircleX className="h-3 w-3 text-destructive shrink-0 mt-0.5" />}
                  {log.type === "info" && <CircleDashed className="h-3 w-3 text-blue-500 shrink-0 mt-0.5" />}
                  <span className={log.type === "err" ? "text-destructive" : log.type === "warn" ? "text-amber-700" : ""}>{log.msg}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: Preview & Validation */}
      {step === "preview" && result && (
        <VisualPreview
          draft={result}
          onSave={handleSaveDraft}
          onRetry={() => { setStep("upload"); setResult(null); setLogs([]); }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
//  VISUAL PREVIEW COMPONENT (Step 3)
// ═══════════════════════════════════════════════════
function VisualPreview({
  draft,
  onSave,
  onRetry,
}: {
  draft: VisualProductDraft;
  onSave: (patch?: Partial<DraftProduct>) => void;
  onRetry: () => void;
}) {
  const [editing, setEditing] = useState<Partial<DraftProduct>>({});

  const d = { ...visualToDraft(draft), ...editing };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className={d.confidence < 50 ? "border-amber-400" : d.uncertainties.length > 0 ? "border-amber-300" : "border-emerald-300"}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {d.confidence >= 70 ? <CircleCheck className="h-5 w-5 text-emerald-500" /> :
                d.confidence >= 40 ? <AlertTriangle className="h-5 w-5 text-amber-500" /> :
                  <CircleX className="h-5 w-5 text-destructive" />}
              <div>
                <h3 className="text-sm font-semibold">Resultat de l'analyse visuelle</h3>
                <p className="text-xs text-muted-foreground">Verifiez les donnees avant de sauvegarder</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={d.confidence >= 70 ? "default" : d.confidence >= 40 ? "secondary" : "destructive"}>
                Confiance: {d.confidence}%
              </Badge>
            </div>
          </div>

          {/* Uncertainties */}
          {d.uncertainties.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-2.5 space-y-1">
              <p className="text-[10px] font-semibold uppercase text-amber-700 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Incertitudes detectees ({d.uncertainties.length})
              </p>
              {d.uncertainties.map((u, i) => (
                <p key={i} className="text-[11px] text-amber-800">• {u}</p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Media Gallery */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1.5"><Camera className="h-3.5 w-3.5" /> Medias analyses</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {d.sourceMedia.map((url, i) => (
              <div key={i} className="aspect-square rounded-lg overflow-hidden border bg-muted">
                <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Editable Fields */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1.5"><Edit3 className="h-3.5 w-3.5" /> Details du produit</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {/* Name */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase">Nom du produit <span className="text-destructive">*</span></label>
            <Input value={d.name} onChange={(e) => setEditing(p => ({ ...p, name: e.target.value }))} className="mt-0.5" />
          </div>

          {/* Designation */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase">Designation</label>
            <Input value={d.designation} onChange={(e) => setEditing(p => ({ ...p, designation: e.target.value }))} className="mt-0.5" />
          </div>

          {/* Price */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase">Prix</label>
            <div className="flex gap-2 mt-0.5">
              <Input
                type="number"
                value={d.price ?? ""}
                placeholder={d.priceNote}
                onChange={(e) => setEditing(p => ({ ...p, price: e.target.value ? Number(e.target.value) : null }))}
                className={d.price === null ? "border-amber-300 bg-amber-50/30" : ""}
              />
              <span className="text-xs text-muted-foreground flex items-center">FCFA</span>
            </div>
            {d.price === null && (
              <p className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-1">
                <AlertTriangle className="h-2.5 w-2.5" /> {d.priceNote}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase">Description</label>
            <Textarea value={d.description} onChange={(e) => setEditing(p => ({ ...p, description: e.target.value }))} className="mt-0.5" rows={3} />
          </div>

          {/* Category */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase">Categorie suggeree</label>
            <div className="flex items-center gap-2 mt-0.5">
              <Input value={d.categoryName || "Non determinee"} readOnly className={!d.categoryName ? "border-amber-300 bg-amber-50/30" : ""} />
              <Badge variant="outline" className="text-[10px] shrink-0">{d.categoryConfidence}% match</Badge>
            </div>
          </div>

          {/* Brand */}
          {d.detectedBrand && (
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase">Marque detectee</label>
              <Input value={d.detectedBrand} readOnly className="mt-0.5" />
            </div>
          )}

          {/* Detected Text */}
          {d.detectedText.length > 0 && (
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase">Texte detecte (OCR)</label>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {d.detectedText.map((t, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">{t}</Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attributes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Colors */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1.5"><Palette className="h-3.5 w-3.5" /> Couleurs detectees</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {d.colors.length > 0 ? d.colors.map((c, i) => (
                <Badge key={i} variant="outline" className="text-[10px]">{c}</Badge>
              )) : <span className="text-[11px] text-muted-foreground">Aucune couleur detectee</span>}
            </div>
          </CardContent>
        </Card>

        {/* Materials */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1.5"><Box className="h-3.5 w-3.5" /> Materiaux</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {d.materials.length > 0 ? d.materials.map((m, i) => (
                <Badge key={i} variant="outline" className="text-[10px]">{m}</Badge>
              )) : <span className="text-[11px] text-muted-foreground">Non determines</span>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Variants */}
      {d.variants.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> Variantes detectees ({d.variants.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {d.variants.map((v, i) => (
                <div key={i} className={`flex items-center justify-between text-[11px] p-1.5 rounded ${v.note ? "bg-amber-50 border border-amber-200" : "bg-muted/30"}`}>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[9px] uppercase">{v.type}</Badge>
                    {v.hex && <span className="w-3 h-3 rounded-full border inline-block" style={{ backgroundColor: v.hex }} />}
                    <span>{v.value}</span>
                    {v.note && <span className="text-amber-600 text-[9px]">{v.note}</span>}
                  </div>
                  <span className={`text-[9px] ${v.confidence >= 70 ? "text-emerald-600" : v.confidence >= 40 ? "text-amber-600" : "text-destructive"}`}>
                    {v.confidence}%
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tags & Features */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" /> Tags</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {d.tags.length > 0 ? d.tags.map((t, i) => (
                <Badge key={i} variant="secondary" className="text-[10px]">{t}</Badge>
              )) : <span className="text-[11px] text-muted-foreground">—</span>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1.5"><Ruler className="h-3.5 w-3.5" /> Caracteristiques</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-0.5">
              {d.features.length > 0 ? d.features.map((f, i) => (
                <li key={i} className="text-[11px] text-muted-foreground">• {f}</li>
              )) : <li className="text-[11px] text-muted-foreground">—</li>}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex gap-2 sticky bottom-4 bg-background/80 backdrop-blur p-2 rounded-lg border">
        <Button variant="outline" onClick={onRetry} className="gap-1">
          <X className="h-4 w-4" /> Annuler
        </Button>
        <Button onClick={() => onSave(editing)} className="flex-1 gap-2" size="lg">
          <Save className="h-4 w-4" /> Sauvegarder le brouillon
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
//  DRAFT CARD (for listing)
// ═══════════════════════════════════════════════════
function DraftCard({
  draft,
  onPublish,
  onDiscard,
  onUpdate,
}: {
  draft: DraftProduct;
  onPublish: () => void;
  onDiscard: () => void;
  onUpdate: (p: Partial<DraftProduct>) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className={draft.uncertainties.length > 0 ? "border-amber-300" : ""}>
      <CardContent className="p-3">
        <div className="flex gap-3">
          <div className="h-14 w-14 shrink-0 rounded bg-muted overflow-hidden">
            {draft.images[0] ? (
              <img src={draft.images[0]} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <ImageIcon className="m-auto mt-3 h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 flex-wrap">
              <p className="text-sm font-medium truncate">{draft.name}</p>
              <Badge variant={draft.confidence >= 70 ? "default" : draft.confidence >= 40 ? "secondary" : "destructive"} className="text-[10px]">
                {draft.confidence}%
              </Badge>
              {draft.uncertainties.length > 0 && (
                <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                  <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> A verifier
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              {draft.detectedBrand ? `Marque: ${draft.detectedBrand} | ` : ""}
              {draft.categoryName || "Sans categorie"} | {fmtFcfa(draft.price)}
            </p>
            <div className="flex flex-wrap gap-1 mt-1">
              <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => setExpanded(!expanded)}>
                {expanded ? "Moins" : "Details"}
              </Button>
              <Button size="sm" className="h-6 text-[10px] px-2" onClick={onPublish}>
                <CheckCircle2 className="h-3 w-3 mr-1" /> Publier
              </Button>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-destructive" onClick={onDiscard}>
                <XCircle className="h-3 w-3 mr-1" /> Suppr
              </Button>
            </div>
          </div>
        </div>

        {expanded && (
          <div className="mt-2 border-t pt-2 space-y-2">
            {draft.description && <p className="text-[11px] text-muted-foreground">{draft.description}</p>}

            {draft.uncertainties.length > 0 && (
              <div className="rounded bg-amber-50 border border-amber-200 p-2">
                <p className="text-[10px] font-semibold text-amber-700 mb-1">Incertitudes :</p>
                {draft.uncertainties.map((u, i) => (
                  <p key={i} className="text-[10px] text-amber-800">• {u}</p>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-[10px]">
              {draft.colors.length > 0 && <div><strong>Couleurs:</strong> {draft.colors.join(", ")}</div>}
              {draft.materials.length > 0 && <div><strong>Materiaux:</strong> {draft.materials.join(", ")}</div>}
              {draft.detectedBrand && <div><strong>Marque:</strong> {draft.detectedBrand}</div>}
              {draft.categoryName && <div><strong>Categorie:</strong> {draft.categoryName} ({draft.categoryConfidence}%)</div>}
            </div>

            {draft.variants.length > 0 && (
              <div className="text-[10px]">
                <strong>Variantes:</strong>{" "}
                {draft.variants.map(v => `${v.type}:${v.value}${v.note ? `(${v.note})` : ""}`).join(", ")}
              </div>
            )}

            <div className="flex flex-wrap gap-1">
              {draft.sourceMedia.slice(0, 6).map((url, i) => (
                <img key={i} src={url} alt="" className="h-10 w-10 rounded object-cover border" />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
