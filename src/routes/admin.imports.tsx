/**
 * admin.imports.tsx
 * Import IA Visuelle - Variantes avec sous-options (couleurs + tailles)
 * Notation: 1,2,,3,4,,5,7 -> info=1-2 | product=3-4 | variants=5-7
 */
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Package, Trash2, CheckCircle2, XCircle, ImageIcon, Loader2, AlertTriangle, Save, FileSpreadsheet, Download, Table2, Sparkles, Upload, Film, X, Wand2, ChevronRight, CircleCheck, CircleX, Pencil, Plus, Minus, Info, Settings2, Palette, Ruler } from "lucide-react";
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
import { exportProducts, downloadTemplate, previewImport, commitImport } from "@/lib/import-export.functions";
import { supabase } from "@/integrations/supabase/client";
import { uploadImportMedia, extractVideoFrames, analyzeVisualMedia, publishDraft, type VisualDraft, type SimpleVariant, type MediaGroup } from "@/lib/visual-ai-import.service";

export const Route = createFileRoute("/admin/imports")({ component: () => (<PermissionGate perm="products"><AdminImports /></PermissionGate>) });
const fmtFcfa = (n: number | null) => n === null || n === 0 ? "-" : `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
type Pick = string; const idOf = (v: Pick) => v.slice(4);
interface CatRow { id: string; name: string; level: number; parent_id: string | null; }
const LS_KEY = "kawzone_v4"; function loadDrafts(): VisualDraft[] { try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : []; } catch { return []; } } function saveDrafts(drafts: VisualDraft[]) { localStorage.setItem(LS_KEY, JSON.stringify(drafts)); }

const COLOR_PRESETS = ["Rouge", "Bleu", "Noir", "Blanc", "Vert", "Jaune", "Orange", "Rose", "Gris", "Marron", "Violet", "Beige"];
const SIZE_PRESETS = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "36", "38", "40", "42", "44", "46"];

export default function AdminImports() {
  const [mainTab, setMainTab] = useState<"excel" | "visual" | "drafts">("visual");
  const [drafts, setDrafts] = useState<VisualDraft[]>(loadDrafts);
  useEffect(() => { saveDrafts(drafts); }, [drafts]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingDraft = useMemo(() => drafts.find(d => d.id === editingId) || null, [drafts, editingId]);
  const fnExport = useServerFn(exportProducts); const fnTemplate = useServerFn(downloadTemplate); const fnPreview = useServerFn(previewImport); const fnCommit = useServerFn(commitImport);
  const [excelFile, setExcelFile] = useState<File | null>(null); const [preview, setPreview] = useState<any>(null); const [previewLoading, setPreviewLoading] = useState(false);
  const activeDrafts = drafts.filter(d => d.status === "draft");

  return (
    <div className="space-y-4">
      <div><h1 className="flex items-center gap-2 text-xl font-bold"><Package className="h-5 w-5" /> Importation</h1><p className="text-xs text-muted-foreground">Excel/CSV ou IA Visuelle</p></div>
      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as "excel" | "visual" | "drafts")}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="excel"><FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Excel/CSV</TabsTrigger>
          <TabsTrigger value="visual"><Sparkles className="h-3.5 w-3.5 mr-1" /> IA Visuelle</TabsTrigger>
          <TabsTrigger value="drafts"><Package className="h-3.5 w-3.5 mr-1" /> Brouillons {activeDrafts.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px]">{activeDrafts.length}</Badge>}</TabsTrigger>
        </TabsList>
        <TabsContent value="excel" className="space-y-4 pt-3">
          <Card><CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /> Excel / CSV</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => fnTemplate({}).then((r: any) => { const b = atob(r.base64); const bytes = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i); const blob = new Blob([bytes], { type: r.mime }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = r.fileName; a.click(); URL.revokeObjectURL(url); }).catch(() => toast.error("Erreur"))}><Download className="mr-1 h-3.5 w-3.5" /> Modele</Button>
                <Button variant="outline" size="sm" onClick={() => fnExport({ data: { scope: "admin", shopId: "", status: "any" } }).then((r: any) => { const b = atob(r.base64); const bytes = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i); const blob = new Blob([bytes], { type: r.mime }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = r.fileName; a.click(); URL.revokeObjectURL(url); }).catch(() => toast.error("Erreur"))}><Table2 className="mr-1 h-3.5 w-3.5" /> Exporter</Button>
              </div>
              <Separator /><Input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { setExcelFile(e.target.files?.[0] ?? null); setPreview(null); }} />
              <Button onClick={async () => { if (!excelFile) return; setPreviewLoading(true); try { const b64 = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve((r.result as string).split(",")[1] ?? ""); r.onerror = reject; r.readAsDataURL(excelFile); }); const r = await fnPreview({ data: { scope: "admin", shopId: "", fileBase64: b64, fileName: excelFile.name } }); setPreview(r); } catch (e: any) { toast.error(e.message); } setPreviewLoading(false); }} disabled={!excelFile || previewLoading} className="w-full">{previewLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Table2 className="h-4 w-4 mr-1" />}</Button>
              {preview && <Button onClick={async () => { try { const b64 = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve((r.result as string).split(",")[1] ?? ""); r.onerror = reject; r.readAsDataURL(excelFile!); }); await fnCommit({ data: { scope: "admin", shopId: "", fileBase64: b64, fileName: excelFile!.name } }); toast.success("Importe !"); setPreview(null); setExcelFile(null); } catch (e: any) { toast.error(e.message); } }} className="w-full"><CheckCircle2 className="h-4 w-4 mr-1" /> Importer</Button>}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="visual" className="space-y-4 pt-3"><VisualImporter onDraftCreated={(d) => { setDrafts(p => [d, ...p]); setEditingId(d.id); setMainTab("drafts"); }} /></TabsContent>
        <TabsContent value="drafts" className="space-y-4 pt-3">
          {activeDrafts.length === 0 ? (
            <div className="rounded-xl border border-dashed p-10 text-center"><Package className="mx-auto h-10 w-10 text-muted-foreground opacity-60" /><p className="text-sm font-semibold">Aucun brouillon</p><Button variant="outline" size="sm" className="mt-3" onClick={() => setMainTab("visual")}><Sparkles className="h-3.5 w-3.5 mr-1" /> Importer</Button></div>
          ) : (
            <div className="grid grid-cols-1 gap-3">{activeDrafts.map(d => (<DraftCard key={d.id} draft={d} onEdit={() => setEditingId(d.id)} onRemove={() => setDrafts(p => p.filter(x => x.id !== d.id))} />))}</div>
          )}
        </TabsContent>
      </Tabs>
      {editingDraft && (<DraftEditor draft={editingDraft} onClose={() => setEditingId(null)} onUpdate={(patch) => setDrafts(p => p.map(d => d.id === editingDraft.id ? { ...d, ...patch } : d))} onPublish={(id) => setDrafts(p => p.filter(d => d.id !== id))} />)}
    </div>
  );
}

function VisualImporter({ onDraftCreated }: { onDraftCreated: (d: VisualDraft) => void }) {
  const [files, setFiles] = useState<{ file: File; preview: string; type: "image" | "video" }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [logs, setLogs] = useState<{ msg: string; type: string }[]>([]);
  const [videoError, setVideoError] = useState("");
  const [mediaNotation, setMediaNotation] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fnUpload = useServerFn(uploadImportMedia);
  const fnExtractFrames = useServerFn(extractVideoFrames);
  const fnAnalyze = useServerFn(analyzeVisualMedia);
  const addLog = (msg: string, type = "info") => setLogs(p => [...p, { msg, type }]);
  const handleFiles = (newFiles: File[]) => { const accepted = newFiles.filter(f => f.type.startsWith("image/") || f.type.startsWith("video/")); if (accepted.length === 0) { toast.error("Images et videos uniquement"); return; } if (files.length + accepted.length > 20) { toast.error("Max 20 fichiers"); return; } const items = accepted.map(f => ({ file: f, preview: URL.createObjectURL(f), type: f.type.startsWith("video/") ? "video" as const : "image" as const })); setFiles(p => [...p, ...items]); setVideoError(""); };
  const removeFile = (i: number) => setFiles(p => { const n = [...p]; URL.revokeObjectURL(n[i].preview); n.splice(i, 1); return n; });
  const handleAnalyze = async () => { if (files.length === 0) { toast.error("Ajoutez des medias"); return; } setIsAnalyzing(true); setLogs([]); setVideoError(""); addLog("Demarrage...", "info"); try { const imageUrls: string[] = []; const videoFrameUrls: string[] = []; for (let i = 0; i < files.length; i++) { const f = files[i]; try { const b64 = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve((r.result as string).split(",")[1] ?? ""); r.onerror = reject; r.readAsDataURL(f.file); }); const res = await fnUpload({ data: { fileBase64: b64, fileName: f.file.name, mimeType: f.file.type }}) as any; if (f.type === "image") imageUrls.push(res.url); else { const fr = await fnExtractFrames({ data: { videoUrl: res.url, maxFrames: 8 }}) as any; if (fr.error) { setVideoError(`Video "${f.file.name}": ${fr.error}`); addLog(`Video ${f.file.name}: ${fr.error}`, "err"); } if (fr.frameUrls?.length > 0) { videoFrameUrls.push(...fr.frameUrls); addLog(`${fr.frameCount} frames`, "ok"); } else { addLog(`Aucune frame de ${f.file.name}`, "warn"); } } } catch (e: any) { addLog(`${f.file.name}: ${e.message}`, "err"); } } const effective = imageUrls.length > 0 ? imageUrls : videoFrameUrls; if (effective.length === 0) throw new Error("Aucun media utilisable. " + (videoError || "Ajoutez des images.")); addLog("Analyse IA...", "info"); const notationStr = mediaNotation.trim(); if (notationStr) addLog(`Notation: ${notationStr}`, "info"); const analysis = await fnAnalyze({ data: { imageUrls, videoFrameUrls, mediaNotation: notationStr }}) as any; if (analysis.logs) analysis.logs.forEach((l: string) => addLog(l, l.includes("OK") ? "ok" : l.includes("Erreur") ? "err" : "info")); if (!analysis.success || !analysis.draft) throw new Error(analysis.errors?.[0] || "Echec"); onDraftCreated(analysis.draft); toast.success(`OK! Prix from: ${fmtFcfa(analysis.draft.price)} | ${analysis.draft.variants.length} variantes`); setFiles([]); } catch (e: any) { addLog(e.message, "err"); toast.error(e.message); } setIsAnalyzing(false); };
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const onDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); handleFiles(Array.from(e.dataTransfer.files)); }, []);
  return (
    <div className="space-y-4">
      <Card className="bg-blue-50/50 border-blue-200">
        <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1 text-blue-800"><Info className="h-3.5 w-3.5" /> Comment organiser vos medias</CardTitle></CardHeader>
        <CardContent className="text-[11px] text-blue-800 space-y-2 pt-0">
          <div className="rounded bg-white/70 p-2 space-y-1.5">
            <div className="flex items-start gap-2">
              <Badge className="text-[9px] bg-amber-100 text-amber-800 border-amber-300 shrink-0 mt-0.5">INFO</Badge>
              <span><strong>Images 1 a 2</strong> = Contiennent les infos (prix, description). L&apos;IA lit ces images pour extraire les donnees.</span>
            </div>
            <div className="flex items-start gap-2">
              <Badge className="text-[9px] bg-emerald-100 text-emerald-800 border-emerald-300 shrink-0 mt-0.5">PRODUIT</Badge>
              <span><strong>Images 3 a 4+</strong> = Photos du produit. Ces images seront dans la galerie du produit.</span>
            </div>
            <div className="flex items-start gap-2">
              <Badge className="text-[9px] bg-purple-100 text-purple-800 border-purple-300 shrink-0 mt-0.5">VARIANTES</Badge>
              <span><strong>Apres ,,</strong> = Images de variantes. Chaque image = une option differente.</span>
            </div>
          </div>
          <div className="rounded bg-white/70 p-2">
            <p className="font-semibold mb-1">Notation: utilisez ,, pour separer les groupes</p>
            <ul className="space-y-0.5 list-disc list-inside text-[10px]">
              <li><code className="bg-blue-100 px-1 rounded">1,2,,3,4,,5,7</code> -> INFO:1-2 | PRODUIT:3-4 | VARIANTES:5,7</li>
              <li><code className="bg-blue-100 px-1 rounded">1,2,,3,4,5,6</code> -> INFO:1-2 | PRODUIT:3-6 (pas de variants)</li>
              <li><code className="bg-blue-100 px-1 rounded">1-3,,4,5,,6-8</code> -> INFO:1-3 | PRODUIT:4-5 | VARIANTES:6-8</li>
              <li>Sans notation: les 2 premieres = info, le reste = produit</li>
            </ul>
          </div>
          <p className="text-amber-700"><AlertTriangle className="h-3 w-3 inline mr-0.5" /> <strong>Conseil video:</strong> Si la video ne se lit pas, utilisez des captures d&apos;ecran.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Wand2 className="h-4 w-4 text-primary" /> Import IA Visuel</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div onClick={() => fileInputRef.current?.click()} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} className={`border-2 border-dashed rounded-xl p-6 sm:p-8 text-center cursor-pointer transition-all ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:border-muted-foreground/40"}`}>
            <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => handleFiles(Array.from(e.target.files || []))} />
            <Upload className="mx-auto h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground mb-2" />
            <p className="text-sm font-medium">Touchez ou cliquez pour selectionner</p>
            <p className="text-[10px] text-muted-foreground">Images: PNG, JPG | Videos: MP4 (max 60s)</p>
          </div>
          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between items-center"><span className="text-xs text-muted-foreground">{files.length} fichier(s)</span><Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => { files.forEach(f => URL.revokeObjectURL(f.preview)); setFiles([]); }}><Trash2 className="h-3 w-3 mr-1" /> Tout suppr</Button></div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {files.map((f, i) => (
                  <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border bg-muted">
                    <div className="absolute top-1 left-1 z-10 bg-primary text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">{i + 1}</div>
                    {f.type === "video" ? <video src={f.preview} className="w-full h-full object-cover" muted /> : <img src={f.preview} alt="" className="w-full h-full object-cover" />}
                    {f.type === "video" && <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[8px] px-1 rounded"><Film className="h-2 w-2 inline" /></div>}
                    <button onClick={(e) => { e.stopPropagation(); removeFile(i); }} className="absolute top-1 right-1 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100"><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {files.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-semibold flex items-center gap-1">
                <Info className="h-3 w-3" /> Notation des medias (optionnel)
              </Label>
              <div className="rounded bg-blue-50 border border-blue-200 p-2 text-[10px] text-blue-800 mb-1">
                <strong>Format:</strong> 1,2 = INFO | 3,4 = PRODUIT | <strong>,,5,6</strong> = VARIANTES. Utilisez <strong>,,</strong> pour separer les groupes.
              </div>
              <Input value={mediaNotation} onChange={(e) => setMediaNotation(e.target.value)} placeholder={`Ex: 1,2,,3,4,,5,7 (${files.length} fichiers)`} className="text-sm" />
              <p className="text-[10px] text-muted-foreground">Separez avec ,,: INFO ,, PRODUIT ,, VARIANTES. Ex: 1,2,,3,4,,5,7</p>
            </div>
          )}
          {videoError && <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-800"><AlertTriangle className="h-3.5 w-3.5 inline mr-1" />{videoError}</div>}
          <Button onClick={handleAnalyze} disabled={files.length === 0 || isAnalyzing} className="w-full gap-2" size="lg">{isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{isAnalyzing ? "Analyse..." : "Analyser avec l'IA"}</Button>
          {logs.length > 0 && (<div className="rounded-lg border bg-muted/30 p-3 max-h-[150px] overflow-y-auto space-y-1">{logs.map((l, i) => (<div key={i} className="flex items-start gap-2 text-[11px]">{l.type === "ok" ? <CircleCheck className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" /> : l.type === "err" ? <CircleX className="h-3 w-3 text-destructive shrink-0 mt-0.5" /> : <Loader2 className="h-3 w-3 text-blue-500 shrink-0 mt-0.5 animate-spin" />}<span className={l.type === "err" ? "text-destructive" : ""}>{l.msg}</span></div>))}</div>)}
        </CardContent>
      </Card>
    </div>
  );
}

function DraftCard({ draft, onEdit, onRemove }: { draft: VisualDraft; onEdit: () => void; onRemove: () => void }) {
  const minPrice = draft.variants.length > 0 ? Math.min(...draft.variants.map(v => v.price).filter(p => p > 0)) : draft.price;
  return (
    <Card className={`cursor-pointer hover:shadow-md transition-shadow ${draft.uncertainties.length > 0 ? "border-amber-300" : ""}`} onClick={onEdit}>
      <CardContent className="p-3">
        <div className="flex gap-3">
          <div className="h-14 w-14 shrink-0 rounded bg-muted overflow-hidden">{draft.images[0] ? <img src={draft.images[0]} alt="" className="h-full w-full object-cover" loading="lazy" /> : <ImageIcon className="m-auto mt-3 h-5 w-5 text-muted-foreground" />}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 flex-wrap">
              <p className="text-sm font-medium truncate">{draft.name}</p>
              <Badge variant={draft.confidence >= 70 ? "default" : draft.confidence >= 40 ? "secondary" : "destructive"} className="text-[10px]">{draft.confidence}%</Badge>
              {draft.uncertainties.length > 0 && <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200"><AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> A verifier</Badge>}
            </div>
            <p className="text-[11px] text-muted-foreground truncate">{draft.categoryName || "Sans categorie"} | <span className="font-semibold text-foreground">from {fmtFcfa(minPrice)}</span> | {draft.variants.length}v</p>
            <div className="flex gap-1 mt-1"><Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={(e) => { e.stopPropagation(); onEdit(); }}><Pencil className="h-3 w-3 mr-1" /> Modifier</Button><Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-destructive" onClick={(e) => { e.stopPropagation(); onRemove(); }}><XCircle className="h-3 w-3 mr-1" /> Suppr</Button></div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Preset chip for quick color/size selection */
function PresetChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-muted hover:bg-muted/80 text-muted-foreground border-muted-foreground/20"}`}>{label}</button>
  );
}

function VariantRow({ variant, index, onUpdate, onRemove }: { variant: SimpleVariant; index: number; onUpdate: (patch: Partial<SimpleVariant>) => void; onRemove: () => void; }) {
  const addColor = (val: string) => { if (!variant.colors.includes(val)) onUpdate({ colors: [...variant.colors, val] }); };
  const removeColor = (ci: number) => onUpdate({ colors: variant.colors.filter((_, j) => j !== ci) });
  const updateColor = (ci: number, val: string) => onUpdate({ colors: variant.colors.map((c, j) => j === ci ? val : c) });
  const addSize = (val: string) => { if (!variant.sizes.includes(val)) onUpdate({ sizes: [...variant.sizes, val] }); };
  const removeSize = (si: number) => onUpdate({ sizes: variant.sizes.filter((_, j) => j !== si) });
  const updateSize = (si: number, val: string) => onUpdate({ sizes: variant.sizes.map((s, j) => j === si ? val : s) });
  const [customColor, setCustomColor] = useState("");
  const [customSize, setCustomSize] = useState("");
  const allColorsSelected = COLOR_PRESETS.every(c => variant.colors.includes(c));
  const allSizesSelected = SIZE_PRESETS.every(s => variant.sizes.includes(s));

  return (
    <div className="bg-muted/30 rounded-lg p-2.5 space-y-3">
      <div className="flex gap-2 items-end">
        <div className="flex-1 min-w-0">
          <Label className="text-[9px] text-muted-foreground">Nom du choix</Label>
          <Input value={variant.label} onChange={e => onUpdate({ label: e.target.value })} className="h-9 text-sm mt-0.5" placeholder="Ex: T-shirt Basique" />
        </div>
        <div className="w-28 shrink-0">
          <Label className="text-[9px] text-muted-foreground">Prix FCFA</Label>
          <Input type="number" min={0} value={variant.price || ""} onChange={e => onUpdate({ price: e.target.value ? Number(e.target.value) : 0 })} className="h-9 text-sm mt-0.5" placeholder="5000" />
        </div>
        <button onClick={onRemove} className="h-9 w-9 flex items-center justify-center rounded-md text-destructive hover:bg-destructive/10 shrink-0" title="Supprimer la variante"><X className="h-5 w-5" /></button>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-[9px] text-muted-foreground flex items-center gap-1"><Palette className="h-3 w-3" /> Couleurs ({variant.colors.length})</Label>
          <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1.5" onClick={() => { if (allColorsSelected) onUpdate({ colors: [] }); else onUpdate({ colors: [...new Set([...variant.colors, ...COLOR_PRESETS])] }); }}>
            {allColorsSelected ? <X className="h-2.5 w-2.5 mr-0.5" /> : <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />}
            {allColorsSelected ? "Tout deselectionner" : "Tout selectionner"}
          </Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {COLOR_PRESETS.map(c => (
            <PresetChip key={c} label={c} active={variant.colors.includes(c)} onClick={() => variant.colors.includes(c) ? onUpdate({ colors: variant.colors.filter(x => x !== c) }) : addColor(c)} />
          ))}
        </div>
        {variant.colors.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {variant.colors.map((c, ci) => (
              <div key={ci} className="flex items-center gap-1 bg-background rounded-md border px-1.5 py-0.5">
                {ci === 0 && (
                  <input type="color" value={variant.color_hex || "#000000"} onChange={e => onUpdate({ color_hex: e.target.value })} className="w-4 h-4 rounded cursor-pointer border-0 p-0 shrink-0" title="Couleur hex" />
                )}
                <Input value={c} onChange={e => updateColor(ci, e.target.value)} className="h-5 text-[10px] border-0 p-0 w-14 bg-transparent" />
                <button onClick={() => removeColor(ci)} className="text-destructive hover:bg-destructive/10 rounded p-0.5"><X className="h-2.5 w-2.5" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-1">
          <Input value={customColor} onChange={e => setCustomColor(e.target.value)} className="h-7 text-xs" placeholder="Couleur personnalisee..." onKeyDown={e => { if (e.key === "Enter" && customColor.trim()) { addColor(customColor.trim()); setCustomColor(""); } }} />
          <Button variant="ghost" size="sm" className="h-7 text-[10px] px-2" onClick={() => { if (customColor.trim()) { addColor(customColor.trim()); setCustomColor(""); } }}><Plus className="h-3 w-3" /></Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-[9px] text-muted-foreground flex items-center gap-1"><Ruler className="h-3 w-3" /> Tailles ({variant.sizes.length})</Label>
          <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1.5" onClick={() => { if (allSizesSelected) onUpdate({ sizes: [] }); else onUpdate({ sizes: [...new Set([...variant.sizes, ...SIZE_PRESETS])] }); }}>
            {allSizesSelected ? <X className="h-2.5 w-2.5 mr-0.5" /> : <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />}
            {allSizesSelected ? "Tout deselectionner" : "Tout selectionner"}
          </Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {SIZE_PRESETS.map(s => (
            <PresetChip key={s} label={s} active={variant.sizes.includes(s)} onClick={() => variant.sizes.includes(s) ? onUpdate({ sizes: variant.sizes.filter(x => x !== s) }) : addSize(s)} />
          ))}
        </div>
        {variant.sizes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {variant.sizes.map((s, si) => (
              <div key={si} className="flex items-center gap-1 bg-background rounded-md border px-1.5 py-0.5">
                <Input value={s} onChange={e => updateSize(si, e.target.value)} className="h-5 text-[10px] border-0 p-0 w-10 bg-transparent text-center" />
                <button onClick={() => removeSize(si)} className="text-destructive hover:bg-destructive/10 rounded p-0.5"><X className="h-2.5 w-2.5" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-1">
          <Input value={customSize} onChange={e => setCustomSize(e.target.value)} className="h-7 text-xs" placeholder="Taille personnalisee..." onKeyDown={e => { if (e.key === "Enter" && customSize.trim()) { addSize(customSize.trim()); setCustomSize(""); } }} />
          <Button variant="ghost" size="sm" className="h-7 text-[10px] px-2" onClick={() => { if (customSize.trim()) { addSize(customSize.trim()); setCustomSize(""); } }}><Plus className="h-3 w-3" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-dashed">
        <div>
          <Label className="text-[9px] text-muted-foreground">Stock</Label>
          <Input type="number" min={0} value={variant.stock} onChange={e => onUpdate({ stock: Number(e.target.value) })} className="h-8 text-xs mt-0.5" placeholder="0" />
        </div>
        <div>
          <Label className="text-[9px] text-muted-foreground">Image URL</Label>
          <Input value={variant.image_url || ""} onChange={e => onUpdate({ image_url: e.target.value || null })} className="h-8 text-[10px] mt-0.5" placeholder="https://..." />
        </div>
      </div>
    </div>
  );
}

function DraftEditor({ draft, onClose, onUpdate, onPublish }: { draft: VisualDraft; onClose: () => void; onUpdate: (patch: Partial<VisualDraft>) => void; onPublish: (id: string) => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState(draft.name);
  const [designation, setDesignation] = useState(draft.designation);
  const [description, setDescription] = useState(draft.description);
  const [price, setPrice] = useState<string>(draft.price !== null ? String(draft.price) : "");
  const [variants, setVariants] = useState<SimpleVariant[]>(draft.variants.length > 0 ? draft.variants : []);
  const { data: cats } = useQuery<CatRow[]>({ queryKey: ["cats-vi"], queryFn: async () => { const { data } = await supabase.from("categories").select("id, name, level, parent_id").order("position"); return (data || []) as CatRow[]; } });
  const l3id = draft.categoryId || "";
  const l3cat = cats?.find(c => c.id === l3id);
  const l2cat = l3cat && cats?.find(c => c.id === l3cat.parent_id && c.level === 2);
  const l1cat = l2cat && cats?.find(c => c.id === l2cat.parent_id && c.level === 1);
  const [pick1, setPick1] = useState<string>(l1cat ? `cat:${l1cat.id}` : "");
  const [pick2, setPick2] = useState<string>(l2cat ? `cat:${l2cat.id}` : "");
  const [pick3, setPick3] = useState<string>(l3cat ? `cat:${l3cat.id}` : (l3id || ""));
  const opts1 = useMemo(() => (cats || []).filter(c => c.level === 1).map(c => ({ value: `cat:${c.id}`, label: c.name })), [cats]);
  const opts2 = useMemo(() => { if (!pick1) return []; const pid = idOf(pick1); return (cats || []).filter(c => c.level === 2 && c.parent_id === pid).map(c => ({ value: `cat:${c.id}`, label: c.name })); }, [cats, pick1]);
  const opts3 = useMemo(() => { if (!pick2) return []; const pid = idOf(pick2); return (cats || []).filter(c => c.level === 3 && c.parent_id === pid).map(c => ({ value: `cat:${c.id}`, label: c.name })); }, [cats, pick2]);
  const deepestPick = pick3 || pick2 || pick1 || "";
  const finalL3 = pick3 && cats ? cats.find(c => c.id === (pick3.startsWith("cat:") ? pick3.slice(4) : pick3)) : null;
  const addVariant = () => setVariants(v => [...v, { label: "", price: 0, image_url: null, colors: [], sizes: [], color_hex: "", stock: 0 }]);
  const removeVariant = (i: number) => setVariants(v => v.filter((_, j) => j !== i));
  const updateVariant = (i: number, patch: Partial<SimpleVariant>) => setVariants(v => v.map((x, j) => j === i ? { ...x, ...patch } : x));
  const fromPrice = variants.length > 0 ? Math.min(...variants.map(v => v.price).filter(p => p > 0)) : (price ? Number(price) : 0);
  const fnPublish = useServerFn(publishDraft);

  const handlePublish = async () => {
    if (!name.trim()) { toast.error("Nom obligatoire"); return; }
    if (!price || Number(price) <= 0) { toast.error("Prix FCFA obligatoire"); return; }
    if (!deepestPick) { toast.error("Categorie obligatoire"); return; }
    setSubmitting(true);
    try {
      const result = await fnPublish({ data: { draft: { name: name.trim(), designation: designation.trim(), description: description.trim(), price: Number(price), categoryId: finalL3?.id || null, images: draft.images, variants: variants.map(v => ({ label: v.label, price: v.price, image_url: v.image_url, colors: v.colors, sizes: v.sizes, color_hex: v.color_hex, stock: v.stock })) } } }) as any;
      toast.success(`Publie! Code: ${result.code}`); onPublish(draft.id); onClose();
    } catch (e: any) { toast.error(e.message || "Echec"); }
    setSubmitting(false);
  };

  const handleSave = () => { onUpdate({ name, designation, description, price: price ? Number(price) : null, variants, categoryId: finalL3?.id || null, categoryName: finalL3 ? `${opts1.find(o => o.value === pick1)?.label || ""} > ${opts2.find(o => o.value === pick2)?.label || ""} > ${finalL3.name}` : null }); toast.success("Sauvegarde"); };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[95vw] sm:w-[90vw] md:max-w-2xl max-h-[92dvh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="p-3 sm:p-4 pb-2 sticky top-0 bg-background z-10 border-b">
          <DialogTitle className="text-sm sm:text-base flex items-center gap-2 flex-wrap">
            <Pencil className="h-4 w-4 text-primary" /> Verifier et publier
            <Badge variant={draft.confidence >= 70 ? "default" : draft.confidence >= 40 ? "secondary" : "destructive"} className="text-[10px]">{draft.confidence}%</Badge>
          </DialogTitle>
          {draft.uncertainties.length > 0 && (
            <div className="mt-1 rounded bg-amber-50 border border-amber-200 p-1.5 space-y-0.5">
              {draft.uncertainties.map((u, i) => (<p key={i} className="text-[10px] text-amber-800">{i + 1}. {u}</p>))}
            </div>
          )}
        </DialogHeader>
        <div className="p-3 sm:p-4 space-y-4">
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
            <p className="text-[10px] uppercase text-muted-foreground">Prix affiche (from)</p>
            <p className="text-2xl font-bold text-primary">{fmtFcfa(fromPrice)}</p>
            {draft.originalPrice && <p className="text-[10px] text-muted-foreground">{draft.originalPrice} {draft.originalCurrency} = {fmtFcfa(draft.price)}</p>}
          </div>

          {draft.mediaGroup && (
            <div className="space-y-2">
              {draft.mediaGroup.infoImages.length > 0 && (
                <div>
                  <Label className="text-[9px] uppercase text-amber-700 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Images INFO (donnees extraites)</Label>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-1 mt-0.5">{draft.mediaGroup.infoImages.map((url, i) => (<div key={`info-${i}`} className="aspect-square rounded overflow-hidden border-2 border-amber-300 bg-muted"><img src={url} alt="" className="w-full h-full object-cover" /></div>))}</div>
                </div>
              )}
              {draft.mediaGroup.productImages.length > 0 && (
                <div>
                  <Label className="text-[9px] uppercase text-emerald-700 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Images PRODUIT (galerie)</Label>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-1 mt-0.5">{draft.mediaGroup.productImages.map((url, i) => (<div key={`prod-${i}`} className="aspect-square rounded overflow-hidden border-2 border-emerald-300 bg-muted"><img src={url} alt="" className="w-full h-full object-cover" /></div>))}</div>
                </div>
              )}
              {draft.mediaGroup.variantImages.length > 0 && (
                <div>
                  <Label className="text-[9px] uppercase text-purple-700 flex items-center gap-1"><Settings2 className="h-3 w-3" /> Images VARIANTES</Label>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-1 mt-0.5">{draft.mediaGroup.variantImages.map((url, i) => (<div key={`var-${i}`} className="aspect-square rounded overflow-hidden border-2 border-purple-300 bg-muted"><img src={url} alt="" className="w-full h-full object-cover" /></div>))}</div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <div><Label className="text-[10px] uppercase">Nom <span className="text-destructive">*</span></Label><Input value={name} onChange={e => setName(e.target.value)} className="mt-0.5 h-9" /></div>
            <div><Label className="text-[10px] uppercase">Designation</Label><Input value={designation} onChange={e => setDesignation(e.target.value)} className="mt-0.5 h-9" /></div>
            <div><Label className="text-[10px] uppercase">Prix FCFA <span className="text-destructive">*</span></Label><Input type="number" min={0} value={price} onChange={e => setPrice(e.target.value)} className="mt-0.5 h-9" placeholder={draft.price ? String(draft.price) : "Prix en FCFA"} /></div>
            <div><Label className="text-[10px] uppercase">Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="mt-0.5 text-sm" /></div>
          </div>

          <div>
            <Label className="text-[10px] uppercase font-semibold">Categorie</Label>
            <div className="grid grid-cols-1 gap-1.5 mt-1">
              <Select value={pick1} onValueChange={v => { setPick1(v); setPick2(""); setPick3(""); }}><SelectTrigger className="h-9"><SelectValue placeholder="Rayon..." /></SelectTrigger><SelectContent>{opts1.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>
              <Select value={pick2} onValueChange={v => { setPick2(v); setPick3(""); }} disabled={!pick1}><SelectTrigger className={`h-9 ${!pick1 ? "opacity-50" : ""}`}><SelectValue placeholder={pick1 ? "Categorie..." : "D'abord le rayon"} /></SelectTrigger><SelectContent>{opts2.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>
              <Select value={pick3} onValueChange={setPick3} disabled={!pick2}><SelectTrigger className={`h-9 ${!pick2 ? "opacity-50" : ""}`}><SelectValue placeholder={pick2 ? "Sous-categorie..." : "D'abord la categorie"} /></SelectTrigger><SelectContent>{opts3.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>

          <Separator />

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-[10px] uppercase font-semibold">Variantes ({variants.length})</Label>
              <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={addVariant}><Plus className="h-3 w-3 mr-1" /> Ajouter</Button>
            </div>
            {variants.length === 0 ? (
              <div className="rounded-lg border border-dashed p-3 text-center">
                <p className="text-[11px] text-muted-foreground">Aucune variante.</p>
                <Button variant="outline" size="sm" className="mt-2 h-6 text-[10px]" onClick={addVariant}><Plus className="h-3 w-3 mr-1" /> Ajouter une variante</Button>
              </div>
            ) : (
              <div className="space-y-3">
                {variants.map((v, i) => (
                  <VariantRow key={i} variant={v} index={i} onUpdate={(patch) => updateVariant(i, patch)} onRemove={() => removeVariant(i)} />
                ))}
              </div>
            )}
            {variants.length > 0 && (
              <p className="text-[10px] text-muted-foreground mt-2">Prix affiche aux clients: <strong className="text-foreground">{fmtFcfa(fromPrice)}</strong></p>
            )}
          </div>

          <div className="flex gap-2 pt-2 pb-1">
            <Button variant="outline" onClick={onClose} className="gap-1 flex-1 sm:flex-none"><X className="h-4 w-4" /> Fermer</Button>
            <Button variant="secondary" onClick={handleSave} className="gap-1 flex-1 sm:flex-none"><Save className="h-4 w-4" /> Sauver</Button>
            <Button onClick={handlePublish} disabled={submitting} className="flex-[2] gap-1" size="lg">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{submitting ? "..." : "Publier"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
