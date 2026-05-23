/**
 * ImportStoreDialog
 * -----------------
 * Dialogue d'importation de boutique Taobao/1688.
 *
 * - Coller un lien boutique ou un lien produit
 * - Import par lots progressifs (10 max)
 * - Visualisation en temps réel des produits importés
 * - Anti-doublons visuel
 * - Permission: admin par défaut, vendeurs autorisés
 */

import { useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Globe, Loader2, Package, AlertTriangle, ChevronRight,
  Download, Pause, Play, Trash2, ExternalLink, CheckCircle2,
  Store, Link2, RefreshCw, ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  startStoreImport,
  fetchNextProductBatch,
  importSingleProduct,
  type ImportProduct,
} from "@/lib/admin-import-store.functions";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vendorId?: string; // For vendor context
}

const fmtFcfa = (n: number) => `${Math.round(n || 0).toLocaleString("fr-FR")} FCFA`;

export function ImportStoreDialog({ open, onOpenChange, vendorId }: Props) {
  const startFn = useServerFn(startStoreImport);
  const fetchBatchFn = useServerFn(fetchNextProductBatch);
  const importSingleFn = useServerFn(importSingleProduct);

  const [tab, setTab] = useState<"store" | "product">("store");
  const [storeUrl, setStoreUrl] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [productLinks, setProductLinks] = useState(""); // Manual paste
  const [loading, setLoading] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [products, setProducts] = useState<ImportProduct[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [totalFound, setTotalFound] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStoreUrl("");
    setProductUrl("");
    setProductLinks("");
    setBatchId(null);
    setProducts([]);
    setHasMore(false);
    setTotalFound(0);
    setError(null);
    setTab("store");
  }, []);

  // Start store import
  const handleStartStore = async () => {
    if (!storeUrl.trim()) { toast.error("Collez un lien de boutique"); return; }
    setLoading(true);
    setError(null);
    try {
      const result = await startFn({ data: { store_url: storeUrl.trim(), store_name: null } });
      setBatchId(result.batchId);
      if (result.resumed) {
        toast.info(`Reprise de l'import : ${result.totalImported} produits déjà importés`);
      } else {
        toast.success("Import démarré");
      }
      // Fetch first batch
      await loadNextBatch(result.batchId);
    } catch (e: any) {
      setError(e.message || "Erreur");
      toast.error(e.message || "Erreur");
    } finally {
      setLoading(false);
    }
  };

  // Load next batch
  const loadNextBatch = async (bid: string) => {
    setLoading(true);
    try {
      const result = await fetchBatchFn({ data: { batch_id: bid, limit: 10 } });
      setProducts((prev) => [...prev, ...(result.products as ImportProduct[])]);
      setHasMore(result.hasMore);
      setTotalFound(result.totalFound);
      if ((result.products as ImportProduct[]).length === 0 && !result.hasMore) {
        toast.info("Aucun nouveau produit trouvé");
      } else {
        toast.success(`${(result.products as ImportProduct[]).length} produits importés`);
      }
    } catch (e: any) {
      setError(e.message || "Erreur lors du chargement");
      toast.error(e.message || "Erreur");
    } finally {
      setLoading(false);
    }
  };

  // Import single product
  const handleImportSingle = async () => {
    const url = productUrl.trim() || productLinks.trim();
    if (!url) { toast.error("Collez un lien produit"); return; }

    // If multiple links pasted
    const links = url.split(/\n/).map((l) => l.trim()).filter((l) => l.startsWith("http"));
    if (links.length === 0) { toast.error("Aucun lien valide trouvé"); return; }

    setLoading(true);
    setError(null);
    try {
      for (const link of links.slice(0, 10)) {
        const result = await importSingleFn({ data: { product_url: link, batch_id: batchId ?? undefined } }) as any;
        if (result.duplicate) {
          toast.warning(`Doublon : ${link.slice(0, 50)}...`);
        } else {
          setProducts((prev) => [...prev, result.product as ImportProduct]);
          if (!batchId && result.product?.batch_id) setBatchId(result.product.batch_id);
        }
      }
      toast.success(`${Math.min(links.length, 10)} produit(s) traité(s)`);
      setProductUrl("");
      setProductLinks("");
    } catch (e: any) {
      setError(e.message || "Erreur");
      toast.error(e.message || "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Importer depuis Taobao / 1688
          </DialogTitle>
          <DialogDescription>
            Importez des produits en brouillon. Vous pourrez les modifier et les publier ensuite.
            Maximum 10 produits par opération.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "store" | "product")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="store" className="gap-1">
              <Store className="h-3.5 w-3.5" /> Lien boutique
            </TabsTrigger>
            <TabsTrigger value="product" className="gap-1">
              <Link2 className="h-3.5 w-3.5" /> Lien(s) produit
            </TabsTrigger>
          </TabsList>

          {/* Tab: Boutique */}
          <TabsContent value="store" className="space-y-4 pt-3">
            {!batchId ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">Lien de la boutique Taobao / 1688</label>
                  <Input
                    value={storeUrl}
                    onChange={(e) => setStoreUrl(e.target.value)}
                    placeholder="https://shop123456.taobao.com/..."
                  />
                </div>
                <Button onClick={handleStartStore} disabled={loading} className="w-full gap-2">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {loading ? "Analyse en cours..." : "Démarrer l'import"}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg bg-primary/5 p-3 text-sm">
                  <span className="font-medium">{products.length} produits importés</span>
                  {hasMore && <span className="text-muted-foreground">{totalFound} trouvés au total</span>}
                </div>

                {hasMore && (
                  <Button onClick={() => batchId && loadNextBatch(batchId)} disabled={loading} className="w-full gap-2">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                    {loading ? "Chargement..." : "Charger les 10 suivants"}
                  </Button>
                )}

                {!hasMore && products.length > 0 && (
                  <Badge variant="secondary" className="w-full justify-center py-2">
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Import terminé
                  </Badge>
                )}
              </div>
            )}
          </TabsContent>

          {/* Tab: Produit */}
          <TabsContent value="product" className="space-y-4 pt-3">
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Lien produit (ou plusieurs, un par ligne)</label>
                <Textarea
                  value={productUrl || productLinks}
                  onChange={(e) => {
                    setProductUrl(e.target.value);
                    setProductLinks(e.target.value);
                  }}
                  placeholder="https://item.taobao.com/item.htm?id=...&#10;https://detail.1688.com/offer/..."
                  rows={4}
                />
                <p className="text-[10px] text-muted-foreground mt-1">Maximum 10 liens. Collez un lien par ligne.</p>
              </div>
              <Button onClick={handleImportSingle} disabled={loading} className="w-full gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {loading ? "Import en cours..." : "Importer"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* Product list preview */}
        {products.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Produits importés ({products.length})
            </h4>
            <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-1">
              {products.map((p) => (
                <ImportProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Carte produit importé ──

function ImportProductCard({ product }: { product: ImportProduct }) {
  const isDuplicate = !!product.duplicate_of;
  const isDraft = product.status === "draft";

  return (
    <Card className={cn(isDuplicate && "border-amber-300 bg-amber-50/30")}>
      <CardContent className="p-3 flex gap-3">
        {/* Image */}
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
          {product.images[0] ? (
            <img src={product.images[0]} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <ImageIcon className="m-auto mt-4 h-6 w-6 text-muted-foreground" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium truncate">{product.name || "Sans nom"}</p>
            {isDuplicate && (
              <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 shrink-0">
                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> Doublon
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground truncate">{product.source_url.slice(0, 60)}...</p>
          <div className="flex items-center gap-2 mt-1 text-[11px]">
            <span className="text-muted-foreground">Source: {product.source_price > 0 ? `${product.source_price} ${product.source_currency}` : "—"}</span>
            <span className="text-primary font-medium">Vente: {fmtFcfa(product.price)}</span>
            {product.suggested_category_name && (
              <Badge variant="secondary" className="text-[10px]">{product.suggested_category_name}</Badge>
            )}
          </div>
          {product.variants.length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {product.variants.length} variante(s)
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
