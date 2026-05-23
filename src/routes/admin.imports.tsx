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
import { supabase } from "@/integrations/supabase/client";

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
  status: "draft" | "published" | "discarded";
  createdAt: number;
}

// ── localStorage helpers ──
const LS_KEY = "kawzone_import_drafts";
function loadDrafts(): DraftProduct[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveDrafts(drafts: DraftProduct[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(drafts));
}

// ── Simple ID generator ──
let _id = Date.now();
function uid() { return `draft-${++_id}`; }

// ── Scrape product via AI ──
async function scrapeProductWithAI(url: string): Promise<DraftProduct | null> {
  // Step 1: Try to fetch the page
  let html = "";
  let title = "";
  let images: string[] = [];
  
  try {
    const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}&timeout=10000`);
    if (res.ok) {
      html = await res.text();
      const titleMatch = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
      title = titleMatch?.[1]?.trim() || "";
      // Extract images
      const imgRe = /<img[^>]+src=["'](https?:\/\/[^"']+\.(?:jpe?g|png|webp))["']/gi;
      let m: RegExpExecArray | null;
      while ((m = imgRe.exec(html))) images.push(m[1]);
      // Deduplicate
      images = [...new Set(images)].slice(0, 8);
    }
  } catch {
    // Fallback: use URL info only
  }

  // Step 2: Get categories from DB for AI
  const { data: cats } = await supabase.from("categories").select("id, name").eq("level", 3).limit(100);
  const catNames = (cats ?? []).map((c: any) => c.name).join(", ");

  // Step 3: Call AI
  const prompt = [
    "Analyse ce produit e-commerce. Extrais les donnees en FRANCAIS.",
    "Reponds UNIQUEMENT en JSON strict (pas de markdown):",
    '{"name":"nom francais court max 60 caracteres","description":"description marketing francais","price_suggested":prix_vente_suggere_en_fcfa,"category":"categorie exacte","variants":[{"size":"taille","color":"couleur francaise","color_hex":"#rrggbb"}]}',
    `Categories disponibles: ${catNames}`,
    `URL: ${url}`,
    title ? `Titre trouve: ${title}` : "",
    images.length > 0 ? `Images trouvees: ${images.length}` : "",
  ].filter(Boolean).join("\n");

  try {
    const apiKey = import.meta.env.VITE_LOVABLE_API_KEY || "";
    if (!apiKey) {
      // No API key - create basic draft from URL
      return createBasicDraft(url, title, images);
    }
    
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: [{ role: "user", content: prompt }] }),
    });
    
    if (!res.ok) return createBasicDraft(url, title, images);
    
    const json = await res.json();
    const raw = json.choices?.[0]?.message?.content?.trim() || "";
    
    // Parse JSON
    let aiResult: any = null;
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      aiResult = JSON.parse(cleaned);
    } catch {
      return createBasicDraft(url, title, images);
    }

    // Find category
    let categoryId: string | null = null;
    let categoryName: string | null = null;
    if (aiResult.category && cats) {
      const match = cats.find((c: any) => c.name.toLowerCase().includes(String(aiResult.category).toLowerCase().slice(0, 15)));
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

    return {
      id: uid(),
      name: String(aiResult.name || title || "Produit importe").slice(0, 100),
      description: String(aiResult.description || "").slice(0, 2000),
      price: Math.max(0, Number(aiResult.price_suggested) || 0),
      sourcePrice: 0,
      sourceCurrency: url.includes("1688") ? "CNY" : url.includes("taobao") ? "CNY" : "USD",
      images: images.length > 0 ? images : [],
      variants: cleanVariants,
      sourceUrl: url,
      categoryId,
      categoryName,
      status: "draft",
      createdAt: Date.now(),
    };
  } catch {
    return createBasicDraft(url, title, images);
  }
}

function createBasicDraft(url: string, title: string, images: string[]): DraftProduct {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split("/").filter(Boolean);
  const name = title || pathParts[pathParts.length - 1]?.replace(/-/g, " ") || "Produit importe";
  return {
    id: uid(),
    name: name.slice(0, 100),
    description: `Produit importe depuis ${urlObj.hostname}`,
    price: 0,
    sourcePrice: 0,
    sourceCurrency: url.includes("1688") || url.includes("taobao") ? "CNY" : "USD",
    images: images.slice(0, 8),
    variants: [],
    sourceUrl: url,
    categoryId: null,
    categoryName: null,
    status: "draft",
    createdAt: Date.now(),
  };
}

function AdminImports() {
  const qc = useQueryClient();
  const [mainTab, setMainTab] = useState<"excel" | "ia" | "drafts">("excel");

  // ── Drafts state (localStorage) ──
  const [drafts, setDrafts] = useState<DraftProduct[]>(loadDrafts);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => { saveDrafts(drafts); }, [drafts]);

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
    queryFn: () => fnHistory({ data: { shopId: "" } }),
    staleTime: 30_000,
  });

  // ── IA Import state ──
  const [iaTab, setIaTab] = useState<"store" | "product">("product");
  const [productUrl, setProductUrl] = useState("");
  const [iaLoading, setIaLoading] = useState(false);
  const [justImported, setJustImported] = useState<DraftProduct[]>([]);

  // ── Handlers ──
  const handleImportSingle = async () => {
    const urls = productUrl.split("\n").map(l => l.trim()).filter(l => l.startsWith("http"));
    if (urls.length === 0) { toast.error("Aucun lien valide"); return; }

    setIaLoading(true);
    const imported: DraftProduct[] = [];
    for (const url of urls.slice(0, 10)) {
      toast.loading(`Analyse de ${url.slice(0, 40)}...`);
      const draft = await scrapeProductWithAI(url);
      if (draft) {
        imported.push(draft);
        setDrafts(prev => [draft, ...prev]);
      }
      toast.dismiss();
    }
    setIaLoading(false);
    setJustImported(imported);
    setProductUrl("");
    toast.success(`${imported.length} produit(s) importe(s)`);
  };

  const handlePublish = async (draft: DraftProduct) => {
    try {
      // Insert directly to products table
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

      // Insert images
      if (draft.images.length > 0) {
        await supabase.from("product_images").insert(
          draft.images.map((url, i) => ({ product_id: product.id, url, position: i }))
        );
      }

      // Insert variants
      if (draft.variants.length > 0) {
        await supabase.from("product_variants").insert(
          draft.variants.map(v => ({
            product_id: product.id,
            size: v.size,
            color: v.color,
            color_hex: v.colorHex || null,
            stock: v.stock,
          }))
        );
      }

      setDrafts(prev => prev.filter(d => d.id !== draft.id));
      toast.success("Produit publie !");
    } catch (e: any) {
      toast.error(e.message || "Erreur");
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
                <Button variant="outline" size="sm" onClick={() => fnExport({ data: { scope: "admin", shopId: "", status: "any" } }).then((r: any) => downloadBase64(r.base64, r.fileName, r.mime)).catch(() => toast.error("Erreur"))}>
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
                  setPreviewLoading(true);
                  try {
                    const fileBase64 = await fileToBase64(excelFile);
                    const r = await fnPreview({ data: { scope: "admin", shopId: "", fileBase64, fileName: excelFile.name } });
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
                        await fnCommit({ data: { scope: "admin", shopId: "", fileBase64, fileName: excelFile!.name } });
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

              {history.data && (history.data as any[]).length > 0 && (
                <>
                  <Separator />
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground">Historique</h4>
                  <div className="space-y-1">
                    {(history.data as any[]).slice(0, 5).map((h: any) => (
                      <div key={h.id} className="flex justify-between text-xs border-b py-1">
                        <span>{h.file_name} - {h.inserted_count} produits</span>
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
              <Tabs value={iaTab} onValueChange={(v) => setIaTab(v as "store" | "product")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="store" className="gap-1"><Store className="h-3.5 w-3.5" /> Lien boutique</TabsTrigger>
                  <TabsTrigger value="product" className="gap-1"><Link2 className="h-3.5 w-3.5" /> Lien(s) produit</TabsTrigger>
                </TabsList>

                <TabsContent value="store" className="space-y-3 pt-3">
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
                    <strong>Note :</strong> L&apos;import par boutique est en cours de developpement.
                    Utilisez l&apos;onglet &quot;Lien(s) produit&quot; pour importer des produits un par un.
                  </div>
                  <Button disabled className="w-full gap-2">
                    <Play className="h-4 w-4" /> Bientot disponible
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
