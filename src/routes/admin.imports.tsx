/**
 * admin.imports.tsx
 * -----------------
 * Import : Excel/CSV + IA Visuelle (images/videos/captures)
 *
 * Workflow:
 *   1. Upload images/videos
 *   2. IA analyse visuellement
 *   3. Brouillon cree → EDITEUR COMPLET s'ouvre
 *   4. Admin verifie/modifie TOUT (variantes, categories, prix)
 *   5. Publication → boutique admin automatique
 */

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Package, Trash2, CheckCircle2, XCircle, ImageIcon, Loader2,
  AlertTriangle, Save, FileSpreadsheet, Download, Table2,
  Sparkles, Upload, Film, X, Wand2, ChevronRight,
  CircleCheck, CircleDashed, CircleX, Pencil, Plus, Minus,
  Palette, Ruler,
} from "lucide-react";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  exportProducts, downloadTemplate, previewImport, commitImport,
} from "@/lib/import-export.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  uploadImportMedia, extractVideoFrames, analyzeVisualMedia,
  publishDraft, type VisualDraft,
} from "@/lib/visual-ai-import.service";

export const Route = createFileRoute("/admin/imports")({
  component: () => (
    <PermissionGate perm="products"><AdminImports /></PermissionGate>
  ),
});

const fmtFcfa = (n: number | null) => n === null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} FCFA`;

interface DraftVariant {
  size: string; color: string; color_hex: string;
  stock: number; price_override: number | null;
}

interface FullDraft extends VisualDraft {
  variants: DraftVariant[];
}

type Pick = string;
const isReq = (v: Pick) => v.startsWith("req:");
const idOf = (v: Pick) => v.slice(4);

interface CatRow { id: string; name: string; level: number; parent_id: string | null; }

const LS_KEY = "kawzone_visual_drafts_v2";
function loadDrafts(): FullDraft[] { try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : []; } catch { return []; } }
function saveDrafts(drafts: FullDraft[]) { localStorage.setItem(LS_KEY, JSON.stringify(drafts)); }

// ═══════════════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════════════
export default function AdminImports() {
  const [mainTab, setMainTab] = useState<"excel" | "visual" | "drafts">("visual");
  const [drafts, setDrafts] = useState<FullDraft[]>(loadDrafts);
  useEffect(() => { saveDrafts(drafts); }, [drafts]);

  // Editor state
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const editingDraft = useMemo(() => drafts.find(d => d.id === editingDraftId) || null, [drafts, editingDraftId]);

  // Excel
  const fnExport = useServerFn(exportProducts);
  const fnTemplate = useServerFn(downloadTemplate);
  const fnPreview = useServerFn(previewImport);
  const fnCommit = useServerFn(commitImport);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const activeDrafts = drafts.filter(d => d.status === "draft");

  const handleDraftCreated = (d: VisualDraft) => {
    const full: FullDraft = { ...d, variants: d.variants };
    setDrafts(prev => [full, ...prev]);
    setEditingDraftId(full.id);
    setMainTab("drafts");
  };

  const handleDraftUpdate = (id: string, patch: Partial<FullDraft>) => {
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));
  };

  const handlePublishSuccess = (id: string) => {
    setDrafts(prev => prev.filter(d => d.id !== id));
    setEditingDraftId(null);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold"><Package className="h-5 w-5" /> Importation</h1>
        <p className="text-xs text-muted-foreground">Excel/CSV ou IA Visuelle</p>
      </div>

      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as "excel" | "visual" | "drafts")}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="excel"><FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Excel/CSV</TabsTrigger>
          <TabsTrigger value="visual"><Sparkles className="h-3.5 w-3.5 mr-1" /> IA Visuelle</TabsTrigger>
          <TabsTrigger value="drafts"><Package className="h-3.5 w-3.5 mr-1" /> Brouillons {activeDrafts.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px]">{activeDrafts.length}</Badge>}</TabsTrigger>
        </TabsList>

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

        <TabsContent value="visual" className="space-y-4 pt-3">
          <VisualImporter onDraftCreated={handleDraftCreated} />
        </TabsContent>

        <TabsContent value="drafts" className="space-y-4 pt-3">
          {activeDrafts.length === 0 ? (
            <div className="rounded-xl border border-dashed p-10 text-center">
              <Package className="mx-auto h-10 w-10 text-muted-foreground opacity-60" />
              <p className="text-sm font-semibold">Aucun brouillon</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setMainTab("visual")}>
                <Sparkles className="h-3.5 w-3.5 mr-1" /> Importer
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activeDrafts.map(d => (
                <DraftCard key={d.id} draft={d}
                  onEdit={() => setEditingDraftId(d.id)}
                  onRemove={() => setDrafts(prev => prev.filter(x => x.id !== d.id))}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* FULL EDITOR DIALOG */}
      {editingDraft && (
        <DraftEditorDialog
          draft={editingDraft}
          onClose={() => setEditingDraftId(null)}
          onUpdate={(patch) => handleDraftUpdate(editingDraft.id, patch)}
          onPublish={() => handlePublishSuccess(editingDraft.id)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
//  VISUAL IMPORTER (Step 1: Upload)
// ═══════════════════════════════════════════════════
function VisualImporter({ onDraftCreated }: { onDraftCreated: (d: VisualDraft) => void }) {
  const [files, setFiles] = useState<{ file: File; preview: string; type: "image" | "video" }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [logs, setLogs] = useState<{ msg: string; type: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fnUpload = useServerFn(uploadImportMedia);
  const fnExtractFrames = useServerFn(extractVideoFrames);
  const fnAnalyze = useServerFn(analyzeVisualMedia);

  const addLog = (msg: string, type = "info") => setLogs(p => [...p, { msg, type }]);

  const handleFiles = (newFiles: File[]) => {
    const accepted = newFiles.filter(f => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (accepted.length === 0) { toast.error("Images et videos uniquement"); return; }
    if (files.length + accepted.length > 20) { toast.error("Max 20 fichiers"); return; }
    const items = accepted.map(f => ({ file: f, preview: URL.createObjectURL(f), type: f.type.startsWith("video/") ? "video" as const : "image" as const }));
    setFiles(p => [...p, ...items]);
  };

  const removeFile = (i: number) => setFiles(p => { const n = [...p]; URL.revokeObjectURL(n[i].preview); n.splice(i, 1); return n; });

  const handleAnalyze = async () => {
    if (files.length === 0) { toast.error("Ajoutez des medias"); return; }
    setIsAnalyzing(true); setLogs([]); addLog("Demarrage...", "info");

    try {
      const imageUrls: string[] = [];
      const videoFrameUrls: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        try {
          const b64 = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve((r.result as string).split(",")[1] ?? ""); r.onerror = reject; r.readAsDataURL(f.file); });
          const res = await fnUpload({ data: { fileBase64: b64, fileName: f.file.name, mimeType: f.file.type }}) as any;
          if (f.type === "image") imageUrls.push(res.url);
          else { const fr = await fnExtractFrames({ data: { videoUrl: res.url, maxFrames: 8 }}) as any; videoFrameUrls.push(...(fr.frameUrls || [])); addLog(`${fr.frameCount} frames`, "ok"); }
        } catch (e: any) { addLog(`${f.file.name}: ${e.message}`, "err"); }
      }

      if (imageUrls.length === 0 && videoFrameUrls.length === 0) throw new Error("Aucun media uploadable");

      addLog("Analyse IA...", "info");
      const analysis = await fnAnalyze({ data: { imageUrls, videoFrameUrls }}) as any;
      if (analysis.logs) analysis.logs.forEach((l: string) => addLog(l, l.includes("✓") ? "ok" : l.includes("✗") ? "err" : "info"));

      if (!analysis.success || !analysis.draft) throw new Error(analysis.errors?.[0] || "Echec");

      onDraftCreated(analysis.draft);
      toast.success(`Analyse OK ! ${analysis.draft.confidence}% confiance`);
      setFiles([]);
    } catch (e: any) {
      addLog(`Erreur: ${e.message}`, "err");
      toast.error(e.message);
    }
    setIsAnalyzing(false);
  };

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const onDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); handleFiles(Array.from(e.dataTransfer.files)); }, []);

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Wand2 className="h-4 w-4 text-primary" /> Import IA Visuel</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
          Uploadez images, videos ou captures. L&apos;IA analysera et creera un brouillon editable.
        </div>
        <div onClick={() => fileInputRef.current?.click()} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:border-muted-foreground/40"}`}>
          <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => handleFiles(Array.from(e.target.files || []))} />
          <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm font-medium">Glissez-deposez ou cliquez</p>
          <p className="text-[10px] text-muted-foreground">PNG, JPG, WEBP, MP4, MOV — Max 20</p>
        </div>
        {files.length > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">{files.length} fichier(s)</span>
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => { files.forEach(f => URL.revokeObjectURL(f.preview)); setFiles([]); }}><Trash2 className="h-3 w-3 mr-1" /> Tout suppr</Button>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {files.map((f, i) => (
                <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border bg-muted">
                  {f.type === "video" ? <video src={f.preview} className="w-full h-full object-cover" muted /> : <img src={f.preview} alt="" className="w-full h-full object-cover" />}
                  {f.type === "video" && <div className="absolute top-1 left-1 bg-black/70 text-white text-[9px] px-1 rounded"><Film className="h-2.5 w-2.5 inline" /> Vid</div>}
                  <button onClick={(e) => { e.stopPropagation(); removeFile(i); }} className="absolute top-1 right-1 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100"><X className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          </div>
        )}
        <Button onClick={handleAnalyze} disabled={files.length === 0 || isAnalyzing} className="w-full gap-2" size="lg">
          {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {isAnalyzing ? "Analyse..." : "Analyser avec l'IA"}
        </Button>
        {logs.length > 0 && (
          <div className="rounded-lg border bg-muted/30 p-3 max-h-[180px] overflow-y-auto space-y-1">
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
//  DRAFT CARD (List view)
// ═══════════════════════════════════════════════════
function DraftCard({ draft, onEdit, onRemove }: { draft: FullDraft; onEdit: () => void; onRemove: () => void }) {
  return (
    <Card className={`cursor-pointer hover:shadow-md transition-shadow ${draft.uncertainties.length > 0 ? "border-amber-300" : ""}`} onClick={onEdit}>
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
            <p className="text-[11px] text-muted-foreground truncate">{draft.categoryName || "Sans categorie"} | {fmtFcfa(draft.price)} | {draft.variants.length} variante(s)</p>
            <div className="flex gap-1 mt-1">
              <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                <Pencil className="h-3 w-3 mr-1" /> Modifier / Publier
              </Button>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-destructive" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
                <XCircle className="h-3 w-3 mr-1" /> Suppr
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════
//  DRAFT EDITOR DIALOG (FULL FORM)
// ═══════════════════════════════════════════════════
function DraftEditorDialog({ draft, onClose, onUpdate, onPublish }: {
  draft: FullDraft; onClose: () => void;
  onUpdate: (patch: Partial<FullDraft>) => void;
  onPublish: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  // Local editable state
  const [name, setName] = useState(draft.name);
  const [designation, setDesignation] = useState(draft.designation);
  const [description, setDescription] = useState(draft.description);
  const [price, setPrice] = useState<string>(draft.price !== null ? String(draft.price) : "");
  const [variants, setVariants] = useState<DraftVariant[]>(draft.variants.length > 0 ? draft.variants : []);
  const [images, setImages] = useState<string[]>(draft.gallery);

  // Categories
  const { data: cats } = useQuery<CatRow[]>({
    queryKey: ["import-cats"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, name, level, parent_id").order("position");
      return (data || []) as CatRow[];
    },
  });

  const hasMatch = !!draft.categoryMatch;
  const [pick1, setPick1] = useState<string>(hasMatch ? `cat:${draft.categoryMatch!.l1Id}` : "");
  const [pick2, setPick2] = useState<string>(hasMatch ? `cat:${draft.categoryMatch!.l2Id}` : "");
  const [pick3, setPick3] = useState<string>(hasMatch ? `cat:${draft.categoryMatch!.l3Id}` : (draft.categoryId || ""));

  // Category options
  const opts1 = useMemo(() => (cats || []).filter(c => c.level === 1).map(c => ({ value: `cat:${c.id}`, label: c.name })), [cats]);
  const opts2 = useMemo(() => { if (!pick1) return []; const pid = idOf(pick1); return (cats || []).filter(c => c.level === 2 && c.parent_id === pid).map(c => ({ value: `cat:${c.id}`, label: c.name })); }, [cats, pick1]);
  const opts3 = useMemo(() => { if (!pick2) return []; const pid = idOf(pick2); return (cats || []).filter(c => c.level === 3 && c.parent_id === pid).map(c => ({ value: `cat:${c.id}`, label: c.name })); }, [cats, pick2]);
  const deepestPick = pick3 || pick2 || pick1 || "";
  const finalL3 = pick3 && cats ? cats.find(c => c.id === (pick3.startsWith("cat:") ? pick3.slice(4) : pick3)) : null;

  // Variant management
  const addVariant = () => setVariants(v => [...v, { size: "", color: "", color_hex: "", stock: 0, price_override: null }]);
  const removeVariant = (i: number) => setVariants(v => v.filter((_, j) => j !== i));
  const updateVariant = (i: number, patch: Partial<DraftVariant>) => setVariants(v => v.map((x, j) => j === i ? { ...x, ...patch } : x));

  const fnPublish = useServerFn(publishDraft);

  const handlePublish = async () => {
    if (!name.trim()) { toast.error("Le nom est obligatoire"); return; }
    if (!price || Number(price) <= 0) { toast.error("Le prix est obligatoire"); return; }
    if (!deepestPick) { toast.error("Choisissez une categorie"); return; }

    setSubmitting(true);
    try {
      const result = await fnPublish({ data: {
        draft: {
          name: name.trim(),
          designation: designation.trim(),
          description: description.trim(),
          price: Number(price),
          categoryId: finalL3?.id || null,
          images,
          variants: variants.map(v => ({ ...v, price_override: v.price_override })),
        },
      }}) as any;

      toast.success(`Produit publie ! Code: ${result.code}`);
      onPublish();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Publication echouee");
    }
    setSubmitting(false);
  };

  const handleSaveDraft = () => {
    onUpdate({
      name, designation, description,
      price: price ? Number(price) : null,
      variants, categoryId: finalL3?.id || null,
      categoryName: finalL3 ? `${opts1.find(o => o.value === pick1)?.label || ""} > ${opts2.find(o => o.value === pick2)?.label || ""} > ${finalL3.name}` : null,
    });
    toast.success("Brouillon sauvegarde");
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[95vh] overflow-y-auto p-0">
        <DialogHeader className="p-4 pb-2 sticky top-0 bg-background z-10 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" /> Verifier et publier le produit
              <Badge variant={draft.confidence >= 70 ? "default" : draft.confidence >= 40 ? "secondary" : "destructive"} className="text-[10px]">{draft.confidence}%</Badge>
            </DialogTitle>
          </div>
          {draft.uncertainties.length > 0 && (
            <div className="mt-2 rounded bg-amber-50 border border-amber-200 p-2 space-y-0.5">
              {draft.uncertainties.map((u, i) => (
                <p key={i} className="text-[10px] text-amber-800">• {u}</p>
              ))}
            </div>
          )}
        </DialogHeader>

        <div className="p-4 space-y-5">
          {/* Media gallery */}
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Medias analyses</Label>
            <div className="grid grid-cols-6 gap-1 mt-1">
              {images.map((url, i) => (
                <div key={i} className="aspect-square rounded overflow-hidden border bg-muted">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>

          {/* Product info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label className="text-[10px] uppercase">Nom du produit <span className="text-destructive">*</span></Label>
              <Input value={name} onChange={e => setName(e.target.value)} className="mt-0.5" />
            </div>
            <div>
              <Label className="text-[10px] uppercase">Designation</Label>
              <Input value={designation} onChange={e => setDesignation(e.target.value)} className="mt-0.5" />
            </div>
            <div>
              <Label className="text-[10px] uppercase">Prix (FCFA) <span className="text-destructive">*</span></Label>
              <div className="flex gap-2 mt-0.5">
                <Input type="number" min={0} value={price} onChange={e => setPrice(e.target.value)}
                  className={!price ? "border-amber-300 bg-amber-50/30" : ""} placeholder={draft.priceNote} />
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-[10px] uppercase">Description</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="mt-0.5" />
            </div>
          </div>

          {/* Brand / Tags */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {draft.detectedBrand && (
              <div>
                <Label className="text-[10px] uppercase">Marque detectee</Label>
                <Input value={draft.detectedBrand} readOnly className="mt-0.5 bg-muted" />
              </div>
            )}
            <div>
              <Label className="text-[10px] uppercase">Tags IA</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {draft.tags.map((t, i) => <Badge key={i} variant="secondary" className="text-[10px]">{t}</Badge>)}
              </div>
            </div>
          </div>

          {/* Colors & Materials */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-[10px] uppercase flex items-center gap-1"><Palette className="h-3 w-3" /> Couleurs</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {draft.colors.map((c, i) => <Badge key={i} variant="outline" className="text-[10px]">{c}</Badge>)}
                {draft.colors.length === 0 && <span className="text-[11px] text-muted-foreground">Non detecte</span>}
              </div>
            </div>
            <div>
              <Label className="text-[10px] uppercase">Materiaux</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {draft.materials.map((m, i) => <Badge key={i} variant="outline" className="text-[10px]">{m}</Badge>)}
                {draft.materials.length === 0 && <span className="text-[11px] text-muted-foreground">Non detecte</span>}
              </div>
            </div>
          </div>

          <Separator />

          {/* Category selector (3 levels) */}
          <div>
            <Label className="text-[10px] uppercase font-semibold flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5" /> Categorie
              {draft.categoryMatch && (
                <Badge variant="outline" className="text-[10px] ml-2">
                  IA: {draft.categoryMatch.l3Name} ({draft.categoryMatch.score}%)
                </Badge>
              )}
            </Label>
            {!draft.categoryMatch && (
              <p className="text-[10px] text-amber-600 mt-0.5"><AlertTriangle className="h-2.5 w-2.5 inline" /> Aucune categorie proche. Selectionnez manuellement.</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1.5">
              <div>
                <Label className="text-[9px] text-muted-foreground">Rayon (L1)</Label>
                <Select value={pick1} onValueChange={v => { setPick1(v); setPick2(""); setPick3(""); }}>
                  <SelectTrigger className="mt-0.5"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                  <SelectContent>{opts1.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[9px] text-muted-foreground">Categorie (L2)</Label>
                <Select value={pick2} onValueChange={v => { setPick2(v); setPick3(""); }} disabled={!pick1}>
                  <SelectTrigger className={`mt-0.5 ${!pick1 ? "opacity-50" : ""}`}><SelectValue placeholder={pick1 ? "Choisir..." : "D'abord L1"} /></SelectTrigger>
                  <SelectContent>{opts2.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[9px] text-muted-foreground">Sous-cat (L3) <span className="text-destructive">*</span></Label>
                <Select value={pick3} onValueChange={setPick3} disabled={!pick2}>
                  <SelectTrigger className={`mt-0.5 ${!pick2 ? "opacity-50" : ""}`}><SelectValue placeholder={pick2 ? "Choisir..." : "D'abord L2"} /></SelectTrigger>
                  <SelectContent>{opts3.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator />

          {/* Variants manager (identical to admin form) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-[10px] uppercase font-semibold flex items-center gap-1"><Ruler className="h-3.5 w-3.5" /> Variantes ({variants.length})</Label>
              <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={addVariant}>
                <Plus className="h-3 w-3 mr-1" /> Ajouter
              </Button>
            </div>

            {variants.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center">
                <p className="text-[11px] text-muted-foreground">Aucune variante. Ajoutez si le produit a des options (taille, couleur).</p>
                <Button variant="outline" size="sm" className="mt-2 h-6 text-[10px]" onClick={addVariant}>
                  <Plus className="h-3 w-3 mr-1" /> Ajouter une variante
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {variants.map((v, i) => (
                  <Card key={i} className="border-muted">
                    <CardContent className="p-2.5">
                      <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 items-end">
                        <div className="col-span-1">
                          <Label className="text-[9px] text-muted-foreground">Taille</Label>
                          <Input value={v.size} onChange={e => updateVariant(i, { size: e.target.value })} className="h-7 text-[11px]" placeholder="M, L, XL" />
                        </div>
                        <div className="col-span-1">
                          <Label className="text-[9px] text-muted-foreground">Couleur</Label>
                          <Input value={v.color} onChange={e => updateVariant(i, { color: e.target.value })} className="h-7 text-[11px]" placeholder="Rouge" />
                        </div>
                        <div className="col-span-1">
                          <Label className="text-[9px] text-muted-foreground">Hex</Label>
                          <div className="flex gap-1">
                            <input type="color" value={v.color_hex || "#000000"} onChange={e => updateVariant(i, { color_hex: e.target.value })}
                              className="h-7 w-7 rounded border cursor-pointer" />
                            <Input value={v.color_hex} onChange={e => updateVariant(i, { color_hex: e.target.value })} className="h-7 text-[10px]" placeholder="#RRGGBB" />
                          </div>
                        </div>
                        <div className="col-span-1">
                          <Label className="text-[9px] text-muted-foreground">Stock</Label>
                          <Input type="number" min={0} value={v.stock} onChange={e => updateVariant(i, { stock: Number(e.target.value) })} className="h-7 text-[11px]" />
                        </div>
                        <div className="col-span-1">
                          <Label className="text-[9px] text-muted-foreground">Prix spec.</Label>
                          <Input type="number" min={0} value={v.price_override ?? ""} onChange={e => updateVariant(i, { price_override: e.target.value ? Number(e.target.value) : null })} className="h-7 text-[11px]" placeholder="Optionnel" />
                        </div>
                        <div className="col-span-1 flex justify-end">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => removeVariant(i)}>
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex gap-2 sticky bottom-0 bg-background pt-2 pb-1">
            <Button variant="outline" onClick={onClose} className="gap-1"><X className="h-4 w-4" /> Fermer</Button>
            <Button variant="secondary" onClick={handleSaveDraft} className="gap-1"><Save className="h-4 w-4" /> Sauver brouillon</Button>
            <Button onClick={handlePublish} disabled={submitting} className="flex-1 gap-2" size="lg">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {submitting ? "Publication..." : "Publier dans la boutique admin"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
