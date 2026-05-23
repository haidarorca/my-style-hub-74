/**
 * admin.imports.tsx
 * -----------------
 * Import Excel/CSV + Import IA Taobao/1688/Tmall
 * - Import boutique complete (tous les produits)
 * - Import produit individuel
 * - Logs visibles + score confiance
 * - Anti-doublons
 */

import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Package, Trash2, Edit3, CheckCircle2, XCircle, ExternalLink,
  ImageIcon, Loader2, AlertTriangle, ChevronDown, ChevronUp,
  Save, FileSpreadsheet, Download, Table2, Sparkles, Bot,
  CircleCheck, CircleX, CircleDashed, Wifi, WifiOff,
  Store, Link2,
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
import { scrapeSingleProduct, scrapeStore } from "@/lib/taobao-scraper.service";

export const Route = createFileRoute("/admin/imports")({
  component: () => (
    <PermissionGate perm="products">
      <AdminImports />
    </PermissionGate>
  ),
});

const fmtFcfa = (n: number) => `${Math.round(n || 0).toLocaleString("fr-FR")} FCFA`;

// ── Types ──
interface DraftProduct {
  id: string; name: string; designation: string; description: string;
  price: number; sourcePrice: number; sourceCurrency: string;
  images: string[]; variants: { size: string; color: string; colorHex: string; stock: number }[];
  sourceUrl: string; canonicalUrl: string; platform: string; itemId: string | null;
  categoryId: string | null; categoryName: string | null; confidence: number;
  status: "draft" | "published" | "discarded"; createdAt: number;
}

const LS_KEY = "kawzone_import_drafts";
function loadDrafts(): DraftProduct[] { try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : []; } catch { return []; } }
function saveDrafts(drafts: DraftProduct[]) { localStorage.setItem(LS_KEY, JSON.stringify(drafts)); }
let _id = Date.now();
function uid() { return `draft-${++_id}`; }

