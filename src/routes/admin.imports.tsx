/**
 * admin.imports.tsx
 * -----------------
 * Page fusionnee : Import Excel + Import IA (Taobao/1688/Tmall)
 * - Import Excel/CSV avec template
 * - Import IA avec vrai scraping Bright Data Browser CDP
 * - Session manager Taobao avec QR code
 * - Logs visibles + score de confiance
 */

import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Package, Trash2, Edit3, CheckCircle2, XCircle,
  ExternalLink, ImageIcon, Loader2, AlertTriangle,
  ChevronDown, ChevronUp, Save, FileSpreadsheet,
  Download, Table2, Sparkles, Bot,
  ShieldCheck, CircleCheck, CircleX, CircleDashed,
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
} from "@/lib/import-export.functions";
import { supabase } from "@/integrations/supabase/client";
import { TaobaoSessionManager } from "@/components/admin/TaobaoSessionManager";
import {
  connectBrightData,
  scrapeProductPage,
  isSessionValid,
  type CDPSession,
  type ScrapedProduct,
  type ScrapingLog,
} from "@/lib/taobao-cdp";

export const Route = createFileRoute("/admin/imports")({
  component: () => (
    <PermissionGate perm="products">
      <AdminImports />
    </PermissionGate>
  ),
});

const fmtFcfa = (n: number) => `${Math.round(n || 0).toLocaleString("fr-FR")} FCFA`;

