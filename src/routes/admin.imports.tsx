/**
 * admin.imports.tsx
 * -----------------
 * Page fusionnee : Import Excel + Import IA (Taobao/1688)
 *
 * - Section 1: Import Excel/CSV (template, preview, validation)
 * - Section 2: Import IA depuis Taobao/1688 (boutique ou produit)
 * - Section 3: Brouillons d'importation (gestion, edition, publication)
 */

import { useState, useRef, useCallback } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Package, Search, Globe, Trash2, Edit3, CheckCircle2, XCircle,
  ExternalLink, ImageIcon, Loader2, AlertTriangle, RefreshCw,
  Store, ChevronDown, ChevronUp, Save, FileSpreadsheet, Upload,
  Download, Table2, Bot, Sparkles, Link2, Play,
} from "lucide-react";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  listImportBatches,
  listImportDrafts,
  updateImportDraft,
  publishImportDraft,
  discardImportDraft,
  deleteImportBatch,
  importSingleProduct,
  startStoreImport,
  fetchNextProductBatch,
  type ImportProduct,
  type ImportBatch,
} from "@/lib/admin-import-store.functions";
import {
  exportProducts,
  downloadTemplate,
  previewImport,
  commitImport,
  listImports,
} from "@/lib/import-export.functions";
import type { PreviewResult } from "@/lib/import-export-schema";

export const Route = createFileRoute("/admin/imports")({
  component: () => (
    <PermissionGate perm="products">
      <AdminImports />
    </PermissionGate>
  ),
});