export default function AdminImports() {
  const [mainTab, setMainTab] = useState<"excel" | "ia" | "drafts">("ia");
  const [drafts, setDrafts] = useState<DraftProduct[]>(loadDrafts);
  const [editingId, setEditingId] = useState<string | null>(null);
  useEffect(() => { saveDrafts(drafts); }, [drafts]);

  // Excel
  const fnExport = useServerFn(exportProducts);
  const fnTemplate = useServerFn(downloadTemplate);
  const fnPreview = useServerFn(previewImport);
  const fnCommit = useServerFn(commitImport);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // IA Import
  const scrapeSingleFn = useServerFn(scrapeSingleProduct);
  const scrapeStoreFn = useServerFn(scrapeStore);
  const [iaMode, setIaMode] = useState<"store" | "product">("product");
  const [productUrl, setProductUrl] = useState("");
  const [iaLoading, setIaLoading] = useState(false);
  const [logs, setLogs] = useState<{ step: string; status: string; message: string }[]>([]);
  const [justImported, setJustImported] = useState<DraftProduct[]>([]);

  // ── Convert scraped product to draft ──
  const scrapedToDraft = (s: any): DraftProduct => ({
    id: uid(), name: s.name || "Produit", designation: s.designation || s.name || "",
    description: s.description || "", price: s.price || 0, sourcePrice: s.sourcePrice || 0,
    sourceCurrency: s.currency || "CNY", images: s.images || [],
    variants: s.variants || [], sourceUrl: s.sourceUrl || "",
    canonicalUrl: s.canonicalUrl || "", platform: s.platform || "taobao",
    itemId: s.itemId || null, categoryId: s.categoryId || null,
    categoryName: s.category || null, confidence: s.confidence || 30,
    status: "draft", createdAt: Date.now(),
  });

  // ── Import single product ──
  const handleImportProduct = async () => {
    if (!productUrl.trim()) { toast.error("Collez un lien produit"); return; }
    setIaLoading(true); setLogs([]); setJustImported([]);

    setLogs([{ step: "Demarrage", status: "running", message: "Analyse du lien..." }]);

    try {
      const result = await scrapeSingleFn({ data: { url: productUrl.trim() } }) as any;

      // Show logs from server
      if (result.logs) {
        for (const log of result.logs) {
          setLogs(prev => [...prev, { step: "Serveur", status: "success", message: log }]);
        }
      }

      if (!result.success || !result.products?.length) {
        toast.error(result.errors?.[0] || "Import echoue");
        setIaLoading(false);
        return;
      }

      const draft = scrapedToDraft(result.products[0]);
      setDrafts(prev => [draft, ...prev]);
      setJustImported([draft]);
      toast.success(`Produit importe ! Confiance : ${draft.confidence}%`);
      setMainTab("drafts");

    } catch (e: any) {
      toast.error(e.message || "Erreur");
      setLogs(prev => [...prev, { step: "Erreur", status: "error", message: e.message }]);
    }
    setIaLoading(false);
  };

  // ── Import store (all products) ──
  const handleImportStore = async () => {
    if (!productUrl.trim()) { toast.error("Collez un lien boutique"); return; }
    setIaLoading(true); setLogs([]); setJustImported([]);

    setLogs([{ step: "Demarrage", status: "running", message: "Analyse de la boutique..." }]);

    try {
      const result = await scrapeStoreFn({ data: { url: productUrl.trim(), maxProducts: 20 } }) as any;

      // Show logs from server
      if (result.logs) {
        for (const log of result.logs) {
          setLogs(prev => [...prev, { step: "Serveur", status: "success", message: log }]);
        }
      }

      if (!result.success || !result.products?.length) {
        toast.error(result.errors?.[0] || "Aucun produit trouve");
        setIaLoading(false);
        return;
      }

      const imported = result.products.map((p: any) => scrapedToDraft(p));
      setDrafts(prev => [...imported, ...prev]);
      setJustImported(imported);
      toast.success(`${imported.length} produits importes !`);
      setMainTab("drafts");

    } catch (e: any) {
      toast.error(e.message || "Erreur");
      setLogs(prev => [...prev, { step: "Erreur", status: "error", message: e.message }]);
    }
    setIaLoading(false);
  };

  // ── Publish ──
  const handlePublish = async (draft: DraftProduct) => {
    try {
      const { data: product, error } = await supabase.from("products").insert({
        name: draft.name, designation: draft.designation, description: draft.description,
        price: draft.price, status: "approved", is_active: true,
        category_id: draft.categoryId, code: `IMP-${Date.now().toString(36).toUpperCase()}`,
      }).select().single();
      if (error) throw error;
      if (draft.images.length > 0) await supabase.from("product_images").insert(draft.images.map((url, i) => ({ product_id: product.id, url, position: i })));
      if (draft.variants.length > 0) await supabase.from("product_variants").insert(draft.variants.map(v => ({ product_id: product.id, size: v.size, color: v.color, color_hex: v.colorHex || null, stock: v.stock })));
      setDrafts(prev => prev.filter(d => d.id !== draft.id));
      toast.success("Publie !");
    } catch (e: any) { toast.error(e.message || "Erreur"); }
  };

  const activeDrafts = drafts.filter(d => d.status === "draft");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold"><Package className="h-5 w-5" /> Importation</h1>
        <p className="text-xs text-muted-foreground">Excel/CSV ou Taobao/1688/Tmall</p>
      </div>

      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as "excel" | "ia" | "drafts")}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="excel" className="gap-1.5"><FileSpreadsheet className="h-3.5 w-3.5" /> Excel/CSV</TabsTrigger>
          <TabsTrigger value="ia" className="gap-1.5"><Bot className="h-3.5 w-3.5" /> Import IA</TabsTrigger>
          <TabsTrigger value="drafts" className="gap-1.5"><Package className="h-3.5 w-3.5" /> Brouillons {activeDrafts.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px]">{activeDrafts.length}</Badge>}</TabsTrigger>
        </TabsList>

        {/* Excel */}
        <TabsContent value="excel" className="space-y-4 pt-3">
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /> Excel / CSV</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => fnTemplate({}).then((r: any) => { const b = atob(r.base64); const bytes = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i); const blob = new Blob([bytes], { type: r.mime }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = r.fileName; a.click(); URL.revokeObjectURL(url); }).catch(() => toast.error("Erreur"))}><Download className="mr-1 h-3.5 w-3.5" /> Modele</Button>
                <Button variant="outline" size="sm" onClick={() => fnExport({ data: { scope: "admin", shopId: "", status: "any" } }).then((r: any) => { const b = atob(r.base64); const bytes = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i); const blob = new Blob([bytes], { type: r.mime }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = r.fileName; a.click(); URL.revokeObjectURL(url); }).catch(() => toast.error("Erreur"))}><Table2 className="mr-1 h-3.5 w-3.5" /> Exporter</Button>
              </div>
              <Separator />
              <Input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { setExcelFile(e.target.files?.[0] ?? null); setPreview(null); }} />
              <Button onClick={async () => { if (!excelFile) return; setPreviewLoading(true); try { const b64 = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve((r.result as string).split(",")[1] ?? ""); r.onerror = reject; r.readAsDataURL(excelFile); }); const r = await fnPreview({ data: { scope: "admin", shopId: "", fileBase64: b64, fileName: excelFile.name } }); setPreview(r); } catch (e: any) { toast.error(e.message); } setPreviewLoading(false); }} disabled={!excelFile || previewLoading} className="w-full">{previewLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Table2 className="h-4 w-4 mr-1" />}</Button>
              {preview && <Button onClick={async () => { try { const b64 = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve((r.result as string).split(",")[1] ?? ""); r.onerror = reject; r.readAsDataURL(excelFile!); }); await fnCommit({ data: { scope: "admin", shopId: "", fileBase64: b64, fileName: excelFile!.name } }); toast.success("Importe !"); setPreview(null); setExcelFile(null); } catch (e: any) { toast.error(e.message); } }} className="w-full"><CheckCircle2 className="h-4 w-4 mr-1" /> Importer</Button>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Import IA */}
        <TabsContent value="ia" className="space-y-4 pt-3">
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Import IA Taobao / 1688 / Tmall</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {/* Mode toggle */}
              <div className="flex rounded-lg bg-muted p-1 gap-1">
                <Button variant={iaMode === "store" ? "default" : "ghost"} size="sm" className="flex-1 text-xs gap-1" onClick={() => setIaMode("store")}>
                  <Store className="h-3.5 w-3.5" /> Lien boutique (tous les produits)
                </Button>
                <Button variant={iaMode === "product" ? "default" : "ghost"} size="sm" className="flex-1 text-xs gap-1" onClick={() => setIaMode("product")}>
                  <Link2 className="h-3.5 w-3.5" /> Lien produit (un article)
                </Button>
              </div>

              <Textarea
                value={productUrl}
                onChange={(e) => setProductUrl(e.target.value)}
                placeholder={
                  iaMode === "store"
                    ? `Collez le lien de la boutique :\nhttps://shop123456.taobao.com\nhttps://xxx.1688.com`
                    : `Collez le lien du produit ou le texte de partage :\nhttps://item.taobao.com/item.htm?id=123456\nhttps://click.world.taobao.com/abc...`
                }
                rows={4}
              />

              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800 space-y-1">
                <strong>{iaMode === "store" ? "Import boutique" : "Import produit"} :</strong>
                {iaMode === "store" ? (
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>Copiez l&apos;URL de la boutique Taobao/1688</li>
                    <li>Le systeme extraira jusqu&apos;a 20 produits</li>
                    <li>Nom, description, prix, images, variantes</li>
                  </ol>
                ) : (
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>App Taobao → Produit → Partager</li>
                    <li>Copiez le texte complet (lien + titre)</li>
                    <li>Le systeme extraira toutes les infos detaillees</li>
                  </ol>
                )}
              </div>

              <Button
                onClick={iaMode === "store" ? handleImportStore : handleImportProduct}
                disabled={iaLoading}
                className="w-full gap-2"
              >
                {iaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {iaLoading ? "Analyse en cours..." : iaMode === "store" ? "Importer la boutique" : "Importer le produit"}
              </Button>

              {/* Logs */}
              {logs.length > 0 && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-1 max-h-[240px] overflow-y-auto">
                  <h4 className="text-[10px] font-semibold uppercase text-muted-foreground">Logs</h4>
                  {logs.map((log, i) => (
                    <div key={i} className="flex items-start gap-2 text-[11px]">
                      {log.status === "success" && <CircleCheck className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />}
                      {log.status === "running" && <CircleDashed className="h-3 w-3 text-blue-500 shrink-0 mt-0.5 animate-spin" />}
                      {log.status === "error" && <CircleX className="h-3 w-3 text-destructive shrink-0 mt-0.5" />}
                      <div><span className="font-semibold">{log.step}</span> <span className="text-muted-foreground">— {log.message}</span></div>
                    </div>
                  ))}
                </div>
              )}

              {justImported.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                    Resultats ({justImported.length})
                  </h4>
                  {justImported.map(p => <MiniCard key={p.id} draft={p} />)}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Drafts */}
        <TabsContent value="drafts" className="space-y-4 pt-3">
          {activeDrafts.length === 0 ? (
            <div className="rounded-xl border border-dashed p-10 text-center">
              <Package className="mx-auto h-10 w-10 text-muted-foreground opacity-60" />
              <p className="text-sm font-semibold">Aucun brouillon</p>
            </div>
          ) : (
            <div className="space-y-3">{activeDrafts.map(d => <DraftCard key={d.id} draft={d} onPublish={() => handlePublish(d)} onDiscard={() => setDrafts(prev => prev.filter(x => x.id !== d.id))} onEdit={() => setEditingId(d.id)} />)}</div>
          )}
        </TabsContent>
      </Tabs>

      {editingId && <EditDialog draft={drafts.find(d => d.id === editingId)!} onClose={() => setEditingId(null)} onSave={(patch) => { setDrafts(prev => prev.map(d => d.id === editingId ? { ...d, ...patch } : d)); setEditingId(null); toast.success("Modifie"); }} />}
    </div>
  );
}

