/**
 * admin.imports.tsx
 * -----------------
 * Page fusionnee : Import Excel + Import IA (Taobao/1688)
 * Aucune table SQL necessaire - tout fonctionne en memoire + localStorage
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Package, Globe, Trash2, Edit3, CheckCircle2, XCircle,
  ExternalLink, ImageIcon, Loader2, AlertTriangle,
  Store, ChevronDown, ChevronUp, Save, FileSpreadsheet,
  Download, Table2, Sparkles, Link2, Play,
  Bot, RefreshCw,
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
  exportProducts,
  downloadTemplate,
  previewImport,
  commitImport,
  listImports,
} from "@/lib/import-export.functions";
import {
  scrapeProductForAi,
  publishImportedDraft,
  listAdminShops,
  discoverShopProductLinks,
  cleanupFalseTaobaoImports,
  type AiDraft,
  type ImportUiLog,
} from "@/lib/admin-ai-import.functions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

// ── Types ──
interface DraftProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  sourcePrice: number;
  sourceCurrency: string;
  images: string[];
  variants: { size: string; color: string; colorHex: string; stock: number }[];
  sourceUrl: string;
  categoryId: string | null;
  categoryName: string | null;
  importLog?: ImportUiLog;
  status: "draft" | "published" | "discarded";
  createdAt: number;
}

// ── localStorage helpers ──
const LS_KEY = "kawzone_import_drafts";
function loadDrafts(): DraftProduct[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((d): d is DraftProduct => Boolean(d && typeof d === "object" && typeof d.name === "string" && Array.isArray(d.images) && Array.isArray(d.variants) && typeof d.sourceUrl === "string"))
      : [];
  } catch { return []; }
}
function saveDrafts(drafts: DraftProduct[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(drafts));
}

function isInvalidTaobaoDraft(draft: DraftProduct): boolean {
  const text = `${draft.name}\n${draft.description}`.toLowerCase();
  const badText = /登录|登陆|亲，请登录|connexion|login|sign in|验证码|captcha|安全验证|security check|访问受限|sec\.taobao|punish/i.test(text);
  const badTitle = /^(登录|登陆|login|connexion|tmall|taobao)$/i.test(draft.name.trim());
  const badImages = !Array.isArray(draft.images) || draft.images.length === 0 || draft.images.every((url) => /logo|icon|sprite|captcha|login|blank|pixel|taobao/i.test(url));
  return badTitle || badText || draft.price <= 0 || badImages;
}

// ── Simple ID generator ──
let _id = Date.now();
function uid() { return `draft-${++_id}`; }

// Note: scraping IA is now server-side in src/lib/admin-ai-import.functions.ts
// (uses LOVABLE_API_KEY server-side, anti-doublons, mapping catégories existantes).


function AdminImports() {
  const qc = useQueryClient();
  const [mainTab, setMainTab] = useState<"excel" | "ia" | "drafts">("excel");

  // ── Drafts state (localStorage) ──
  const [drafts, setDrafts] = useState<DraftProduct[]>(loadDrafts);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => { saveDrafts(drafts.filter((draft) => !isInvalidTaobaoDraft(draft))); }, [drafts]);

  // ── Excel state ──
  const fnExport = useServerFn(exportProducts);
  const fnTemplate = useServerFn(downloadTemplate);
  const fnPreview = useServerFn(previewImport);
  const fnCommit = useServerFn(commitImport);
  const fnHistory = useServerFn(listImports);

  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const excelInput = useRef<HTMLInputElement>(null);

  const history = useQuery({
    queryKey: ["product-imports", "admin"],
    queryFn: () => fnHistory({ data: {} }),
    staleTime: 30_000,
  });

  // ── IA Import state ──
  const [iaTab, setIaTab] = useState<"store" | "product">("product");
  const [productUrl, setProductUrl] = useState("");
  const [iaLoading, setIaLoading] = useState(false);
  const [justImported, setJustImported] = useState<DraftProduct[]>([]);
  const [selectedShopId, setSelectedShopId] = useState<string>("");
  const [storeUrl, setStoreUrl] = useState("");
  const [storeLimit, setStoreLimit] = useState(10);
  const [storeLoading, setStoreLoading] = useState(false);
  const [importLogs, setImportLogs] = useState<ImportUiLog[]>([]);
  const [storeProgress, setStoreProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const cleanupRan = useRef(false);

  const fnScrape = useServerFn(scrapeProductForAi);
  const fnPublish = useServerFn(publishImportedDraft);
  const fnListShops = useServerFn(listAdminShops);
  const fnDiscover = useServerFn(discoverShopProductLinks);
  const fnCleanupFalse = useServerFn(cleanupFalseTaobaoImports);

  const shopsQuery = useQuery({
    queryKey: ["admin-shops-for-import"],
    queryFn: () => fnListShops({}),
    staleTime: 60_000,
  });

  useEffect(() => {
    const shops = shopsQuery.data;
    if (shops && shops.length > 0 && !selectedShopId) setSelectedShopId(shops[0].id);
  }, [shopsQuery.data, selectedShopId]);

  useEffect(() => {
    if (cleanupRan.current) return;
    cleanupRan.current = true;
    setDrafts(prev => prev.filter((draft) => !isInvalidTaobaoDraft(draft)));
    fnCleanupFalse({})
      .then((r) => { if (r.deleted > 0) toast.success(`${r.deleted} faux import(s) supprimé(s)`); })
      .catch(() => undefined);
  }, [fnCleanupFalse]);

  const pushImportLog = useCallback((log: AiDraft["importLog"], sourceUrl?: string) => {
    const entry: ImportUiLog = {
      ...log,
      initialUrl: log.initialUrl || sourceUrl || "",
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: Date.now(),
    };
    setImportLogs(prev => [entry, ...prev].slice(0, 80));
    return entry;
  }, []);

  // ── Handlers ──
  const handleImportSingle = async () => {
    if (!selectedShopId) { toast.error("Sélectionnez d'abord une boutique admin"); return; }
    const urls = productUrl.split("\n").map(l => l.trim()).filter(l => l.startsWith("http"));
    if (urls.length === 0) { toast.error("Aucun lien valide"); return; }

    setIaLoading(true);
    const imported: DraftProduct[] = [];
    let dupCount = 0;
    try {
      for (const url of urls.slice(0, 10)) {
        const t = toast.loading(`Analyse de ${url.slice(0, 40)}...`);
        try {
          const ai: AiDraft = await fnScrape({ data: { url, shopId: selectedShopId } });
          toast.dismiss(t);
          const importLog = pushImportLog(ai.importLog, url);
          if (ai.isDuplicate) {
            dupCount++;
            toast.warning(`Doublon ignoré : ${url.slice(0, 40)}`);
            continue;
          }
          const draft: DraftProduct = {
            id: uid(),
            name: ai.name,
            description: ai.description,
            price: ai.price,
            sourcePrice: ai.sourcePrice,
            sourceCurrency: ai.sourceCurrency,
            images: ai.images,
            variants: ai.variants,
            sourceUrl: ai.sourceUrl,
            categoryId: ai.categoryId,
            categoryName: ai.categoryName,
            importLog,
            status: "draft",
            createdAt: Date.now(),
          };
          if (isInvalidTaobaoDraft(draft)) throw new Error("Données invalides détectées : brouillon non créé.");
          imported.push(draft);
          setDrafts(prev => [draft, ...prev.filter((d) => d.sourceUrl !== draft.sourceUrl)]);
        } catch (e: unknown) {
          toast.dismiss(t);
          const msg = e instanceof Error ? e.message : "Erreur";
          toast.error(`${url.slice(0, 30)}: ${msg}`);
        }
      }
      setJustImported(imported);
      setProductUrl("");
      toast.success(`${imported.length} importé(s)${dupCount ? ` · ${dupCount} doublon(s) ignoré(s)` : ""}`);
    } finally {
      setIaLoading(false);
    }
  };

  const handlePublish = async (draft: DraftProduct) => {
    if (!selectedShopId) { toast.error("Sélectionnez une boutique"); return; }
    try {
      const r = await fnPublish({
        data: {
          shopId: selectedShopId,
          draft: {
            name: draft.name,
            description: draft.description,
            price: draft.price,
            images: draft.images,
            variants: draft.variants,
            sourceUrl: draft.sourceUrl,
            categoryId: draft.categoryId,
          },
        },
      });
      if (r.duplicate) {
        toast.warning("Doublon : ce produit existe déjà");
      } else {
        toast.success("Produit publié !");
      }
      setDrafts(prev => prev.filter(d => d.id !== draft.id));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };


  const handleDiscard = (id: string) => {
    setDrafts(prev => prev.filter(d => d.id !== id));
    toast.success("Brouillon supprime");
  };

  const handleUpdateDraft = (id: string, patch: Partial<DraftProduct>) => {
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));
  };

  const activeDrafts = drafts.filter(d => d.status === "draft");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Package className="h-5 w-5" /> Importation de produits
        </h1>
        <p className="text-xs text-muted-foreground">
          Importez des produits depuis Excel/CSV ou depuis Taobao/1688 avec l&apos;IA.
        </p>
      </div>

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
            {activeDrafts.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px]">{activeDrafts.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: EXCEL ── */}
        <TabsContent value="excel" className="space-y-4 pt-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" /> Import Excel / CSV
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => fnTemplate({}).then((r: any) => downloadBase64(r.base64, r.fileName, r.mime)).catch(() => toast.error("Erreur"))}>
                  <Download className="mr-1 h-3.5 w-3.5" /> Modele
                </Button>
                <Button variant="outline" size="sm" onClick={() => fnExport({ data: { scope: "admin", status: "any" } }).then((r: any) => downloadBase64(r.base64, r.fileName, r.mime)).catch(() => toast.error("Erreur"))}>
                  <Table2 className="mr-1 h-3.5 w-3.5" /> Exporter
                </Button>
              </div>
              <Separator />
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Fichier Excel ou CSV</label>
                <Input ref={excelInput} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { setExcelFile(e.target.files?.[0] ?? null); setPreview(null); }} />
              </div>
              <Button
                onClick={async () => {
                  if (!excelFile) return;
                  if (!selectedShopId) { toast.error("Sélectionnez d'abord une boutique admin"); return; }
                  setPreviewLoading(true);
                  try {
                    const fileBase64 = await fileToBase64(excelFile);
                    const r = await fnPreview({ data: { scope: "admin", shopId: selectedShopId, fileBase64, fileName: excelFile.name } });
                    setPreview(r);
                  } catch (e: any) { toast.error(e.message); }
                  setPreviewLoading(false);
                }}
                disabled={!excelFile || previewLoading}
                className="w-full"
              >
                {previewLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Table2 className="h-4 w-4 mr-1" />}
                Previsualiser
              </Button>

              {preview && (
                <div className="rounded-lg border p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">Previsualisation</h4>
                    <Badge variant={preview.summary?.errors > 0 ? "destructive" : "default"}>
                      {preview.summary?.valid || 0} valides / {preview.summary?.errors || 0} erreurs
                    </Badge>
                  </div>
                  <Button
                    onClick={async () => {
                      try {
                        const fileBase64 = await fileToBase64(excelFile!);
                        await fnCommit({ data: { importId: preview.importId } });
                        toast.success("Importe !");
                        setPreview(null); setExcelFile(null);
                      } catch (e: any) { toast.error(e.message); }
                    }}
                    className="w-full"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Importer {preview.summary?.valid || 0} produits
                  </Button>
                </div>
              )}

              {history.data && history.data.rows.length > 0 && (
                <>
                  <Separator />
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground">Historique</h4>
                  <div className="space-y-1">
                    {history.data.rows.slice(0, 5).map((h) => (
                      <div key={h.id} className="flex justify-between text-xs border-b py-1">
                        <span>{h.file_name}</span>
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
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Boutique de publication</label>
                <Select value={selectedShopId} onValueChange={setSelectedShopId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={shopsQuery.isLoading ? "Chargement..." : "Choisir une boutique admin"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(shopsQuery.data ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {shopsQuery.data && shopsQuery.data.length === 0 && (
                  <p className="text-[11px] text-destructive">Aucune boutique admin. Créez-en une dans &quot;Boutiques admin&quot;.</p>
                )}
              </div>
              <Separator />
              <Tabs value={iaTab} onValueChange={(v) => setIaTab(v as "store" | "product")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="store" className="gap-1"><Store className="h-3.5 w-3.5" /> Lien boutique</TabsTrigger>
                  <TabsTrigger value="product" className="gap-1"><Link2 className="h-3.5 w-3.5" /> Lien(s) produit</TabsTrigger>
                </TabsList>

                <TabsContent value="store" className="space-y-3 pt-3">
                  <div>
                    <label className="text-xs text-muted-foreground">URL de la boutique Taobao / 1688</label>
                    <Input
                      value={storeUrl}
                      onChange={(e) => setStoreUrl(e.target.value)}
                      placeholder="https://shop123456.taobao.com  ou  https://xxx.1688.com"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">Nombre max de produits</label>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={storeLimit}
                      onChange={(e) => setStoreLimit(Math.min(50, Math.max(1, Number(e.target.value) || 10)))}
                      className="w-20 h-8"
                    />
                  </div>
                  <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
                    <strong>Comment ça marche :</strong> on découvre les liens produits de la boutique
                    via Firecrawl, puis chaque produit est analysé par l&apos;IA et ajouté aux brouillons.
                    Les doublons sont automatiquement ignorés.
                  </div>
                  {storeProgress.total > 0 && storeLoading && (
                    <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                      Produit {storeProgress.current} / {storeProgress.total}
                    </div>
                  )}
                  <Button
                    onClick={async () => {
                      if (!selectedShopId) { toast.error("Sélectionnez d'abord une boutique admin"); return; }
                      if (!storeUrl.startsWith("http")) { toast.error("URL invalide"); return; }
                      setStoreLoading(true);
                      setStoreProgress({ current: 0, total: 0 });
                      const t = toast.loading("Découverte des produits...");
                      try {
                        const r = await fnDiscover({ data: { shopUrl: storeUrl, limit: storeLimit } });
                        toast.dismiss(t);
                        if (r.urls.length === 0) {
                          toast.error("Aucun lien produit trouvé sur cette boutique");
                          setStoreLoading(false);
                          return;
                        }
                        toast.success(`${r.urls.length} produit(s) trouvé(s) — analyse IA…`);
                        const imported: DraftProduct[] = [];
                        let dupCount = 0;
                        let failedCount = 0;
                        const seen = new Set<string>();
                        const urls = r.urls.filter((url) => !seen.has(url) && seen.add(url));
                        setStoreProgress({ current: 0, total: urls.length });
                        for (const [index, url] of urls.entries()) {
                          setStoreProgress({ current: index + 1, total: urls.length });
                          try {
                            const ai: AiDraft = await fnScrape({ data: { url, shopId: selectedShopId } });
                            const importLog = pushImportLog(ai.importLog, url);
                            if (ai.isDuplicate) { dupCount++; continue; }
                            const draft: DraftProduct = {
                              id: uid(),
                              name: ai.name,
                              description: ai.description,
                              price: ai.price,
                              sourcePrice: ai.sourcePrice,
                              sourceCurrency: ai.sourceCurrency,
                              images: ai.images,
                              variants: ai.variants,
                              sourceUrl: ai.sourceUrl,
                              categoryId: ai.categoryId,
                              categoryName: ai.categoryName,
                              importLog,
                              status: "draft",
                              createdAt: Date.now(),
                            };
                            if (isInvalidTaobaoDraft(draft)) throw new Error("Données invalides détectées : brouillon non créé.");
                            imported.push(draft);
                            setDrafts(prev => [draft, ...prev.filter((d) => d.sourceUrl !== draft.sourceUrl)]);
                          } catch (e: unknown) {
                            failedCount++;
                            const msg = e instanceof Error ? e.message : "Import bloqué";
                            toast.error(`${url.slice(0, 34)}: ${msg}`);
                          }
                        }
                        setJustImported(imported);
                        setStoreUrl("");
                        toast.success(`${imported.length} brouillon(s) créé(s)${dupCount ? ` · ${dupCount} doublon(s)` : ""}${failedCount ? ` · ${failedCount} bloqué(s)` : ""}`);
                      } catch (e: unknown) {
                        toast.dismiss(t);
                        toast.error(e instanceof Error ? e.message : "Erreur");
                      } finally {
                        setStoreLoading(false);
                        setStoreProgress({ current: 0, total: 0 });
                      }
                    }}
                    disabled={storeLoading}
                    className="w-full gap-2"
                  >
                    {storeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    {storeLoading ? "Import en cours..." : "Lancer l'import de la boutique"}
                  </Button>
                </TabsContent>


                <TabsContent value="product" className="space-y-3 pt-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Lien(s) produit (un par ligne, max 10)</label>
                    <Textarea
                      value={productUrl}
                      onChange={(e) => setProductUrl(e.target.value)}
                      placeholder="https://item.taobao.com/item.htm?id=...&#10;https://detail.1688.com/offer/..."
                      rows={4}
                    />
                  </div>
                  <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
                    <strong>Conseil :</strong> Ouvrez la page produit sur Taobao/1688, copiez l&apos;URL et collez-la ici.
                    L&apos;IA analysera automatiquement le produit et creera un brouillon.
                  </div>
                  <Button onClick={handleImportSingle} disabled={iaLoading} className="w-full gap-2">
                    {iaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {iaLoading ? "Analyse en cours..." : "Importer avec l'IA"}
                  </Button>
                </TabsContent>
              </Tabs>

              {justImported.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground">Produits importes ({justImported.length})</h4>
                  {justImported.map((p) => <DraftCard key={p.id} draft={p} onPublish={() => handlePublish(p)} onDiscard={() => { handleDiscard(p.id); setJustImported(prev => prev.filter(x => x.id !== p.id)); }} onEdit={() => setEditingId(p.id)} />)}
                </div>
              )}

              {importLogs.length > 0 && (
                <div className="space-y-2 rounded-lg border p-3">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground">Logs d&apos;import</h4>
                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {importLogs.slice(0, 20).map((log) => (
                      <div key={log.id} className="rounded-md bg-muted/40 p-2 text-[11px]">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant={log.status === "success" ? "default" : "destructive"} className="text-[10px]">{log.status}</Badge>
                          <Badge variant="outline" className="text-[10px]">{log.source}</Badge>
                          <span className="text-muted-foreground">{new Date(log.createdAt).toLocaleTimeString("fr-FR")}</span>
                        </div>
                        <p className="mt-1 break-all text-muted-foreground">Initiale : {log.initialUrl}</p>
                        <p className="break-all text-muted-foreground">Finale : {log.finalUrl}</p>
                        <p className="mt-1 font-medium">{log.reason}</p>
                        {log.issues.length > 0 && <p className="text-muted-foreground">{log.issues.join(" · ")}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 3: BROUILLONS ── */}
        <TabsContent value="drafts" className="space-y-4 pt-3">
          {activeDrafts.length === 0 ? (
            <div className="rounded-xl border border-dashed p-10 text-center">
              <Package className="mx-auto h-10 w-10 text-muted-foreground opacity-60" />
              <p className="mt-2 text-sm font-semibold">Aucun brouillon</p>
              <p className="text-xs text-muted-foreground">Importez des produits via l&apos;onglet &quot;Import IA&quot;.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeDrafts.map((d) => (
                <DraftCard key={d.id} draft={d} onPublish={() => handlePublish(d)} onDiscard={() => handleDiscard(d.id)} onEdit={() => setEditingId(d.id)} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit dialog */}
      {editingId && (
        <EditDialog
          draft={drafts.find(d => d.id === editingId)!}
          onClose={() => setEditingId(null)}
          onSave={(patch) => { handleUpdateDraft(editingId, patch); setEditingId(null); }}
        />
      )}
    </div>
  );
}

// ── Draft Card ──
function DraftCard({ draft, onPublish, onDiscard, onEdit }: { draft: DraftProduct; onPublish: () => void; onDiscard: () => void; onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex gap-3">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
            {draft.images[0] ? <img src={draft.images[0]} alt="" className="h-full w-full object-cover" loading="lazy" /> : <ImageIcon className="m-auto mt-4 h-6 w-6 text-muted-foreground" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{draft.name || "Sans nom"}</p>
            <p className="text-[11px] text-muted-foreground truncate">{draft.sourceUrl.slice(0, 50)}...</p>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px]">
              <span className="text-primary font-medium">{fmtFcfa(draft.price)}</span>
              {draft.categoryName && <Badge variant="secondary" className="text-[10px]">{draft.categoryName}</Badge>}
              {draft.variants.length > 0 && <span className="text-muted-foreground">{draft.variants.length} variantes</span>}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setExpanded(!expanded)}>
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} Details
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onEdit}><Edit3 className="h-3 w-3" /> Modifier</Button>
              <Button size="sm" className="h-7 text-xs gap-1" onClick={onPublish}><CheckCircle2 className="h-3 w-3" /> Publier</Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive gap-1" onClick={onDiscard}><XCircle className="h-3 w-3" /> Ignorer</Button>
            </div>
          </div>
        </div>
        {expanded && (
          <div className="mt-3 space-y-2 border-t pt-3">
            {draft.description && <p className="text-xs text-muted-foreground">{draft.description}</p>}
            <div className="flex flex-wrap gap-1">
              {draft.images.slice(0, 8).map((img, i) => <img key={i} src={img} alt="" className="h-12 w-12 rounded object-cover border" loading="lazy" />)}
            </div>
            {draft.variants.length > 0 && <div className="text-xs"><strong>Variantes:</strong> {draft.variants.map(v => `${v.color}${v.size ? ` (${v.size})` : ""}`).join(", ")}</div>}
            <a href={draft.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><ExternalLink className="h-3 w-3" /> Voir la source</a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Edit Dialog ──
function EditDialog({ draft, onClose, onSave }: { draft: DraftProduct; onClose: () => void; onSave: (patch: Partial<DraftProduct>) => void }) {
  const [name, setName] = useState(draft.name);
  const [description, setDescription] = useState(draft.description);
  const [price, setPrice] = useState(String(draft.price));

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Edit3 className="h-4 w-4" /> Modifier le brouillon</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><label className="text-xs text-muted-foreground">Nom</label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground">Prix de vente (FCFA)</label><Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground">Description</label><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="flex gap-2 pt-2">
            <Button onClick={() => onSave({ name: name.trim(), description: description.trim(), price: Number(price) || 0 })} className="flex-1 gap-1"><Save className="h-3.5 w-3.5" /> Enregistrer</Button>
            <Button variant="outline" onClick={onClose}>Annuler</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
