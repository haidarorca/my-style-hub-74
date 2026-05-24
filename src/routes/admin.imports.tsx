/**
 * admin.imports.tsx
 * -----------------
 * Import produits : Excel/CSV + IA Visuelle (images/videos/captures)
 *
 * CATEGORIES: uniquement existantes, scoring intelligent, jamais de creation auto.
 * PUBLICATION: identique au formulaire admin (Nouveau produit boutique).
 */

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Package, Trash2, CheckCircle2, XCircle, ImageIcon, Loader2,
  AlertTriangle, Save, FileSpreadsheet, Download, Table2,
  Sparkles, Upload, Film, X, Info, Wand2, Store,
  ChevronRight, CircleCheck, CircleDashed, CircleX, Pencil,
} from "lucide-react";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  exportProducts, downloadTemplate, previewImport, commitImport,
} from "@/lib/import-export.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  uploadImportMedia, extractVideoFrames, analyzeVisualMedia,
  publishVisualProduct, listAdminShops,
  type VisualProductDraft,
} from "@/lib/visual-ai-import.service";

export const Route = createFileRoute("/admin/imports")({
  component: () => (
    <PermissionGate perm="products">
      <AdminImports />
    </PermissionGate>
  ),
});

const fmtFcfa = (n: number | null) => n === null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} FCFA`;

// ── Category picker types (same as admin product form) ──
type Pick = string;
const isReq = (v: Pick) => v.startsWith("req:");
const idOf = (v: Pick) => v.slice(4);

interface CatRow {
  id: string; name: string; level: number;
  parent_id: string | null; name_i18n: unknown;
}

// ═══════════════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════════════
export default function AdminImports() {
  const [mainTab, setMainTab] = useState<"excel" | "visual" | "drafts">("visual");

  // Excel
  const fnExport = useServerFn(exportProducts);
  const fnTemplate = useServerFn(downloadTemplate);
  const fnPreview = useServerFn(previewImport);
  const fnCommit = useServerFn(commitImport);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Drafts storage
  const [drafts, setDrafts] = useState<VisualProductDraft[]>(() => {
    try { const r = localStorage.getItem("kawzone_visual_drafts"); return r ? JSON.parse(r) : []; } catch { return []; }
  });
  useEffect(() => { localStorage.setItem("kawzone_visual_drafts", JSON.stringify(drafts)); }, [drafts]);

  const activeDrafts = drafts.filter(d => d.status === "draft");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Package className="h-5 w-5" /> Importation
        </h1>
        <p className="text-xs text-muted-foreground">Excel/CSV ou IA Visuelle</p>
      </div>

      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as "excel" | "visual" | "drafts")}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="excel"><FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Excel/CSV</TabsTrigger>
          <TabsTrigger value="visual"><Sparkles className="h-3.5 w-3.5 mr-1" /> IA Visuelle</TabsTrigger>
          <TabsTrigger value="drafts">
            <Package className="h-3.5 w-3.5 mr-1" /> Brouillons
            {activeDrafts.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px]">{activeDrafts.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* Excel */}
        <TabsContent value="excel" className="space-y-4 pt-3">
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /> Excel / CSV</CardTitle></CardHeader>
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
          <VisualImporter
            onDraftCreated={(d) => { setDrafts(prev => [d, ...prev]); setMainTab("drafts"); }}
          />
        </TabsContent>

        {/* Drafts */}
        <TabsContent value="drafts" className="space-y-4 pt-3">
          {activeDrafts.length === 0 ? (
            <div className="rounded-xl border border-dashed p-10 text-center">
              <Package className="mx-auto h-10 w-10 text-muted-foreground opacity-60" />
              <p className="text-sm font-semibold">Aucun brouillon</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setMainTab("visual")}>
                <Sparkles className="h-3.5 w-3.5 mr-1" /> Importer avec l&apos;IA
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {activeDrafts.map(d => (
                <DraftCard key={d.id} draft={d}
                  onUpdate={(patch) => setDrafts(prev => prev.map(x => x.id === d.id ? { ...x, ...patch } : x))}
                  onRemove={() => setDrafts(prev => prev.filter(x => x.id !== d.id))}
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
//  VISUAL IMPORTER
// ═══════════════════════════════════════════════════
function VisualImporter({ onDraftCreated }: { onDraftCreated: (d: VisualProductDraft) => void }) {
  const [files, setFiles] = useState<{ file: File; preview: string; type: "image" | "video" }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [logs, setLogs] = useState<{ msg: string; type: string }[]>([]);
  const [result, setResult] = useState<VisualProductDraft | null>(null);
  const [step, setStep] = useState<"upload" | "analyzing" | "preview">("upload");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fnUpload = useServerFn(uploadImportMedia);
  const fnExtractFrames = useServerFn(extractVideoFrames);
  const fnAnalyze = useServerFn(analyzeVisualMedia);

  const addLog = (msg: string, type = "info") => setLogs(p => [...p, { msg, type }]);

  const handleFiles = (newFiles: File[]) => {
    const accepted = newFiles.filter(f => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (accepted.length === 0) { toast.error("Images et videos uniquement"); return; }
    if (files.length + accepted.length > 20) { toast.error("Maximum 20 fichiers"); return; }
    const items = accepted.map(f => ({ file: f, preview: URL.createObjectURL(f), type: f.type.startsWith("video/") ? "video" as const : "image" as const }));
    setFiles(p => [...p, ...items]);
  };

  const removeFile = (i: number) => setFiles(p => { const n = [...p]; URL.revokeObjectURL(n[i].preview); n.splice(i, 1); return n; });

  const handleAnalyze = async () => {
    if (files.length === 0) { toast.error("Ajoutez des medias"); return; }
    setIsAnalyzing(true); setStep("analyzing"); setLogs([]); setResult(null);
    addLog("Analyse visuelle demarree...", "info");

    try {
      // Upload all
      addLog("Upload medias...", "info");
      const imageUrls: string[] = [];
      const videoFrameUrls: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        try {
          const b64 = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve((r.result as string).split(",")[1] ?? ""); r.onerror = reject; r.readAsDataURL(f.file); });
          const res = await fnUpload({ data: { fileBase64: b64, fileName: f.file.name, mimeType: f.file.type }}) as any;
          if (f.type === "image") imageUrls.push(res.url);
          else {
            const frames = await fnExtractFrames({ data: { videoUrl: res.url, maxFrames: 8 }}) as any;
            videoFrameUrls.push(...(frames.frameUrls || []));
            addLog(`${frames.frameCount || 0} frames extraites`, "ok");
          }
        } catch (e: any) { addLog(`Erreur ${f.file.name}: ${e.message}`, "err"); }
      }

      if (imageUrls.length === 0 && videoFrameUrls.length === 0) throw new Error("Aucun media uploadable");

      // Analyze
      addLog("Analyse IA vision...", "info");
      const analysis = await fnAnalyze({ data: { imageUrls, videoFrameUrls }}) as any;
      if (analysis.logs) analysis.logs.forEach((l: string) => addLog(l, l.includes("✓") ? "ok" : l.includes("✗") ? "err" : "info"));

      if (!analysis.success || !analysis.draft) throw new Error(analysis.errors?.[0] || "Analyse echouee");

      setResult(analysis.draft);
      setStep("preview");
      toast.success(`Analyse OK ! Confiance: ${analysis.draft.confidence}%`);
    } catch (e: any) {
      addLog(`Erreur: ${e.message}`, "err");
      toast.error(e.message);
      setStep("upload");
    }
    setIsAnalyzing(false);
  };

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const onDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); handleFiles(Array.from(e.dataTransfer.files)); }, []);

  if (step === "preview" && result) {
    return (
      <VisualPreview
        draft={result}
        onSave={(edited) => {
          onDraftCreated({ ...result, ...edited, status: "draft" });
          setFiles([]); setResult(null); setStep("upload"); setLogs([]);
        }}
        onRetry={() => { setStep("upload"); setResult(null); setLogs([]); }}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-primary" /> Import IA Visuel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800 space-y-1">
          <span className="font-medium">Uploadez images, videos ou captures. L&apos;IA analysera visuellement et creera un brouillon.</span>
          <ul className="list-disc list-inside ml-3 space-y-0.5">
            <li>Photos produit (face, dos, details)</li>
            <li>Videos courtes (max 60s, frames auto-extraites)</li>
            <li>Captures d&apos;ecran Taobao/1688</li>
          </ul>
        </div>

        {/* Drop zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:border-muted-foreground/40"}`}
        >
          <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => handleFiles(Array.from(e.target.files || []))} />
          <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm font-medium">Glissez-deposez ou cliquez</p>
          <p className="text-[10px] text-muted-foreground">PNG, JPG, WEBP, MP4, MOV — Max 20</p>
        </div>

        {/* File previews */}
        {files.length > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">{files.length} fichier(s)</span>
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => { files.forEach(f => URL.revokeObjectURL(f.preview)); setFiles([]); }}>
                <Trash2 className="h-3 w-3 mr-1" /> Tout supprimer
              </Button>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {files.map((f, i) => (
                <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border bg-muted">
                  {f.type === "video" ? <video src={f.preview} className="w-full h-full object-cover" muted /> : <img src={f.preview} alt="" className="w-full h-full object-cover" />}
                  {f.type === "video" && <div className="absolute top-1 left-1 bg-black/70 text-white text-[9px] px-1 rounded"><Film className="h-2.5 w-2.5 inline" /> Video</div>}
                  <button onClick={(e) => { e.stopPropagation(); removeFile(i); }} className="absolute top-1 right-1 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100"><X className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button onClick={handleAnalyze} disabled={files.length === 0 || isAnalyzing} className="w-full gap-2" size="lg">
          {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {isAnalyzing ? "Analyse en cours..." : "Analyser avec l'IA"}
        </Button>

        {/* Logs */}
        {logs.length > 0 && (
          <div className="rounded-lg border bg-muted/30 p-3 max-h-[200px] overflow-y-auto space-y-1">
            {logs.map((l, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px]">
                {l.type === "ok" && <CircleCheck className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />}
                {l.type === "err" && <CircleX className="h-3 w-3 text-destructive shrink-0 mt-0.5" />}
                {l.type === "info" && <CircleDashed className="h-3 w-3 text-blue-500 shrink-0 mt-0.5" />}
                <span className={l.type === "err" ? "text-destructive" : ""}>{l.msg}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════
//  VISUAL PREVIEW + PUBLISH
// ═══════════════════════════════════════════════════
function VisualPreview({ draft, onSave, onRetry }: {
  draft: VisualProductDraft;
  onSave: (patch: Partial<VisualProductDraft>) => void;
  onRetry: () => void;
}) {
  const [editing, setEditing] = useState<Partial<VisualProductDraft>>({});
  const [publishing, setPublishing] = useState(false);

  // Load shops for target selection
  const { data: shops } = useQuery({
    queryKey: ["admin-shops-for-import"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, shop_name, full_name, is_admin_shop").or("role.eq.vendor,role.eq.admin").order("shop_name");
      return (data || []).map((s: any) => ({ id: s.id, name: s.shop_name || s.full_name || "Sans nom", isAdminShop: s.is_admin_shop }));
    },
  });

  // Load categories for picker
  const { data: cats } = useQuery({
    queryKey: ["import-cats"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, name, level, parent_id, name_i18n").order("position");
      return (data || []) as CatRow[];
    },
  });

  // Category picks (3 levels)
  const hasMatch = !!draft.categoryMatch;
  const initialL1 = hasMatch ? `cat:${draft.categoryMatch!.l1Id}` : "";
  const initialL2 = hasMatch ? `cat:${draft.categoryMatch!.l2Id}` : "";
  const initialL3 = hasMatch ? `cat:${draft.categoryMatch!.l3Id}` : "";

  const [pick1, setPick1] = useState<string>(initialL1);
  const [pick2, setPick2] = useState<string>(initialL2);
  const [pick3, setPick3] = useState<string>(initialL3);
  const [targetShopId, setTargetShopId] = useState<string>("");

  const d = { ...draft, ...editing };

  // Build options per level
  function optionsFor(level: 1 | 2 | 3): { value: string; label: string }[] {
    const approved = (cats || []).filter(c => c.level === level);
    if (level === 1) return approved.map(c => ({ value: `cat:${c.id}`, label: c.name }));
    const parent = level === 2 ? pick1 : pick2;
    if (!parent) return [];
    const parentId = idOf(parent);
    return approved.filter(c => c.parent_id === parentId).map(c => ({ value: `cat:${c.id}`, label: c.name }));
  }
  const opts1 = useMemo(() => optionsFor(1), [cats]);
  const opts2 = useMemo(() => optionsFor(2), [pick1]);
  const opts3 = useMemo(() => optionsFor(3), [pick2]);
  const deepestPick = pick3 || pick2 || pick1 || "";

  // Get final L3 name
  const l3Name = pick3 && cats ? cats.find(c => c.id === idOf(pick3))?.name : "";
  const l2Name = pick2 && cats ? cats.find(c => c.id === idOf(pick2))?.name : "";
  const l1Name = pick1 && cats ? cats.find(c => c.id === idOf(pick1))?.name : "";

  const fnPublish = useServerFn(publishVisualProduct);

  const handlePublish = async () => {
    if (!targetShopId) { toast.error("Choisissez une boutique cible"); return; }
    if (!deepestPick) { toast.error("Choisissez une categorie"); return; }
    if (!d.name?.trim()) { toast.error("Le nom est obligatoire"); return; }
    if (!d.price || d.price <= 0) { toast.error("Le prix est obligatoire"); return; }

    setPublishing(true);
    try {
      const result = await fnPublish({ data: {
        shopId: targetShopId,
        draft: {
          name: (editing.name ?? draft.name).trim(),
          designation: (editing.designation ?? draft.designation)?.trim(),
          description: (editing.description ?? draft.description)?.trim(),
          price: (editing.price ?? draft.price) || 0,
          categoryId: isReq(deepestPick) ? null : idOf(deepestPick),
          images: draft.gallery,
          variants: draft.variants,
        },
      }}) as any;

      toast.success(`Produit publie ! Code: ${result.code}`);
      onSave({ status: "draft" }); // Will remove from drafts
    } catch (e: any) {
      toast.error(e.message || "Publication echouee");
    }
    setPublishing(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className={d.confidence < 50 ? "border-amber-400" : d.uncertainties.length > 0 ? "border-amber-300" : "border-emerald-300"}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {d.confidence >= 70 ? <CircleCheck className="h-5 w-5 text-emerald-500" /> : d.confidence >= 40 ? <AlertTriangle className="h-5 w-5 text-amber-500" /> : <CircleX className="h-5 w-5 text-destructive" />}
              <div>
                <h3 className="text-sm font-semibold">Resultat IA Visuelle</h3>
                <p className="text-xs text-muted-foreground">Verifiez avant de publier</p>
              </div>
            </div>
            <Badge variant={d.confidence >= 70 ? "default" : d.confidence >= 40 ? "secondary" : "destructive"}>
              Confiance: {d.confidence}%
            </Badge>
          </div>
          {d.uncertainties.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-2.5 space-y-1">
              <p className="text-[10px] font-semibold uppercase text-amber-700"><AlertTriangle className="h-3 w-3 inline mr-0.5" /> Incertitudes ({d.uncertainties.length})</p>
              {d.uncertainties.map((u, i) => <p key={i} className="text-[11px] text-amber-800">• {u}</p>)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Media */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-xs">Medias analyses</CardTitle></CardHeader>
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

      {/* Product Details (editable) */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><Pencil className="h-3.5 w-3.5" /> Details produit</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Nom <span className="text-destructive">*</span></Label>
            <Input value={d.name} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Designation</Label>
            <Input value={d.designation} onChange={e => setEditing(p => ({ ...p, designation: e.target.value }))} />
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Prix (FCFA) <span className="text-destructive">*</span></Label>
            <div className="flex gap-2">
              <Input type="number" min={0} value={d.price ?? ""} placeholder={d.priceNote}
                onChange={e => setEditing(p => ({ ...p, price: e.target.value ? Number(e.target.value) : null }))}
                className={d.price === null ? "border-amber-300 bg-amber-50/30" : ""} />
            </div>
            {d.price === null && <p className="text-[10px] text-amber-600 mt-0.5"><AlertTriangle className="h-2.5 w-2.5 inline" /> {d.priceNote}</p>}
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Description</Label>
            <Textarea value={d.description} onChange={e => setEditing(p => ({ ...p, description: e.target.value }))} rows={3} />
          </div>
          {d.detectedBrand && (
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Marque detectee</Label>
              <Input value={d.detectedBrand} readOnly className="bg-muted" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category Selector (3 levels, identical to admin product form) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5" /> Categorie
            {draft.categoryMatch && (
              <Badge variant="outline" className="text-[10px] ml-2">
                IA: {draft.categoryMatch.l3Name} ({draft.categoryMatch.score}%)
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!draft.categoryMatch && (
            <div className="rounded bg-amber-50 border border-amber-200 p-2 text-[11px] text-amber-800">
              <AlertTriangle className="h-3 w-3 inline mr-1" />
              Aucune categorie suffisamment proche trouvee. Selectionnez manuellement ci-dessous.
            </div>
          )}
          {draft.categoryMatch && draft.categoryMatch.score < 50 && (
            <div className="rounded bg-amber-50 border border-amber-200 p-2 text-[11px] text-amber-800">
              <AlertTriangle className="h-3 w-3 inline mr-1" />
              Match faible ({draft.categoryMatch.score}%). Verifiez la categorie suggeree.
            </div>
          )}

          <div className="space-y-2">
            {/* Level 1 */}
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Rayon (L1)</Label>
              <Select value={pick1} onValueChange={(v) => { setPick1(v); setPick2(""); setPick3(""); }}>
                <SelectTrigger className="mt-0.5"><SelectValue placeholder="Choisir un rayon..." /></SelectTrigger>
                <SelectContent>{opts1.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {/* Level 2 */}
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Categorie (L2)</Label>
              <Select value={pick2} onValueChange={(v) => { setPick2(v); setPick3(""); }} disabled={!pick1}>
                <SelectTrigger className={!pick1 ? "opacity-50" : ""}><SelectValue placeholder={pick1 ? "Choisir..." : "D'abord le rayon"} /></SelectTrigger>
                <SelectContent>{opts2.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {/* Level 3 */}
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Sous-categorie (L3)</Label>
              <Select value={pick3} onValueChange={setPick3} disabled={!pick2}>
                <SelectTrigger className={!pick2 ? "opacity-50" : ""}><SelectValue placeholder={pick2 ? "Choisir..." : "D'abord la categorie"} /></SelectTrigger>
                <SelectContent>{opts3.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {deepestPick && (
              <div className="text-[11px] text-muted-foreground mt-1">
                Selection: {l1Name && <span className="font-medium text-foreground">{l1Name}</span>}
                {l2Name && <span> <ChevronRight className="h-3 w-3 inline text-muted-foreground" /> <span className="font-medium text-foreground">{l2Name}</span></span>}
                {l3Name && <span> <ChevronRight className="h-3 w-3 inline text-muted-foreground" /> <span className="font-medium text-foreground">{l3Name}</span></span>}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Target Shop */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><Store className="h-3.5 w-3.5" /> Boutique cible</CardTitle></CardHeader>
        <CardContent>
          <Select value={targetShopId} onValueChange={setTargetShopId}>
            <SelectTrigger><SelectValue placeholder="Choisir la boutique..." /></SelectTrigger>
            <SelectContent>
              {(shops || []).map(s => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} {s.isAdminShop && "(Admin)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!targetShopId && <p className="text-[10px] text-amber-600 mt-1"><AlertTriangle className="h-2.5 w-2.5 inline" /> Obligatoire pour la publication</p>}
        </CardContent>
      </Card>

      {/* Variants */}
      {d.variants.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs">Variantes detectees ({d.variants.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {d.variants.map((v, i) => (
                <div key={i} className="flex items-center justify-between text-[11px] p-1.5 rounded bg-muted/30">
                  <div className="flex items-center gap-2">
                    {v.color_hex && <span className="w-3 h-3 rounded-full border inline-block" style={{ backgroundColor: v.color_hex }} />}
                    <span>{v.color || v.size || "Variante"}</span>
                    {v.size && v.color && <span className="text-muted-foreground">({v.size})</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tags & Features */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs">Couleurs / Materiaux</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {d.colors.map((c, i) => <Badge key={i} variant="outline" className="text-[10px]">{c}</Badge>)}
              {d.materials.map((m, i) => <Badge key={`m-${i}`} variant="secondary" className="text-[10px]">{m}</Badge>)}
              {d.colors.length === 0 && d.materials.length === 0 && <span className="text-[11px] text-muted-foreground">—</span>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs">Tags</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {d.tags.map((t, i) => <Badge key={i} variant="secondary" className="text-[10px]">{t}</Badge>)}
              {d.tags.length === 0 && <span className="text-[11px] text-muted-foreground">—</span>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex gap-2 sticky bottom-4 bg-background/80 backdrop-blur p-2 rounded-lg border">
        <Button variant="outline" onClick={onRetry} className="gap-1"><X className="h-4 w-4" /> Annuler</Button>
        <Button
          onClick={handlePublish}
          disabled={publishing || !targetShopId || !deepestPick}
          className="flex-1 gap-2"
          size="lg"
        >
          {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {publishing ? "Publication..." : "Publier le produit"}
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
//  DRAFT CARD
// ═══════════════════════════════════════════════════
function DraftCard({ draft, onUpdate, onRemove }: {
  draft: VisualProductDraft;
  onUpdate: (p: Partial<VisualProductDraft>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [localPrice, setLocalPrice] = useState<string>(draft.price !== null ? String(draft.price) : "");

  return (
    <Card className={draft.uncertainties.length > 0 ? "border-amber-300" : ""}>
      <CardContent className="p-3">
        <div className="flex gap-3">
          <div className="h-14 w-14 shrink-0 rounded bg-muted overflow-hidden">
            {draft.images[0] ? <img src={draft.images[0]} alt="" className="h-full w-full object-cover" loading="lazy" />
              : <ImageIcon className="m-auto mt-3 h-5 w-5 text-muted-foreground" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 flex-wrap">
              <p className="text-sm font-medium truncate">{draft.name}</p>
              <Badge variant={draft.confidence >= 70 ? "default" : draft.confidence >= 40 ? "secondary" : "destructive"} className="text-[10px]">{draft.confidence}%</Badge>
              {draft.uncertainties.length > 0 && <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200"><AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> A verifier</Badge>}
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              {draft.categoryName || "Sans categorie"} | {fmtFcfa(draft.price)}
            </p>
            <div className="flex flex-wrap gap-1 mt-1">
              <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => setExpanded(!expanded)}>{expanded ? "Moins" : "Details"}</Button>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-destructive" onClick={onRemove}><XCircle className="h-3 w-3 mr-1" /> Suppr</Button>
            </div>
          </div>
        </div>

        {expanded && (
          <div className="mt-2 border-t pt-2 space-y-2">
            {draft.description && <p className="text-[11px] text-muted-foreground">{draft.description}</p>}

            {/* Quick price fix */}
            <div className="flex gap-2 items-center">
              <Label className="text-[10px] uppercase text-muted-foreground whitespace-nowrap">Prix (FCFA):</Label>
              <Input type="number" min={0} className="h-7 text-[11px]" value={localPrice}
                onChange={e => { setLocalPrice(e.target.value); onUpdate({ price: e.target.value ? Number(e.target.value) : null }); }} />
            </div>

            {draft.uncertainties.length > 0 && (
              <div className="rounded bg-amber-50 border border-amber-200 p-2">
                <p className="text-[10px] font-semibold text-amber-700 mb-1">Incertitudes:</p>
                {draft.uncertainties.map((u, i) => <p key={i} className="text-[10px] text-amber-800">• {u}</p>)}
              </div>
            )}

            {draft.categoryMatch && (
              <div className="text-[10px] text-muted-foreground">
                <span className="font-medium">Categorie IA:</span> {draft.categoryMatch.l1Name} &gt; {draft.categoryMatch.l2Name} &gt; {draft.categoryMatch.l3Name}
                <span className="text-foreground"> ({draft.categoryMatch.score}% — {draft.categoryMatch.reason})</span>
              </div>
            )}

            <div className="flex flex-wrap gap-1">
              {draft.sourceMedia.slice(0, 6).map((url, i) => <img key={i} src={url} alt="" className="h-10 w-10 rounded object-cover border" />)}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