const fmtFcfa = (n: number) => `${Math.round(n || 0).toLocaleString("fr-FR")} FCFA`;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function downloadBase64(base64: string, fileName: string, mime: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function AdminImports() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [mainTab, setMainTab] = useState<"excel" | "ia" | "drafts">("excel");

  // ── Excel state ──
  const shopId = user?.id ?? "";
  const fnExport = useServerFn(exportProducts);
  const fnTemplate = useServerFn(downloadTemplate);
  const fnPreview = useServerFn(previewImport);
  const fnCommit = useServerFn(commitImport);
  const fnHistory = useServerFn(listImports);

  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const excelInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);

  const history = useQuery({
    queryKey: ["product-imports", shopId],
    queryFn: () => fnHistory({ data: { shopId } }),
    staleTime: 30_000,
  });

  const exportMut = useMutation({
    mutationFn: () => fnExport({ data: { scope: "admin", shopId, status: "any" } }),
    onSuccess: (r) => { downloadBase64(r.base64, r.fileName, r.mime); toast.success(`Export : ${r.count} produits`); },
    onError: (e: Error) => toast.error(`Export echoue : ${e.message}`),
  });

  const templateMut = useMutation({
    mutationFn: () => fnTemplate({}),
    onSuccess: (r) => { downloadBase64(r.base64, r.fileName, r.mime); toast.success("Modele telecharge"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const previewMut = useMutation({
    mutationFn: async () => {
      if (!excelFile) throw new Error("Selectionnez un fichier Excel/CSV");
      const fileBase64 = await fileToBase64(excelFile);
      const zipBase64 = zipFile ? await fileToBase64(zipFile) : undefined;
      return fnPreview({ data: { scope: "admin", shopId, fileBase64, fileName: excelFile.name, zipBase64 } });
    },
    onSuccess: (r) => { setPreview(r); toast.success(`Previsualisation : ${r.summary.totalRows} lignes`); },
    onError: (e: Error) => toast.error(e.message),
  });

  const commitMut = useMutation({
    mutationFn: () => fnCommit({ data: { scope: "admin", shopId, fileBase64: preview!.fileBase64, fileName: excelFile!.name, zipBase64: preview!.zipBase64 } }),
    onSuccess: (r) => { toast.success(`${r.inserted} produits importes`); setPreview(null); setExcelFile(null); setZipFile(null); qc.invalidateQueries({ queryKey: ["product-imports"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── IA state ──
  const [iaTab, setIaTab] = useState<"store" | "product">("store");
  const [storeUrl, setStoreUrl] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [iaProducts, setIaProducts] = useState<ImportProduct[]>([]);
  const [iaLoading, setIaLoading] = useState(false);
  const [iaError, setIaError] = useState<string | null>(null);
  const [iaHasMore, setIaHasMore] = useState(false);

  const startFn = useServerFn(startStoreImport);
  const fetchBatchFn = useServerFn(fetchNextProductBatch);
  const importSingleFn = useServerFn(importSingleProduct);

  // ── Drafts state ──
  const [search, setSearch] = useState("");
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("draft");
  const [page, setPage] = useState(1);
  const [editingProduct, setEditingProduct] = useState<ImportProduct | null>(null);

  const listBatchesFn = useServerFn(listImportBatches);
  const listDraftsFn = useServerFn(listImportDrafts);
  const updateFn = useServerFn(updateImportDraft);
  const publishFn = useServerFn(publishImportDraft);
  const discardFn = useServerFn(discardImportDraft);
  const deleteBatchFn = useServerFn(deleteImportBatch);

  const { data: batches } = useQuery({
    queryKey: ["admin-import-batches"],
    queryFn: () => listBatchesFn({ data: {} }),
  });

  const { data: draftsData, isLoading: draftsLoading } = useQuery({
    queryKey: ["admin-import-drafts", batchFilter, statusFilter, search, page],
    queryFn: () => listDraftsFn({ data: {
      batch_id: batchFilter === "all" ? null : batchFilter,
      status: statusFilter as "draft" | "published" | "discarded" | null,
      q: search, page, pageSize: 20,
    }}),
  });

  // ── Handlers ──
  const handleStartStore = async () => {
    if (!storeUrl.trim()) { toast.error("Collez un lien de boutique"); return; }
    setIaLoading(true); setIaError(null);
    try {
      const result = await startFn({ data: { store_url: storeUrl.trim() } }) as any;
      setBatchId(result.batchId);
      if (result.resumed) toast.info(`${result.totalImported} produits deja importes`);
      await loadNextBatch(result.batchId);
    } catch (e: any) { setIaError(e.message || "Erreur"); toast.error(e.message); }
    finally { setIaLoading(false); }
  };

  const loadNextBatch = async (bid: string) => {
    setIaLoading(true);
    try {
      const result = await fetchBatchFn({ data: { batch_id: bid, limit: 10 } }) as any;
      setIaProducts((prev) => [...prev, ...(result.products || [])]);
      setIaHasMore(result.hasMore);
      toast.success(`${(result.products || []).length} produits importes`);
    } catch (e: any) { setIaError(e.message); toast.error(e.message); }
    finally { setIaLoading(false); }
  };

  const handleImportSingle = async () => {
    const url = productUrl.trim();
    if (!url) { toast.error("Collez un lien produit"); return; }
    const links = url.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("http"));
    if (links.length === 0) { toast.error("Aucun lien valide"); return; }

    setIaLoading(true); setIaError(null);
    try {
      for (const link of links.slice(0, 10)) {
        const result = await importSingleFn({ data: { product_url: link } }) as any;
        if (result.duplicate) toast.warning(`Doublon : ${link.slice(0, 40)}`);
        else setIaProducts((prev) => [...prev, result.product]);
      }
      toast.success(`${Math.min(links.length, 10)} produit(s) traite(s)`);
      setProductUrl("");
    } catch (e: any) { setIaError(e.message); toast.error(e.message); }
    finally { setIaLoading(false); }
  };

  const handlePublish = async (id: string) => {
    try { await publishFn({ data: { id } }); toast.success("Produit publie !"); qc.invalidateQueries({ queryKey: ["admin-import-drafts"] }); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleDiscard = async (id: string) => {
    try { await discardFn({ data: { id } }); toast.success("Brouillon supprime"); qc.invalidateQueries({ queryKey: ["admin-import-drafts"] }); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleDeleteBatch = async (id: string) => {
    if (!window.confirm("Supprimer cet import et tous ses produits ?")) return;
    try { await deleteBatchFn({ data: { id } }); toast.success("Import supprime"); qc.invalidateQueries({ queryKey: ["admin-import-batches", "admin-import-drafts"] }); }
    catch (e: any) { toast.error(e.message); }
  };

  const iaReset = useCallback(() => {
    setStoreUrl(""); setProductUrl(""); setBatchId(null);
    setIaProducts([]); setIaHasMore(false); setIaError(null);
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Package className="h-5 w-5" /> Importation de produits
        </h1>
        <p className="text-xs text-muted-foreground">
          Importez des produits depuis Excel/CSV ou depuis Taobao/1688 avec l'IA.
        </p>
      </div>

      {/* Main Tabs */}
      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as "excel" | "ia" | "drafts")}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="excel" className="gap-1.5">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel / CSV
          </TabsTrigger>
          <TabsTrigger value="ia" className="gap-1.5">
            <Bot className="h-3.5 w-3.5" /> Import IA Taobao/1688
          </TabsTrigger>
          <TabsTrigger value="drafts" className="gap-1.5">
            <Package className="h-3.5 w-3.5" /> Brouillons
            {draftsData?.total ? <Badge variant="secondary" className="ml-1 text-[10px]">{draftsData.total}</Badge> : null}
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: EXCEL / CSV ── */}
        <TabsContent value="excel" className="space-y-4 pt-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" /> Import Excel / CSV
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => templateMut.mutate()} disabled={templateMut.isPending}>
                  <Download className="mr-1 h-3.5 w-3.5" /> Modele
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportMut.mutate()} disabled={exportMut.isPending}>
                  <Upload className="mr-1 h-3.5 w-3.5" /> Exporter
                </Button>
              </div>

              <Separator />

              {/* Upload */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Fichier Excel ou CSV</label>
                <Input ref={excelInput} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { setExcelFile(e.target.files?.[0] ?? null); setPreview(null); }} />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Images ZIP (optionnel)</label>
                <Input ref={zipInput} type="file" accept=".zip" onChange={(e) => setZipFile(e.target.files?.[0] ?? null)} />
              </div>

              <Button onClick={() => previewMut.mutate()} disabled={!excelFile || previewMut.isPending} className="w-full gap-1">
                {previewMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Table2 className="h-4 w-4" />}
                Previsualiser
              </Button>

              {/* Preview */}
              {preview && (
                <div className="space-y-3 rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">Previsualisation</h4>
                    <Badge variant={preview.summary.errors > 0 ? "destructive" : "default"}>
                      {preview.summary.valid} valides / {preview.summary.errors} erreurs
                    </Badge>
                  </div>
                  {preview.rows.length > 0 && (
                    <div className="max-h-60 overflow-auto text-xs">
                      <table className="w-full">
                        <thead><tr className="border-b">
                          {Object.keys(preview.rows[0].parsed).map((k) => <th key={k} className="text-left p-1">{k}</th>)}
                        </tr></thead>
                        <tbody>
                          {preview.rows.slice(0, 10).map((row, i) => (
                            <tr key={i} className="border-b">
                              {Object.values(row.parsed).map((v, j) => <td key={j} className="p-1">{String(v).slice(0, 30)}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <Button onClick={() => commitMut.mutate()} disabled={commitMut.isPending || preview.summary.valid === 0} className="w-full">
                    {commitMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Importer {preview.summary.valid} produits
                  </Button>
                </div>
              )}

              {/* History */}
              {history.data && history.data.length > 0 && (
                <>
                  <Separator />
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground">Historique</h4>
                  <div className="space-y-1">
                    {history.data.slice(0, 5).map((h: any) => (
                      <div key={h.id} className="flex justify-between text-xs border-b py-1">
                        <span>{h.file_name} — {h.inserted_count} produits</span>
                        <Badge variant="outline" className="text-[10px]">{h.status}</Badge>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 2: IMPORT IA ── */}
        <TabsContent value="ia" className="space-y-4 pt-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Import IA depuis Taobao / 1688
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs value={iaTab} onValueChange={(v) => { setIaTab(v as "store" | "product"); iaReset(); }}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="store" className="gap-1"><Store className="h-3.5 w-3.5" /> Lien boutique</TabsTrigger>
                  <TabsTrigger value="product" className="gap-1"><Link2 className="h-3.5 w-3.5" /> Lien(s) produit</TabsTrigger>
                </TabsList>

                {/* Store import */}
                <TabsContent value="store" className="space-y-3 pt-3">
                  {!batchId ? (
                    <>
                      <div>
                        <label className="text-xs text-muted-foreground">Lien boutique Taobao / 1688</label>
                        <Input value={storeUrl} onChange={(e) => setStoreUrl(e.target.value)} placeholder="https://shop123456.taobao.com/..." />
                      </div>
                      <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                        <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
                        <strong>Note :</strong> Taobao et 1688 protegent leurs pages boutique contre le scraping.
                        Si l'import echoue, utilisez l'onglet "Lien(s) produit" pour coller les liens manuellement.
                      </div>
                      <Button onClick={handleStartStore} disabled={iaLoading} className="w-full gap-2">
                        {iaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        Demarrer l'import
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between rounded-lg bg-primary/5 p-3 text-sm">
                        <span className="font-medium">{iaProducts.length} produits importes</span>
                      </div>
                      {iaHasMore && (
                        <Button onClick={() => batchId && loadNextBatch(batchId)} disabled={iaLoading} className="w-full gap-2">
                          {iaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                          Charger 10 suivants
                        </Button>
                      )}
                      {!iaHasMore && iaProducts.length > 0 && (
                        <Badge variant="secondary" className="w-full justify-center py-2"><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Termine</Badge>
                      )}
                    </>
                  )}
                </TabsContent>

                {/* Product import */}
                <TabsContent value="product" className="space-y-3 pt-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Lien(s) produit (un par ligne, max 10)</label>
                    <Textarea value={productUrl} onChange={(e) => setProductUrl(e.target.value)} placeholder="https://item.taobao.com/item.htm?id=...&#10;https://detail.1688.com/offer/..." rows={4} />
                  </div>
                  <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
                    <strong>Conseil :</strong> Sur Taobao/1688, ouvrez la page produit, copiez l'URL et collez-la ici.
                    L'IA analysera automatiquement le produit.
                  </div>
                  <Button onClick={handleImportSingle} disabled={iaLoading} className="w-full gap-2">
                    {iaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Importer
                  </Button>
                </TabsContent>
              </Tabs>

              {/* Error */}
              {iaError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  {iaError}
                </div>
              )}

              {/* Preview */}
              {iaProducts.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground">Produits importes ({iaProducts.length})</h4>
                  <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-1">
                    {iaProducts.map((p) => <IaProductCard key={p.id} product={p} />)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 3: BROUILLONS ── */}
        <TabsContent value="drafts" className="space-y-4 pt-3">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Brouillons" value={(batches as ImportBatch[])?.reduce((s, b) => s + b.total_imported, 0) ?? 0} icon={<Package className="h-4 w-4" />} />
            <StatCard label="Imports" value={(batches as ImportBatch[])?.length ?? 0} icon={<Store className="h-4 w-4" />} />
            <StatCard label="Pages" value={page} icon={<RefreshCw className="h-4 w-4" />} />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <Select value={batchFilter} onValueChange={setBatchFilter}>
              <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les imports</SelectItem>
                {(batches as ImportBatch[] ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.store_name || b.store_url.slice(0, 30)} ({b.total_imported})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Brouillons</SelectItem>
                <SelectItem value="published">Publies</SelectItem>
                <SelectItem value="discarded">Ignores</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1 min-w-[200px]">
              <Input placeholder="Rechercher..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="h-8 text-xs" />
            </div>
          </div>

          {/* List */}
          {draftsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement...</div>
          ) : (draftsData?.products ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed p-10 text-center">
              <Package className="mx-auto h-10 w-10 text-muted-foreground opacity-60" />
              <p className="mt-2 text-sm font-semibold">Aucun brouillon</p>
              <p className="text-xs text-muted-foreground">Importez des produits via l'onglet "Import IA".</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(draftsData?.products ?? []).map((p: ImportProduct) => (
                <DraftProductCard key={p.id} product={p} onEdit={() => setEditingProduct(p)} onPublish={() => handlePublish(p.id)} onDiscard={() => handleDiscard(p.id)} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit dialog */}
      {editingProduct && (
        <EditProductDialog product={editingProduct} onClose={() => setEditingProduct(null)} onSave={async (id, patch) => {
          await updateFn({ data: { id, ...patch } }); qc.invalidateQueries({ queryKey: ["admin-import-drafts"] }); setEditingProduct(null); toast.success("Modifications enregistrees");
        }} />
      )}
    </div>
  );
}

// ── Sub-components ──

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-3 bg-primary/5">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">{icon}<span className="text-[10px] font-medium uppercase tracking-wide">{label}</span></div>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function IaProductCard({ product }: { product: ImportProduct }) {
  const isDup = !!product.duplicate_of;
  return (
    <Card className={isDup ? "border-amber-300" : ""}>
      <CardContent className="p-3 flex gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
          {product.images[0] ? <img src={product.images[0]} alt="" className="h-full w-full object-cover" loading="lazy" /> : <ImageIcon className="m-auto mt-4 h-6 w-6 text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium truncate">{product.name || "Sans nom"}</p>
            {isDup && <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 shrink-0"><AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> Doublon</Badge>}
          </div>
          <p className="text-[11px] text-muted-foreground truncate">{product.source_url.slice(0, 50)}...</p>
          <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px]">
            <span>Source: {product.source_price > 0 ? `${product.source_price} ${product.source_currency}` : "—"}</span>
            <span className="text-primary font-medium">Vente: {fmtFcfa(product.price)}</span>
            {product.suggested_category_name && <Badge variant="secondary" className="text-[10px]">{product.suggested_category_name}</Badge>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DraftProductCard({ product, onEdit, onPublish, onDiscard }: { product: ImportProduct; onEdit: () => void; onPublish: () => void; onDiscard: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const isDup = !!product.duplicate_of;
  return (
    <Card className={isDup ? "border-amber-300" : ""}>
      <CardContent className="p-3">
        <div className="flex gap-3">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
            {product.images[0] ? <img src={product.images[0]} alt="" className="h-full w-full object-cover" loading="lazy" /> : <ImageIcon className="m-auto mt-4 h-6 w-6 text-muted-foreground" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium truncate">{product.name || "Sans nom"}</p>
              {isDup && <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 shrink-0"><AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> Doublon</Badge>}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px]">
              <span className="text-primary font-medium">{fmtFcfa(product.price)}</span>
              {product.suggested_category_name && <Badge variant="secondary" className="text-[10px]">{product.suggested_category_name}</Badge>}
              {product.variants.length > 0 && <span className="text-muted-foreground">{product.variants.length} variantes</span>}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setExpanded(!expanded)}>
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} Details
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onEdit}><Edit3 className="h-3 w-3" /> Modifier</Button>
              {!isDup && <Button size="sm" className="h-7 text-xs gap-1" onClick={onPublish}><CheckCircle2 className="h-3 w-3" /> Publier</Button>}
              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive gap-1" onClick={onDiscard}><XCircle className="h-3 w-3" /> Ignorer</Button>
            </div>
          </div>
        </div>
        {expanded && (
          <div className="mt-3 space-y-2 border-t pt-3">
            {product.description && <p className="text-xs text-muted-foreground">{product.description}</p>}
            <div className="flex flex-wrap gap-1">
              {product.images.slice(0, 8).map((img, i) => <img key={i} src={img} alt="" className="h-12 w-12 rounded object-cover border" loading="lazy" />)}
            </div>
            {product.variants.length > 0 && <div className="text-xs"><strong>Variantes:</strong> {product.variants.map((v) => `${v.color}${v.size ? ` (${v.size})` : ""}`).join(", ")}</div>}
            <a href={product.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><ExternalLink className="h-3 w-3" /> Voir la source</a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EditProductDialog({ product, onClose, onSave }: { product: ImportProduct; onClose: () => void; onSave: (id: string, patch: Record<string, unknown>) => void }) {
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description);
  const [price, setPrice] = useState(String(product.price));
  const [sourcePrice, setSourcePrice] = useState(String(product.source_price));
  const [variants, setVariants] = useState(product.variants);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(product.id, { name: name.trim(), description: description.trim(), price: Number(price) || 0, source_price: Number(sourcePrice) || 0, variants });
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Edit3 className="h-4 w-4" /> Modifier le brouillon</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><label className="text-xs text-muted-foreground">Nom</label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-muted-foreground">Prix source ({product.source_currency})</label><Input type="number" value={sourcePrice} onChange={(e) => setSourcePrice(e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground">Prix vente (FCFA)</label><Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          </div>
          <div><label className="text-xs text-muted-foreground">Description</label><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          {variants.length > 0 && (
            <div>
              <label className="text-xs text-muted-foreground">Variantes ({variants.length})</label>
              <div className="space-y-1 mt-1">
                {variants.map((v, i) => (
                  <div key={i} className="flex gap-2 text-xs">
                    <Input value={v.size} onChange={(e) => { const nv = [...variants]; nv[i] = { ...v, size: e.target.value }; setVariants(nv); }} placeholder="Taille" className="h-7 text-xs" />
                    <Input value={v.color} onChange={(e) => { const nv = [...variants]; nv[i] = { ...v, color: e.target.value }; setVariants(nv); }} placeholder="Couleur" className="h-7 text-xs" />
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving} className="flex-1 gap-1">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}<span className={saving ? "opacity-50" : ""}>{saving ? "Enregistrement..." : "Enregistrer"}</span></Button>
            <Button variant="outline" onClick={onClose}>Annuler</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
