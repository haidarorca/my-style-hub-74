/**
 * admin.imports.tsx
 * -----------------
 * Page de gestion des brouillons d'importation IA.
 *
 * - Liste tous les produits importés en brouillon
 * - Permet de modifier, publier ou supprimer
 * - Filtre par batch, statut, recherche
 * - Visualise les doublons
 */

import { useState, useCallback } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Package, Search, Globe, Trash2, Edit3, CheckCircle2, XCircle,
  ExternalLink, ImageIcon, Loader2, AlertTriangle, RefreshCw,
  Store, ChevronDown, ChevronUp, Save, ArrowLeft,
} from "lucide-react";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { ImportStoreDialog } from "@/components/admin/ImportStoreDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  listImportBatches,
  listImportDrafts,
  updateImportDraft,
  publishImportDraft,
  discardImportDraft,
  deleteImportBatch,
  type ImportProduct,
  type ImportBatch,
} from "@/lib/admin-import-store.functions";

export const Route = createFileRoute("/admin/imports")({
  component: () => (
    <PermissionGate perm="products">
      <AdminImports />
    </PermissionGate>
  ),
});

const fmtFcfa = (n: number) => `${Math.round(n || 0).toLocaleString("fr-FR")} FCFA`;

function AdminImports() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("draft");
  const [page, setPage] = useState(1);
  const [importOpen, setImportOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ImportProduct | null>(null);

  const listBatchesFn = useServerFn(listImportBatches);
  const listDraftsFn = useServerFn(listImportDrafts);
  const updateFn = useServerFn(updateImportDraft);
  const publishFn = useServerFn(publishImportDraft);
  const discardFn = useServerFn(discardImportDraft);
  const deleteBatchFn = useServerFn(deleteImportBatch);

  const { data: batches, isLoading: batchesLoading } = useQuery({
    queryKey: ["admin-import-batches"],
    queryFn: () => listBatchesFn({ data: {} }),
  });

  const { data: draftsData, isLoading: draftsLoading } = useQuery({
    queryKey: ["admin-import-drafts", batchFilter, statusFilter, search, page],
    queryFn: () => listDraftsFn({
      data: {
        batch_id: batchFilter === "all" ? null : batchFilter,
        status: statusFilter as "draft" | "published" | "discarded" | null,
        q: search,
        page,
        pageSize: 20,
      },
    }),
  });

  const handlePublish = async (id: string) => {
    try {
      await publishFn({ data: { id } });
      toast.success("Produit publié !");
      qc.invalidateQueries({ queryKey: ["admin-import-drafts"] });
    } catch (e: any) {
      toast.error(e.message || "Erreur");
    }
  };

  const handleDiscard = async (id: string) => {
    try {
      await discardFn({ data: { id } });
      toast.success("Brouillon supprimé");
      qc.invalidateQueries({ queryKey: ["admin-import-drafts"] });
    } catch (e: any) {
      toast.error(e.message || "Erreur");
    }
  };

  const handleDeleteBatch = async (id: string) => {
    if (!window.confirm("Supprimer cet import et tous ses produits ?")) return;
    try {
      await deleteBatchFn({ data: { id } });
      toast.success("Import supprimé");
      qc.invalidateQueries({ queryKey: ["admin-import-batches"] });
      qc.invalidateQueries({ queryKey: ["admin-import-drafts"] });
    } catch (e: any) {
      toast.error(e.message || "Erreur");
    }
  };

  const products = draftsData?.products ?? [];
  const total = draftsData?.total ?? 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Globe className="h-5 w-5" /> Brouillons d'importation
          </h1>
          <p className="text-xs text-muted-foreground">
            Produits importés depuis Taobao/1688 en attente de validation.
          </p>
        </div>
        <Button onClick={() => setImportOpen(true)}>
          <Globe className="mr-1 h-4 w-4" /> Nouvel import
        </Button>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Brouillons" value={batches?.reduce((s: number, b: ImportBatch) => s + (b.status === "running" ? b.total_imported : 0), 0) ?? 0} icon={<Package className="h-4 w-4" />} />
        <StatCard label="Imports" value={batches?.length ?? 0} icon={<Store className="h-4 w-4" />} />
        <StatCard label="Total produits" value={batches?.reduce((s: number, b: ImportBatch) => s + b.total_imported, 0) ?? 0} icon={<CheckCircle2 className="h-4 w-4" />} />
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2">
        <Select value={batchFilter} onValueChange={setBatchFilter}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="Tous les imports" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les imports</SelectItem>
            {(batches ?? []).map((b: ImportBatch) => (
              <SelectItem key={b.id} value={b.id}>
                {b.store_name || b.store_url.slice(0, 30)} ({b.total_imported})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Brouillons</SelectItem>
            <SelectItem value="published">Publiés</SelectItem>
            <SelectItem value="discarded">Supprimés</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="h-8 text-xs"
          />
        </div>
      </div>

      {/* Liste des produits */}
      {draftsLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Package className="mx-auto h-10 w-10 text-muted-foreground opacity-60" />
          <p className="mt-2 text-sm font-semibold">Aucun brouillon</p>
          <p className="text-xs text-muted-foreground">
            Importez des produits depuis Taobao/1688.
          </p>
          <Button onClick={() => setImportOpen(true)} className="mt-4" size="sm">
            <Globe className="mr-1 h-3.5 w-3.5" /> Importer
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {products.map((p: ImportProduct) => (
            <DraftProductCard
              key={p.id}
              product={p}
              onEdit={() => setEditingProduct(p)}
              onPublish={() => handlePublish(p.id)}
              onDiscard={() => handleDiscard(p.id)}
            />
          ))}

          {/* Pagination */}
          {total > 20 && (
            <div className="flex justify-center gap-2 pt-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ArrowLeft className="h-3 w-3" /> Précédent
              </Button>
              <span className="text-xs text-muted-foreground py-2">Page {page}</span>
              <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>
                Suivant <ChevronDown className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Dialog: Import store */}
      <ImportStoreDialog open={importOpen} onOpenChange={setImportOpen} />

      {/* Dialog: Edit product */}
      {editingProduct && (
        <EditProductDialog
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSave={async (id, patch) => {
            await updateFn({ data: { id, ...patch } });
            qc.invalidateQueries({ queryKey: ["admin-import-drafts"] });
            setEditingProduct(null);
          }}
        />
      )}
    </div>
  );
}

// ── Carte brouillon ──

function DraftProductCard({
  product,
  onEdit,
  onPublish,
  onDiscard,
}: {
  product: ImportProduct;
  onEdit: () => void;
  onPublish: () => void;
  onDiscard: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isDuplicate = !!product.duplicate_of;

  return (
    <Card className={cn(isDuplicate && "border-amber-300")}>
      <CardContent className="p-3">
        <div className="flex gap-3">
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
            <p className="text-[11px] text-muted-foreground truncate">{product.source_url.slice(0, 50)}...</p>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px]">
              <span>Source: {product.source_price > 0 ? `${product.source_price} ${product.source_currency}` : "—"}</span>
              <span className="text-primary font-medium">Vente: {fmtFcfa(product.price)}</span>
              {product.suggested_category_name && (
                <Badge variant="secondary" className="text-[10px]">{product.suggested_category_name}</Badge>
              )}
              {product.variants.length > 0 && (
                <span className="text-muted-foreground">{product.variants.length} variantes</span>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setExpanded(!expanded)}>
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Détails
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onEdit}>
                <Edit3 className="h-3 w-3" /> Modifier
              </Button>
              {!isDuplicate && (
                <Button size="sm" className="h-7 text-xs gap-1" onClick={onPublish}>
                  <CheckCircle2 className="h-3 w-3" /> Publier
                </Button>
              )}
              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive gap-1" onClick={onDiscard}>
                <XCircle className="h-3 w-3" /> Ignorer
              </Button>
            </div>
          </div>
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="mt-3 space-y-2 border-t pt-3">
            {product.description && (
              <p className="text-xs text-muted-foreground">{product.description}</p>
            )}
            <div className="flex flex-wrap gap-1">
              {product.images.slice(0, 8).map((img, i) => (
                <img key={i} src={img} alt="" className="h-12 w-12 rounded object-cover border" loading="lazy" />
              ))}
            </div>
            {product.variants.length > 0 && (
              <div className="text-xs">
                <strong>Variantes:</strong> {product.variants.map((v) => `${v.color}${v.size ? ` (${v.size})` : ""}`).join(", ")}
              </div>
            )}
            <a href={product.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              <ExternalLink className="h-3 w-3" /> Voir la source
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Dialogue édition ──

function EditProductDialog({
  product,
  onClose,
  onSave,
}: {
  product: ImportProduct;
  onClose: () => void;
  onSave: (id: string, patch: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description);
  const [price, setPrice] = useState(String(product.price));
  const [sourcePrice, setSourcePrice] = useState(String(product.source_price));
  const [variants, setVariants] = useState(product.variants);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(product.id, {
      name: name.trim(),
      description: description.trim(),
      price: Number(price) || 0,
      source_price: Number(sourcePrice) || 0,
      variants,
    });
    toast.success("Modifications enregistrées");
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit3 className="h-4 w-4" /> Modifier le brouillon
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Nom du produit</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Prix source ({product.source_currency})</label>
              <Input type="number" value={sourcePrice} onChange={(e) => setSourcePrice(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Prix de vente (FCFA)</label>
              <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Description</label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          {/* Variantes */}
          {variants.length > 0 && (
            <div>
              <label className="text-xs text-muted-foreground">Variantes ({variants.length})</label>
              <div className="space-y-1 mt-1">
                {variants.map((v, i) => (
                  <div key={i} className="flex gap-2 text-xs">
                    <Input value={v.size} onChange={(e) => {
                      const nv = [...variants];
                      nv[i] = { ...v, size: e.target.value };
                      setVariants(nv);
                    }} placeholder="Taille" className="h-7 text-xs" />
                    <Input value={v.color} onChange={(e) => {
                      const nv = [...variants];
                      nv[i] = { ...v, color: e.target.value };
                      setVariants(nv);
                    }} placeholder="Couleur" className="h-7 text-xs" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Images */}
          <div>
            <label className="text-xs text-muted-foreground">Images</label>
            <div className="flex flex-wrap gap-1 mt-1">
              {product.images.slice(0, 8).map((img, i) => (
                <img key={i} src={img} alt="" className="h-12 w-12 rounded object-cover border" />
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving} className="flex-1 gap-1">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Enregistrer
            </Button>
            <Button variant="outline" onClick={onClose}>Annuler</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Carte stat ──

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-3 bg-primary/5">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