// ── Mini Card ──
function MiniCard({ draft }: { draft: DraftProduct }) {
  return (
    <div className={`rounded border p-2 flex gap-2 ${draft.confidence < 50 ? "border-amber-300 bg-amber-50/30" : ""}`}>
      <div className="h-12 w-12 shrink-0 rounded bg-muted overflow-hidden">
        {draft.images[0] ? <img src={draft.images[0]} alt="" className="h-full w-full object-cover" loading="lazy" /> : <ImageIcon className="m-auto mt-2 h-4 w-4 text-muted-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{draft.name}</p>
        <div className="flex gap-1 text-[10px]">
          <Badge variant="outline" className="text-[10px]">{draft.platform}</Badge>
          <span className="text-primary">{fmtFcfa(draft.price)}</span>
          <Badge variant={draft.confidence >= 70 ? "default" : draft.confidence >= 40 ? "secondary" : "destructive"} className="text-[10px]">{draft.confidence}%</Badge>
        </div>
      </div>
    </div>
  );
}

// ── Draft Card ──
function DraftCard({ draft, onPublish, onDiscard, onEdit }: { draft: DraftProduct; onPublish: () => void; onDiscard: () => void; onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card className={draft.confidence < 50 ? "border-amber-300" : ""}>
      <CardContent className="p-3">
        <div className="flex gap-3">
          <div className="h-14 w-14 shrink-0 rounded bg-muted overflow-hidden">
            {draft.images[0] ? <img src={draft.images[0]} alt="" className="h-full w-full object-cover" loading="lazy" /> : <ImageIcon className="m-auto mt-3 h-5 w-5 text-muted-foreground" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 flex-wrap">
              <p className="text-sm font-medium truncate">{draft.name}</p>
              <Badge variant="outline" className="text-[10px]">{draft.platform}</Badge>
              <Badge variant={draft.confidence >= 70 ? "default" : draft.confidence >= 40 ? "secondary" : "destructive"} className="text-[10px]">{draft.confidence}%</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground truncate">{draft.canonicalUrl.slice(0, 45)}... {draft.itemId ? `(ID: ${draft.itemId})` : ""}</p>
            <div className="flex flex-wrap gap-1 mt-1">
              <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => setExpanded(!expanded)}>{expanded ? "Moins" : "Details"}</Button>
              <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={onEdit}><Edit3 className="h-3 w-3 mr-1" />Modif</Button>
              <Button size="sm" className="h-6 text-[10px] px-2" onClick={onPublish}><CheckCircle2 className="h-3 w-3 mr-1" />Publier</Button>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-destructive" onClick={onDiscard}><XCircle className="h-3 w-3 mr-1" />Suppr</Button>
            </div>
            {draft.confidence < 50 && <p className="text-[10px] text-amber-600 mt-1"><AlertTriangle className="h-3 w-3 inline mr-0.5" />Confiance faible</p>}
          </div>
        </div>
        {expanded && (
          <div className="mt-2 border-t pt-2 text-[11px] space-y-1">
            {draft.description && <p className="text-muted-foreground">{draft.description}</p>}
            <div><strong>Source :</strong> <a href={draft.sourceUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">{draft.sourceUrl}</a></div>
            <div><strong>Canonique :</strong> {draft.canonicalUrl}</div>
            <div><strong>Plateforme :</strong> {draft.platform} | <strong>Item ID :</strong> {draft.itemId || "N/A"}</div>
            {draft.designation && <div><strong>Designation :</strong> {draft.designation}</div>}
            {draft.variants.length > 0 && <div><strong>Variantes :</strong> {draft.variants.map(v => `${v.color}${v.size ? ` (${v.size})` : ""}`).join(", ")}</div>}
            <div className="flex flex-wrap gap-1">{draft.images.slice(0, 6).map((img, i) => <img key={i} src={img} alt="" className="h-10 w-10 rounded object-cover border" />)}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Edit Dialog ──
function EditDialog({ draft, onClose, onSave }: { draft: DraftProduct; onClose: () => void; onSave: (p: Partial<DraftProduct>) => void }) {
  const [name, setName] = useState(draft.name);
  const [designation, setDesignation] = useState(draft.designation);
  const [description, setDescription] = useState(draft.description);
  const [price, setPrice] = useState(String(draft.price));
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Edit3 className="h-4 w-4" /> Modifier</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><label className="text-xs text-muted-foreground">Nom</label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground">Designation</label><Input value={designation} onChange={(e) => setDesignation(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground">Prix (FCFA)</label><Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground">Description</label><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="flex gap-2">
            <Button onClick={() => onSave({ name: name.trim(), designation: designation.trim(), description: description.trim(), price: Number(price) || 0 })} className="flex-1 gap-1"><Save className="h-3.5 w-3.5" /> Enregistrer</Button>
            <Button variant="outline" onClick={onClose}>Annuler</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