// ── URL Parser ──
function extractTaobaoUrl(input: string): string | null {
  if (!input) return null;
  const patterns = [
    /(https?:\/\/click\.world\.taobao\.com\/[^\s'"<>，。！？]+)/i,
    /(https?:\/\/m\.tb\.cn\/[^\s'"<>，。！？]+)/i,
    /(https?:\/\/e\.tb\.cn\/[^\s'"<>，。！？]+)/i,
    /(https?:\/\/s\.click\.taobao\.com\/[^\s'"<>，。！？]+)/i,
    /(https?:\/\/item\.taobao\.com\/[^\s'"<>，。！？]+)/i,
    /(https?:\/\/detail\.tmall\.com\/[^\s'"<>，。！？]+)/i,
    /(https?:\/\/detail\.1688\.com\/[^\s'"<>，。！？]+)/i,
    /(https?:\/\/[^\s'"<>，。！？]*(?:taobao|tmall|1688|tb\.cn)[^\s'"<>，。！？]*)/i,
  ];
  for (const re of patterns) { const m = input.match(re); if (m) return decodeURIComponent(m[1]); }
  return null;
}

function canonicalizeTaobaoUrl(url: string): { canonical: string; platform: string; itemId: string | null } {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    let itemId = u.searchParams.get("id") || u.searchParams.get("itemId") || null;
    if (!itemId) { const m = u.pathname.match(/offer\/(\d+)/); if (m) itemId = m[1]; }
    if (host.includes("1688")) return { canonical: itemId ? `https://detail.1688.com/offer/${itemId}.html` : url, platform: "1688", itemId };
    if (host.includes("tmall")) return { canonical: itemId ? `https://detail.tmall.com/item.htm?id=${itemId}` : url, platform: "tmall", itemId };
    return { canonical: itemId ? `https://item.taobao.com/item.htm?id=${itemId}` : url, platform: "taobao", itemId };
  } catch { return { canonical: url, platform: "unknown", itemId: null }; }
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
  canonicalUrl: string;
  platform: string;
  itemId: string | null;
  categoryId: string | null;
  categoryName: string | null;
  confidence: number;
  status: "draft" | "published" | "discarded";
  createdAt: number;
}

const LS_KEY = "kawzone_import_drafts";
function loadDrafts(): DraftProduct[] { try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : []; } catch { return []; } }
function saveDrafts(drafts: DraftProduct[]) { localStorage.setItem(LS_KEY, JSON.stringify(drafts)); }
let _id = Date.now();
function uid() { return `draft-${++_id}`; }

function logEntry(logs: ScrapingLog[], step: string, status: ScrapingLog["status"], message: string): ScrapingLog[] {
  return [...logs, { step, status, message, timestamp: Date.now() }];
}

// ── Main ──
export default function AdminImports() {
  const [mainTab, setMainTab] = useState<"excel" | "ia" | "drafts">("excel");
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
  const [productUrl, setProductUrl] = useState("");
  const [iaLoading, setIaLoading] = useState(false);
  const [logs, setLogs] = useState<ScrapingLog[]>([]);
  const [justImported, setJustImported] = useState<DraftProduct[]>([]);
  const [cdpSession, setCdpSession] = useState<CDPSession | null>(null);
  const [useRealScraping, setUseRealScraping] = useState(false);

  // ── Import handler (CDP + fallback AI) ──
  const handleImport = async () => {
    if (!productUrl.trim()) { toast.error("Collez un lien ou un texte de partage"); return; }
    const urls = productUrl.split("\n").map(l => extractTaobaoUrl(l)).filter(Boolean) as string[];
    if (urls.length === 0) { toast.error("Aucun lien Taobao/1688 detecte"); return; }

    setIaLoading(true);
    setLogs([]);
    const imported: DraftProduct[] = [];

    for (const rawUrl of urls.slice(0, 5)) {
      let stepLogs: ScrapingLog[] = [];

      // Step 1: Parse
      stepLogs = logEntry(stepLogs, "Parse", "success", `Texte analyse : ${rawUrl.slice(0, 60)}...`);
      setLogs(prev => [...prev, ...stepLogs]);

      // Step 2: Extract URL
      const cleanUrl = extractTaobaoUrl(rawUrl);
      if (!cleanUrl) { stepLogs = logEntry(stepLogs, "URL", "error", "Extraction impossible"); setLogs(prev => [...prev, ...stepLogs]); continue; }
      const { canonical, platform, itemId } = canonicalizeTaobaoUrl(cleanUrl);
      stepLogs = logEntry(stepLogs, "URL", "success", `${platform.toUpperCase()} | ID : ${itemId || "?"}`);
      setLogs(prev => [...prev, ...stepLogs.slice(-1)]);

      // Step 3: Try REAL scraping via CDP if available
      let scrapedData: ScrapedProduct | null = null;

      if (useRealScraping && cdpSession) {
        try {
          stepLogs = logEntry(stepLogs, "CDP", "running", "Scraping reel via Bright Data Browser...");
          setLogs(prev => [...prev, ...stepLogs.slice(-1)]);

          const result = await scrapeProductPage(cdpSession, canonical, (log) => {
            setLogs(prev => [...prev, log]);
          });

          if (result) {
            scrapedData = result;
            stepLogs = logEntry(stepLogs, "CDP", "success", `Produit scrape : ${result.name.slice(0, 40)}`);
          } else {
            stepLogs = logEntry(stepLogs, "CDP", "warning", "Scraping reel echoue - fallback IA");
          }
        } catch (e: any) {
          stepLogs = logEntry(stepLogs, "CDP", "error", e.message);
        }
        setLogs(prev => [...prev, ...stepLogs.slice(-2)]);
      }

      // Step 4: Fallback to AI if no CDP or CDP failed
      if (!scrapedData) {
        try {
          stepLogs = logEntry(stepLogs, "IA", "running", "Analyse par IA (fallback)...");
          setLogs(prev => [...prev, ...stepLogs.slice(-1)]);

          const { data: cats } = await supabase.from("categories").select("id, name").eq("level", 3).limit(100);
          const catNames = (cats ?? []).map((c: any) => c.name).join(", ");

          const prompt = `Analyse ce produit ${platform.toUpperCase()}. FRANCAIS. JSON strict :
{"name":"nom court","description":"marketing","price_suggested":prix_fcfa,"category":"categorie","variants":[{"size":"","color":"couleur","color_hex":"#rrggbb"}]}
Categories: ${catNames}
URL: ${canonical}`;

          const apiKey = import.meta.env.VITE_LOVABLE_API_KEY || "";
          if (!apiKey) throw new Error("Cle API IA non configuree");

          const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: [{ role: "user", content: prompt }] }),
          });
          if (!res.ok) throw new Error(`IA HTTP ${res.status}`);

          const json = await res.json();
          const raw = json.choices?.[0]?.message?.content?.trim() || "";
          let aiResult: any = null;
          try { const c = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim(); aiResult = JSON.parse(c); } catch { const m = raw.match(/\{[\s\S]*\}/); if (m) aiResult = JSON.parse(m[0]); }
          if (!aiResult) throw new Error("JSON invalide");

          let catId: string | null = null; let catName: string | null = null;
          if (aiResult.category && cats) { const match = (cats as any[]).find((c: any) => c.name.toLowerCase().includes(String(aiResult.category).toLowerCase().slice(0, 15))); if (match) { catId = match.id; catName = match.name; } }

          scrapedData = {
            name: String(aiResult.name || "Produit").slice(0, 100),
            description: String(aiResult.description || "").slice(0, 2000),
            price: Math.max(0, Number(aiResult.price_suggested) || 0),
            currency: "CNY",
            images: [],
            variants: (Array.isArray(aiResult.variants) ? aiResult.variants : []).map((v: any) => ({
              size: String(v.size || "").slice(0, 40), color: String(v.color || "").slice(0, 60),
              colorHex: /^#[0-9a-fA-F]{6}$/.test(v.color_hex) ? v.color_hex : "", stock: 0, price: 0,
            })).filter((v: any) => v.size || v.color),
            shopName: "", shopId: "", itemId: itemId || "", category: catName || "",
            skuList: [], rawData: aiResult,
          };

          stepLogs = logEntry(stepLogs, "IA", "success", `IA : ${scrapedData.name.slice(0, 40)}`);
        } catch (e: any) {
          stepLogs = logEntry(stepLogs, "IA", "error", e.message);
          setLogs(prev => [...prev, ...stepLogs.slice(-1)]);
          continue;
        }
        setLogs(prev => [...prev, ...stepLogs.slice(-1)]);
      }

      if (!scrapedData) continue;

      // Calculate confidence
      let confidence = scrapedData.images.length > 0 ? 60 : 35;
      if (scrapedData.variants.length > 0) confidence += 15;
      if (scrapedData.shopName) confidence += 10;
      if (scrapedData.price > 0) confidence += 10;
      if (scrapedData.name.length > 5 && !scrapedData.name.includes("登录")) confidence += 10;

      const draft: DraftProduct = {
        id: uid(), name: scrapedData.name, description: scrapedData.description,
        price: scrapedData.price, sourcePrice: 0, sourceCurrency: "CNY",
        images: scrapedData.images, variants: scrapedData.variants,
        sourceUrl: rawUrl, canonicalUrl: canonical, platform, itemId,
        categoryId: null, categoryName: scrapedData.category || null,
        confidence: Math.min(100, confidence), status: "draft", createdAt: Date.now(),
      };

      imported.push(draft);
      setDrafts(prev => [draft, ...prev]);
      stepLogs = logEntry(stepLogs, "Done", "success", `Brouillon cree | Confiance : ${confidence}%`);
      setLogs(prev => [...prev, ...stepLogs.slice(-1)]);
    }

    setIaLoading(false);
    setJustImported(imported);
    setProductUrl("");
    if (imported.length > 0) { toast.success(`${imported.length} produit(s) importe(s)`); setMainTab("drafts"); }
    else toast.error("Aucun produit importe. Verifiez les logs.");
  };

  // ── Publish ──
  const handlePublish = async (draft: DraftProduct) => {
    try {
      const { data: product, error } = await supabase.from("products").insert({
        name: draft.name, description: draft.description, price: draft.price,
        status: "approved", is_active: true, category_id: draft.categoryId,
        code: `IMP-${Date.now().toString(36).toUpperCase()}`,
      }).select().single();
      if (error) throw error;
      if (draft.images.length > 0) await supabase.from("product_images").insert(draft.images.map((url, i) => ({ product_id: product.id, url, position: i })));
      if (draft.variants.length > 0) await supabase.from("product_variants").insert(draft.variants.map(v => ({ product_id: product.id, size: v.size, color: v.color, color_hex: v.colorHex || null, stock: v.stock })));
      setDrafts(prev => prev.filter(d => d.id !== draft.id));
      toast.success("Produit publie !");
    } catch (e: any) { toast.error(e.message || "Erreur"); }
  };

  const activeDrafts = drafts.filter(d => d.status === "draft");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold"><Package className="h-5 w-5" /> Importation</h1>
        <p className="text-xs text-muted-foreground">Excel/CSV ou Taobao/1688/Tmall avec IA</p>
      </div>

      {/* Session Manager */}
      <TaobaoSessionManager onSessionReady={(s) => { setCdpSession(s); setUseRealScraping(true); }} />

      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as "excel" | "ia" | "drafts")}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="excel" className="gap-1.5"><FileSpreadsheet className="h-3.5 w-3.5" /> Excel</TabsTrigger>
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
              <div className="flex items-center gap-2 rounded-lg bg-muted p-2 text-xs">
                <Button variant={useRealScraping ? "default" : "outline"} size="sm" className="text-[10px] h-6" onClick={() => setUseRealScraping(true)} disabled={!cdpSession}>CDP Bright Data</Button>
                <Button variant={!useRealScraping ? "default" : "outline"} size="sm" className="text-[10px] h-6" onClick={() => setUseRealScraping(false)}>IA uniquement</Button>
                {!cdpSession && <span className="text-muted-foreground">Connectez-vous d&apos;abord en haut</span>}
              </div>

              <Textarea value={productUrl} onChange={(e) => setProductUrl(e.target.value)} placeholder={`Exemples valides :\nhttps://item.taobao.com/item.htm?id=123456\nhttps://click.world.taobao.com/abc ...\nhttps://m.tb.cn/xyz789`} rows={4} />

              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800 space-y-1">
                <strong>Comment importer :</strong>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>App Taobao → Produit → Partager</li>
                  <li>Copiez le texte complet</li>
                  <li>Collez ici → &quot;Importer&quot;</li>
                </ol>
              </div>

              <Button onClick={handleImport} disabled={iaLoading} className="w-full gap-2">
                {iaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {iaLoading ? "Analyse..." : useRealScraping ? "Importer (CDP + IA)" : "Importer (IA)"}
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
                      {log.status === "warning" && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />}
                      <div><span className="font-semibold">{log.step}</span> <span className="text-muted-foreground">— {log.message}</span></div>
                    </div>
                  ))}
                </div>
              )}

              {justImported.length > 0 && <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground">Resultats ({justImported.length})</h4>
                {justImported.map(p => <MiniCard key={p.id} draft={p} />)}
              </div>}
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

// ── Mini Card (just imported) ──
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
            <p className="text-[11px] text-muted-foreground truncate">{draft.canonicalUrl.slice(0, 45)}...</p>
            <div className="flex flex-wrap gap-1 mt-1 text-[11px]">
              <span className="text-primary font-medium">{fmtFcfa(draft.price)}</span>
              {draft.categoryName && <Badge variant="secondary" className="text-[10px]">{draft.categoryName}</Badge>}
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => setExpanded(!expanded)}>{expanded ? "Moins" : "Details"}</Button>
              <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={onEdit}><Edit3 className="h-3 w-3 mr-1" />Modif</Button>
              <Button size="sm" className="h-6 text-[10px] px-2" onClick={onPublish}><CheckCircle2 className="h-3 w-3 mr-1" />Publier</Button>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-destructive" onClick={onDiscard}><XCircle className="h-3 w-3 mr-1" />Suppr</Button>
            </div>
            {draft.confidence < 50 && <p className="text-[10px] text-amber-600 mt-1"><AlertTriangle className="h-3 w-3 inline mr-0.5" />Confiance faible - verifiez</p>}
          </div>
        </div>
        {expanded && (
          <div className="mt-2 border-t pt-2 text-[11px] space-y-1">
            <div><strong>Source :</strong> <a href={draft.sourceUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">{draft.sourceUrl}</a></div>
            <div><strong>Canonique :</strong> {draft.canonicalUrl}</div>
            <div><strong>Plateforme :</strong> {draft.platform} | <strong>Item ID :</strong> {draft.itemId || "N/A"}</div>
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
  const [description, setDescription] = useState(draft.description);
  const [price, setPrice] = useState(String(draft.price));

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Edit3 className="h-4 w-4" /> Modifier</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><label className="text-xs text-muted-foreground">Nom</label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground">Prix (FCFA)</label><Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground">Description</label><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="flex gap-2">
            <Button onClick={() => onSave({ name: name.trim(), description: description.trim(), price: Number(price) || 0 })} className="flex-1 gap-1"><Save className="h-3.5 w-3.5" /> Enregistrer</Button>
            <Button variant="outline" onClick={onClose}>Annuler</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
