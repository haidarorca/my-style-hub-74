/**
 * admin.imports.tsx
 * -----------------
 * Page fusionnee : Import Excel + Import IA (Taobao/1688)
 * - Import Excel/CSV avec template
 * - Import IA depuis Taobao/1688 avec logs visibles et score de confiance
 * - Gestion des brouillons en localStorage
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
  Download, Table2, Sparkles, Link2, Bot, Eye,
  ShieldCheck, CircleDashed, CircleX, CircleCheck,
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
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/imports")({
  component: () => (
    <PermissionGate perm="products">
      <AdminImports />
    </PermissionGate>
  ),
});

const fmtFcfa = (n: number) => `${Math.round(n || 0).toLocaleString("fr-FR")} FCFA`;

// ── Taobao URL Parser ──

/**
 * Parse le texte de partage Taobao pour extraire l'URL.
 * Gere : click.world.taobao.com, m.tb.cn, texte complet avec emojis.
 */
function extractTaobaoUrl(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // Direct URL
  if (/^https?:\/\//i.test(trimmed)) {
    const m = trimmed.match(/(https?:\/\/[^\s'"<>，。！？\u4e00-\u9fff]+)/i);
    if (m) return decodeURIComponent(m[1]);
  }

  // Taobao share text with URL inside
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

  for (const re of patterns) {
    const m = input.match(re);
    if (m) return decodeURIComponent(m[1]);
  }

  return null;
}

/**
 * Canonicalise l'URL Taobao/1688/Tmall.
 */
function canonicalizeTaobaoUrl(url: string): { canonical: string; platform: string; itemId: string | null } {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();

    // Extract item ID
    let itemId = u.searchParams.get("id") || u.searchParams.get("itemId") || null;
    if (!itemId) {
      const m = u.pathname.match(/offer\/(\d+)/);
      if (m) itemId = m[1];
    }

    if (host.includes("1688")) {
      return { canonical: itemId ? `https://detail.1688.com/offer/${itemId}.html` : url, platform: "1688", itemId };
    }
    if (host.includes("tmall")) {
      return { canonical: itemId ? `https://detail.tmall.com/item.htm?id=${itemId}` : url, platform: "tmall", itemId };
    }
    // Taobao default
    return { canonical: itemId ? `https://item.taobao.com/item.htm?id=${itemId}` : url, platform: "taobao", itemId };
  } catch {
    return { canonical: url, platform: "unknown", itemId: null };
  }
}

// ── Types ──
interface ImportLog {
  step: string;
  status: "pending" | "running" | "success" | "error" | "warning";
  message: string;
  timestamp: number;
}

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
  confidence: number; // 0-100
  status: "draft" | "published" | "discarded";
  createdAt: number;
}

const LS_KEY = "kawzone_import_drafts";
function loadDrafts(): DraftProduct[] {
  try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function saveDrafts(drafts: DraftProduct[]) { localStorage.setItem(LS_KEY, JSON.stringify(drafts)); }

let _id = Date.now();
function uid() { return `draft-${++_id}`; }

function logStep(logs: ImportLog[], step: string, status: ImportLog["status"], message: string): ImportLog[] {
  return [...logs, { step, status, message, timestamp: Date.now() }];
}

// ── Main Component ──

export default function AdminImports() {
  const qc = useQueryClient();
  const [mainTab, setMainTab] = useState<"excel" | "ia" | "drafts">("excel");

  // ── Drafts ──
  const [drafts, setDrafts] = useState<DraftProduct[]>(loadDrafts);
  const [editingId, setEditingId] = useState<string | null>(null);
  useEffect(() => { saveDrafts(drafts); }, [drafts]);

  // ── Excel ──
  const fnExport = useServerFn(exportProducts);
  const fnTemplate = useServerFn(downloadTemplate);
  const fnPreview = useServerFn(previewImport);
  const fnCommit = useServerFn(commitImport);

  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // ── IA Import ──
  const [productUrl, setProductUrl] = useState("");
  const [iaLoading, setIaLoading] = useState(false);
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [justImported, setJustImported] = useState<DraftProduct[]>([]);

  // ── Handlers ──

  const handleImportSingle = async () => {
    if (!productUrl.trim()) { toast.error("Collez un lien ou un texte de partage"); return; }

    const urls = productUrl.split("\n").map((l) => extractTaobaoUrl(l)).filter(Boolean) as string[];
    if (urls.length === 0) { toast.error("Aucun lien Taobao/1688 detecte dans le texte colle"); return; }

    setIaLoading(true);
    setLogs([]);
    const imported: DraftProduct[] = [];

    for (const rawUrl of urls.slice(0, 5)) {
      let stepLogs: ImportLog[] = [];

      // Step 1: Parse URL
      stepLogs = logStep(stepLogs, "Parse URL", "success", `Texte analyse : ${rawUrl.slice(0, 60)}...`);

      // Step 2: Extract clean URL
      const cleanUrl = extractTaobaoUrl(rawUrl);
      if (!cleanUrl) {
        stepLogs = logStep(stepLogs, "Extract URL", "error", "Impossible d'extraire l'URL du texte");
        setLogs((prev) => [...prev, ...stepLogs]);
        continue;
      }
      stepLogs = logStep(stepLogs, "Extract URL", "success", `URL extraite : ${cleanUrl.slice(0, 80)}`);

      // Step 3: Canonicalize
      const { canonical, platform, itemId } = canonicalizeTaobaoUrl(cleanUrl);
      stepLogs = logStep(stepLogs, "Canonicalize", "success", `${platform.toUpperCase()} | Item ID : ${itemId || "non trouve"}`);

      setLogs((prev) => [...prev, ...stepLogs]);

      // Step 4: Try to scrape via allorigins
      let html = "";
      let title = "";
      let images: string[] = [];
      let scrapeSuccess = false;

      try {
        stepLogs = logStep(stepLogs, "Scrape", "running", `Tentative de chargement via proxy...`);
        setLogs((prev) => [...prev, ...stepLogs.slice(-1)]);

        const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(canonical)}`);
        if (res.ok) {
          html = await res.text();
          // Check if login wall
          if (html.includes("登录") || html.includes("login.taobao") || html.length < 500) {
            stepLogs = logStep(stepLogs, "Scrape", "warning", `Page protegee (login wall) - fallback sur l'IA uniquement`);
          } else {
            scrapeSuccess = true;
            // Extract title
            const titleMatch = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
            title = titleMatch?.[1]?.replace(/ - 淘宝|\s*-\s*tmall/gi, "").trim() || "";
            // Extract images
            const imgRe = /https?:\/\/(?:img\.alicdn|gd\d\.alicdn|sc\d\.alicdn)[^\s'"<>]+/gi;
            const imgMatches = html.match(imgRe);
            images = imgMatches ? [...new Set(imgMatches)].slice(0, 8) : [];
            stepLogs = logStep(stepLogs, "Scrape", "success", `Page chargee | Titre : ${title.slice(0, 40)} | Images : ${images.length}`);
          }
        } else {
          stepLogs = logStep(stepLogs, "Scrape", "warning", `Proxy indisponible - fallback sur l'IA`);
        }
      } catch {
        stepLogs = logStep(stepLogs, "Scrape", "warning", `Erreur reseau - fallback sur l'IA`);
      }

      setLogs((prev) => [...prev, ...stepLogs.slice(-3)]);

      // Step 5: Call AI for analysis
      stepLogs = logStep(stepLogs, "IA Analysis", "running", "Analyse par l'IA en cours...");
      setLogs((prev) => [...prev, ...stepLogs.slice(-1)]);

      try {
        const { data: cats } = await supabase.from("categories").select("id, name").eq("level", 3).limit(100);
        const catNames = (cats ?? []).map((c: any) => c.name).join(", ");

        const prompt = `Analyse ce produit e-commerce ${platform.toUpperCase()}. Extrais en FRANCAIS.
Reponds UNIQUEMENT en JSON strict sans markdown:
{"name":"nom francais court max 60c","description":"description marketing","price_suggested":prix_vente_fcfa,"category":"categorie exacte","variants":[{"size":"","color":"couleur fr","color_hex":"#rrggbb"}]}
Categories disponibles: ${catNames}
URL: ${canonical}
${title ? `Titre trouve: ${title}` : ""}
${images.length > 0 ? `Images: ${images.length}` : ""}
${scrapeSuccess ? `HTML extrait (extrait): ${html.slice(0, 2000)}` : "Pas d'acces direct - analyse basee sur l'URL et le titre uniquement"}`;

        const apiKey = import.meta.env.VITE_LOVABLE_API_KEY || "";
        if (!apiKey) {
          stepLogs = logStep(stepLogs, "IA Analysis", "error", "Cle API IA non configuree");
          setLogs((prev) => [...prev, ...stepLogs.slice(-1)]);
          continue;
        }

        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: [{ role: "user", content: prompt }] }),
        });

        if (!res.ok) throw new Error(`IA HTTP ${res.status}`);

        const json = await res.json();
        const raw = json.choices?.[0]?.message?.content?.trim() || "";

        // Parse JSON
        let aiResult: any = null;
        try {
          const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
          aiResult = JSON.parse(cleaned);
        } catch {
          // Try extracting JSON from text
          const m = raw.match(/\{[\s\S]*\}/);
          if (m) aiResult = JSON.parse(m[0]);
        }

        if (!aiResult) throw new Error("JSON invalide de l'IA");

        // Find category
        let categoryId: string | null = null;
        let categoryName: string | null = null;
        if (aiResult.category && cats) {
          const match = (cats as any[]).find((c: any) => c.name.toLowerCase().includes(String(aiResult.category).toLowerCase().slice(0, 15)));
          if (match) { categoryId = match.id; categoryName = match.name; }
        }

        // Parse variants
        const rawVariants = Array.isArray(aiResult.variants) ? aiResult.variants : [];
        const cleanVariants = rawVariants.map((v: any) => ({
          size: String(v.size || "").slice(0, 40),
          color: String(v.color || "").slice(0, 60),
          colorHex: /^#[0-9a-fA-F]{6}$/.test(v.color_hex) ? v.color_hex : "",
          stock: 0,
        })).filter((v: any) => v.size || v.color);

        // Confidence score
        let confidence = 30; // base for AI-only
        if (scrapeSuccess) confidence += 30;
        if (images.length > 0) confidence += 15;
        if (title && title.length > 5) confidence += 10;
        if (cleanVariants.length > 0) confidence += 10;
        if (categoryId) confidence += 5;

        const draft: DraftProduct = {
          id: uid(),
          name: String(aiResult.name || title || "Produit importe").slice(0, 100),
          description: String(aiResult.description || "").slice(0, 2000),
          price: Math.max(0, Number(aiResult.price_suggested) || 0),
          sourcePrice: 0,
          sourceCurrency: platform === "1688" ? "CNY" : "CNY",
          images: images.length > 0 ? images : [],
          variants: cleanVariants,
          sourceUrl: rawUrl,
          canonicalUrl: canonical,
          platform,
          itemId,
          categoryId,
          categoryName,
          confidence: Math.min(100, confidence),
          status: "draft",
          createdAt: Date.now(),
        };

        imported.push(draft);
        setDrafts((prev) => [draft, ...prev]);

        stepLogs = logStep(stepLogs, "Complete", "success", `Brouillon cree | Confiance : ${confidence}% | ${draft.name.slice(0, 40)}`);
      } catch (e: any) {
        stepLogs = logStep(stepLogs, "Complete", "error", `Echec : ${e.message}`);
      }

      setLogs((prev) => [...prev, ...stepLogs.slice(-2)]);
    }

    setIaLoading(false);
    setJustImported(imported);
    setProductUrl("");

    if (imported.length > 0) {
      toast.success(`${imported.length} produit(s) importe(s)`);
      // Switch to drafts tab
      setMainTab("drafts");
    } else {
      toast.error("Aucun produit n'a pu etre importe. Verifiez les logs.");
    }
  };

  // ── Publish ──
  const handlePublish = async (draft: DraftProduct) => {
    try {
      const { data: product, error } = await supabase.from("products").insert({
        name: draft.name,
        description: draft.description,
        price: draft.price,
        status: "approved",
        is_active: true,
        category_id: draft.categoryId,
        code: `IMP-${Date.now().toString(36).toUpperCase()}`,
      }).select().single();

      if (error) throw error;

      if (draft.images.length > 0) {
        await supabase.from("product_images").insert(
          draft.images.map((url, i) => ({ product_id: product.id, url, position: i }))
        );
      }

      if (draft.variants.length > 0) {
        await supabase.from("product_variants").insert(
          draft.variants.map((v) => ({
            product_id: product.id,
            size: v.size,
            color: v.color,
            color_hex: v.colorHex || null,
            stock: v.stock,
          }))
        );
      }

      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      toast.success("Produit publie !");
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de la publication");
    }
  };

  const handleDiscard = (id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    toast.success("Brouillon supprime");
  };

  const activeDrafts = drafts.filter((d) => d.status === "draft");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Package className="h-5 w-5" /> Importation de produits
        </h1>
        <p className="text-xs text-muted-foreground">
          Importez depuis Excel/CSV ou depuis Taobao / 1688 / Tmall avec l&apos;IA.
        </p>
      </div>

      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as "excel" | "ia" | "drafts")}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="excel" className="gap-1.5">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel / CSV
          </TabsTrigger>
          <TabsTrigger value="ia" className="gap-1.5">
            <Bot className="h-3.5 w-3.5" /> Import IA
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
                <Button variant="outline" size="sm" onClick={() => fnTemplate({}).then((r: any) => {
                  const bin = atob(r.base64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                  const blob = new Blob([bytes], { type: r.mime }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = r.fileName; a.click(); URL.revokeObjectURL(url); toast.success("Modele telecharge");
                }).catch(() => toast.error("Erreur"))}>
                  <Download className="mr-1 h-3.5 w-3.5" /> Modele
                </Button>
                <Button variant="outline" size="sm" onClick={() => fnExport({ data: { scope: "admin", shopId: "", status: "any" } }).then((r: any) => {
                  const bin = atob(r.base64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                  const blob = new Blob([bytes], { type: r.mime }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = r.fileName; a.click(); URL.revokeObjectURL(url); toast.success(`${r.count} produits exportes`);
                }).catch(() => toast.error("Erreur"))}>
                  <Table2 className="mr-1 h-3.5 w-3.5" /> Exporter
                </Button>
              </div>
              <Separator />
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Fichier Excel ou CSV</label>
                <Input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { setExcelFile(e.target.files?.[0] ?? null); setPreview(null); }} />
              </div>
              <Button onClick={async () => {
                if (!excelFile) return; setPreviewLoading(true);
                try {
                  const b64 = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve((r.result as string).split(",")[1] ?? ""); r.onerror = reject; r.readAsDataURL(excelFile); });
                  const r = await fnPreview({ data: { scope: "admin", shopId: "", fileBase64: b64, fileName: excelFile.name } });
                  setPreview(r); toast.success(`${r.summary?.totalRows || 0} lignes`);
                } catch (e: any) { toast.error(e.message); }
                setPreviewLoading(false);
              }} disabled={!excelFile || previewLoading} className="w-full">
                {previewLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Table2 className="h-4 w-4 mr-1" />}
                Previsualiser
              </Button>
              {preview && (
                <div className="rounded-lg border p-3">
                  <div className="flex justify-between text-sm mb-2">
                    <span>{preview.summary?.valid || 0} valides / {preview.summary?.errors || 0} erreurs</span>
                    <Button size="sm" onClick={async () => {
                      try {
                        const b64 = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve((r.result as string).split(",")[1] ?? ""); r.onerror = reject; r.readAsDataURL(excelFile!); });
                        await fnCommit({ data: { scope: "admin", shopId: "", fileBase64: b64, fileName: excelFile!.name } });
                        toast.success("Importe !"); setPreview(null); setExcelFile(null);
                      } catch (e: any) { toast.error(e.message); }
                    }}><CheckCircle2 className="h-4 w-4 mr-1" /> Importer</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 2: IMPORT IA ── */}
        <TabsContent value="ia" className="space-y-4 pt-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Import IA Taobao / 1688 / Tmall
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground">
                  Collez un lien produit ou le texte de partage complet (avec emojis, chinois, etc.)
                </label>
                <Textarea
                  value={productUrl}
                  onChange={(e) => setProductUrl(e.target.value)}
                  placeholder={`Exemples de textes valides :\nhttps://item.taobao.com/item.htm?id=123456\nhttps://click.world.taobao.com/abc123 \u300cTitre produit\u300d\nhttps://m.tb.cn/xyz789`}
                  rows={4}
                />
              </div>

              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800 space-y-1">
                <strong>Comment importer :</strong>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Ouvrez l&apos;app Taobao sur votre telephone</li>
                  <li>Trouvez le produit → cliquez &quot;Partager&quot;</li>
                  <li>Copiez le texte complet (lien + titre + emojis)</li>
                  <li>Collez ici → cliquez &quot;Importer avec l&apos;IA&quot;</li>
                </ol>
              </div>

              <Button onClick={handleImportSingle} disabled={iaLoading} className="w-full gap-2">
                {iaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {iaLoading ? "Analyse en cours..." : "Importer avec l'IA"}
              </Button>

              {/* Logs visibles */}
              {logs.length > 0 && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 max-h-[240px] overflow-y-auto">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                    <Eye className="h-3 w-3" /> Logs d&apos;importation
                  </h4>
                  {logs.map((log, i) => (
                    <div key={i} className="flex items-start gap-2 text-[11px]">
                      {log.status === "success" && <CircleCheck className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />}
                      {log.status === "running" && <CircleDashed className="h-3 w-3 text-blue-500 shrink-0 mt-0.5 animate-spin" />}
                      {log.status === "error" && <CircleX className="h-3 w-3 text-destructive shrink-0 mt-0.5" />}
                      {log.status === "warning" && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />}
                      {log.status === "pending" && <CircleDashed className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />}
                      <div>
                        <span className="font-semibold">{log.step}</span>
                        <span className="text-muted-foreground"> — {log.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Just imported preview */}
              {justImported.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                    Produits importes ({justImported.length})
                  </h4>
                  {justImported.map((p) => <MiniDraftCard key={p.id} draft={p} />)}
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
        <EditDialog draft={drafts.find((d) => d.id === editingId)!} onClose={() => setEditingId(null)} onSave={(patch) => {
          setDrafts((prev) => prev.map((d) => d.id === editingId ? { ...d, ...patch } : d));
          setEditingId(null); toast.success("Modifie");
        }} />
      )}
    </div>
  );
}

// ── Sub-components ──

function MiniDraftCard({ draft }: { draft: DraftProduct }) {
  return (
    <div className={`rounded-lg border p-2.5 flex gap-3 ${draft.confidence < 50 ? "border-amber-300 bg-amber-50/30" : ""}`}>
      <div className="h-14 w-14 shrink-0 rounded bg-muted overflow-hidden">
        {draft.images[0] ? <img src={draft.images[0]} alt="" className="h-full w-full object-cover" loading="lazy" /> : <ImageIcon className="m-auto mt-3 h-5 w-5 text-muted-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{draft.name}</p>
        <div className="flex items-center gap-2 text-[11px]">
          <Badge variant="outline" className="text-[10px]">{draft.platform}</Badge>
          <span className="text-primary font-medium">{fmtFcfa(draft.price)}</span>
          <Badge variant={draft.confidence >= 70 ? "default" : draft.confidence >= 40 ? "secondary" : "destructive"} className="text-[10px]">
            {draft.confidence >= 70 ? <ShieldCheck className="h-2.5 w-2.5 mr-0.5" /> : null}
            Confiance : {draft.confidence}%
          </Badge>
        </div>
        {draft.confidence < 50 && (
          <p className="text-[10px] text-amber-600 mt-0.5">Score faible - verifiez avant de publier</p>
        )}
      </div>
    </div>
  );
}

function DraftCard({ draft, onPublish, onDiscard, onEdit }: { draft: DraftProduct; onPublish: () => void; onDiscard: () => void; onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className={draft.confidence < 50 ? "border-amber-300" : ""}>
      <CardContent className="p-3">
        <div className="flex gap-3">
          <div className="h-16 w-16 shrink-0 rounded bg-muted overflow-hidden">
            {draft.images[0] ? <img src={draft.images[0]} alt="" className="h-full w-full object-cover" loading="lazy" /> : <ImageIcon className="m-auto mt-4 h-6 w-6 text-muted-foreground" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-medium truncate">{draft.name || "Sans nom"}</p>
              <Badge variant="outline" className="text-[10px]">{draft.platform}</Badge>
              <Badge variant={draft.confidence >= 70 ? "default" : draft.confidence >= 40 ? "secondary" : "destructive"} className="text-[10px]">
                {draft.confidence}%
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground truncate">{draft.canonicalUrl.slice(0, 50)}... {draft.itemId ? `(ID: ${draft.itemId})` : ""}</p>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px]">
              <span className="text-primary font-medium">{fmtFcfa(draft.price)}</span>
              {draft.categoryName && <Badge variant="secondary" className="text-[10px]">{draft.categoryName}</Badge>}
              {draft.variants.length > 0 && <span className="text-muted-foreground">{draft.variants.length}v</span>}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setExpanded(!expanded)}>
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} Details
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onEdit}><Edit3 className="h-3 w-3" /> Modifier</Button>
              <Button size="sm" className="h-7 text-xs gap-1" onClick={onPublish}><CheckCircle2 className="h-3 w-3" /> Publier</Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive gap-1" onClick={onDiscard}><XCircle className="h-3 w-3" /> Suppr</Button>
            </div>
            {draft.confidence < 50 && (
              <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Score de confiance faible - verifiez les donnees avant publication
              </p>
            )}
          </div>
        </div>
        {expanded && (
          <div className="mt-3 space-y-2 border-t pt-3">
            {draft.description && <p className="text-xs text-muted-foreground">{draft.description}</p>}
            <div className="text-[11px] space-y-1">
              <div><strong>URL source :</strong> <a href={draft.sourceUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">{draft.sourceUrl}</a></div>
              <div><strong>URL canonique :</strong> {draft.canonicalUrl}</div>
              <div><strong>Plateforme :</strong> {draft.platform} | <strong>Item ID :</strong> {draft.itemId || "N/A"}</div>
            </div>
            <div className="flex flex-wrap gap-1">
              {draft.images.slice(0, 8).map((img, i) => <img key={i} src={img} alt="" className="h-12 w-12 rounded object-cover border" loading="lazy" />)}
            </div>
            {draft.variants.length > 0 && <div className="text-xs"><strong>Variantes:</strong> {draft.variants.map((v) => `${v.color}${v.size ? ` (${v.size})` : ""}`).join(", ")}</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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
          <div><label className="text-xs text-muted-foreground">Prix vente (FCFA)</label><Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
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
