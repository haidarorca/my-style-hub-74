import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Pencil,
  Eye,
  Trash2,
  Search,
  Package,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import {
  listShopProducts,
  toggleProductActive,
  deleteShopProduct,
  type ShopProductRow,
} from "@/lib/shop-management.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  shopId: string;
  /** Where to send the "edit" / "new" / "view" actions */
  editTo: "/vendor/products/$productId/edit" | "/admin/products/$productId/edit";
  newTo?: { to: string; params?: Record<string, string> };
}

export function ShopProductsTable({ shopId, editTo, newTo }: Props) {
  const qc = useQueryClient();
  const fetchList = useServerFn(listShopProducts);
  const toggleFn = useServerFn(toggleProductActive);
  const deleteFn = useServerFn(deleteShopProduct);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  
  // États de sélection et de popups
  const [deleteTarget, setDeleteTarget] = useState<ShopProductRow | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  
  const pageSize = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["shop-products", shopId, page, search, status, activeFilter],
    queryFn: () => fetchList({ data: { shopId, page, pageSize, search, status, activeFilter } }),
    staleTime: 30_000,
  });

  const toggleMut = useMutation({
    mutationFn: (v: { productId: string; isActive: boolean }) => toggleFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shop-products", shopId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (productId: string) => deleteFn({ data: { productId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shop-products", shopId] });
      qc.invalidateQueries({ queryKey: ["shop-overview", shopId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Logique utilitaire pour gérer les sélections
  const isAllSelected = rows.length > 0 && selectedProducts.length === rows.length;
  
  const handleSelectAll = () => {
    if (isAllSelected) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(rows.map((p) => p.id));
    }
  };

  const handleSelectOne = (productId: string) => {
    setSelectedProducts((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
  };

  // Traitement optimisé de la suppression groupée en arrière-plan
  const handleBulkDelete = async () => {
    setIsBulkDeleting(true);
    try {
      // Exécution parallèle des requêtes pour des performances maximales
      await Promise.all(selectedProducts.map((id) => deleteMut.mutateAsync(id)));
      
      toast.success("Produits sélectionnés supprimés.");
      setSelectedProducts([]);
      
      // Rafraîchissement du cache de données (une seule fois à la fin)
      qc.invalidateQueries({ queryKey: ["shop-products", shopId] });
      qc.invalidateQueries({ queryKey: ["shop-overview", shopId] });
    } catch (error) {
      // Les erreurs individuelles sont gérées par le onError de deleteMut
    } finally {
      setIsBulkDeleting(false);
      setIsBulkDeleteOpen(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher (nom ou code)…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); setSelectedProducts([]); }}
            className="pl-8"
          />
        </div>
        <Select value={status} onValueChange={(v: any) => { setStatus(v); setPage(1); setSelectedProducts([]); }}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="approved">Approuvés</SelectItem>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="rejected">Refusés</SelectItem>
          </SelectContent>
        </Select>
        <Select value={activeFilter} onValueChange={(v: any) => { setActiveFilter(v); setPage(1); setSelectedProducts([]); }}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous (actifs+inactifs)</SelectItem>
            <SelectItem value="active">Actifs</SelectItem>
            <SelectItem value="inactive">Inactifs</SelectItem>
          </SelectContent>
        </Select>
        {newTo && (
          <Button asChild size="sm">
            <Link to={newTo.to as any} params={newTo.params as any}>
              <Plus className="mr-1 h-4 w-4" /> Ajouter
            </Link>
          </Button>
        )}
      </div>

      {/* Barre d'action de groupe (S'affiche dès qu'un produit au moins est sélectionné) */}
      {selectedProducts.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-destructive/20 bg-destructive/5 p-3 animate-in fade-in-50 duration-200">
          <span className="text-sm font-medium text-destructive">
            {selectedProducts.length} produit(s) sélectionné(s)
          </span>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => setIsBulkDeleteOpen(true)}
          >
            Supprimer les produits sélectionnés
          </Button>
        </div>
      )}

      {/* Chargement / Liste vide */}
      {isLoading ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Chargement…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <Package className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">Aucun produit pour le moment.</p>
        </div>
      ) : (
        <>
          {/* VERSION MOBILE (Téléphones) */}
          <div className="space-y-3 md:hidden">
            <div className="flex items-center p-1">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={handleSelectAll}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                Sélectionner tout ({rows.length})
              </label>
            </div>

            <ul className="space-y-2">
              {rows.map((p) => (
                <li key={p.id} className="flex items-start gap-2">
                  <div className="pt-4 pl-1">
                    <input
                      type="checkbox"
                      checked={selectedProducts.includes(p.id)}
                      onChange={() => handleSelectOne(p.id)}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                  </div>
                  <div className="flex-1">
                    <ProductMobileCard
                      row={p}
                      editTo={editTo}
                      onToggle={(v) =>
                        toggleMut.mutate({
                          productId: p.id,
                          isActive: v,
                        })
                      }
                      onDelete={() => setDeleteTarget(p)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* VERSION DESKTOP (Ordinateurs) */}
          <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3 w-10">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleSelectAll}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                  </th>
                  <th className="p-3">Produit</th>
                  <th className="p-3">Code</th>
                  <th className="p-3">Prix</th>
                  <th className="p-3">Stock</th>
                  <th className="p-3">Variantes</th>
                  <th className="p-3">Statut</th>
                  <th className="p-3" title="Privé">Vues</th>
                  <th className="p-3" title="Privé">Ventes</th>
                  <th className="p-3">Actif</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className={`border-t transition-colors hover:bg-muted/30 ${selectedProducts.includes(p.id) ? 'bg-muted/50' : ''}`}>
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selectedProducts.includes(p.id)}
                        onChange={() => handleSelectOne(p.id)}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-muted">
                          {p.image_url && <img src={p.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{p.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {new Date(p.created_at).toLocaleDateString("fr-FR")}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 font-mono text-xs">{p.code}</td>
                    <td className="p-3">{p.price.toLocaleString("fr-FR")} F</td>
                    <td className="p-3">{p.stock_total}</td>
                    <td className="p-3">{p.variant_count}</td>
                    <td className="p-3"><StatusBadge status={p.status} /></td>
                    <td className="p-3 text-xs text-muted-foreground">{p.views_count}</td>
                    <td className="p-3 text-xs text-muted-foreground">{p.sales_count}</td>
                    <td className="p-3">
                      <Switch
                        checked={p.is_active}
                        onCheckedChange={(v) => toggleMut.mutate({ productId: p.id, isActive: v })}
                      />
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="Modifier">
                          <Link to={editTo} params={{ productId: p.id }}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="Voir">
                          <Link to="/product/$productId" params={{ productId: p.id }}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          title="Supprimer"
                          onClick={() => setDeleteTarget(p)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                Page {page} / {totalPages} — {total} produit(s)
              </span>
              <div className="flex gap-1">
                <Button size="icon" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* POPUP DE CONFIRMATION : Suppression d'un seul produit */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce produit ?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold text-foreground">{deleteTarget?.name}</span> sera supprimé définitivement.
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { 
                e.preventDefault(); 
                if (deleteTarget) {
                  deleteMut.mutate(deleteTarget.id, {
                    onSuccess: () => setDeleteTarget(null)
                  });
                }
              }}
            >
              {deleteMut.isPending ? "Suppression…" : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* POPUP DE CONFIRMATION : Suppression groupée */}
      <AlertDialog open={isBulkDeleteOpen} onOpenChange={setIsBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer les produits sélectionnés ?</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous vraiment supprimer les produits sélectionnés ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); handleBulkDelete(); }}
              disabled={isBulkDeleting}
            >
              {isBulkDeleting ? "Suppression…" : "Supprimer les articles"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusBadge({ status }: { status: ShopProductRow["status"] }) {
  if (status === "approved") return <Badge>Approuvé</Badge>;
  if (status === "rejected") return <Badge variant="destructive">Refusé</Badge>;
  return <Badge variant="secondary">En attente</Badge>;
}

function ProductMobileCard({
  row, editTo, onToggle, onDelete,
}: {
  row: ShopProductRow;
  editTo: Props["editTo"];
  onToggle: (v: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-start gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
          {row.image_url && <img src={row.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{row.name}</div>
          <div className="text-[11px] text-muted-foreground">
            Code {row.code} • {row.price.toLocaleString("fr-FR")} F
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
            <span>Stock {row.stock_total}</span>·
            <span>{row.variant_count} variante(s)</span>·
            <StatusBadge status={row.status} />
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span title="Privé">👁 {row.views_count} vues</span>
            <span title="Privé">🛒 {row.sales_count} ventes</span>
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
          <Switch checked={row.is_active} onCheckedChange={onToggle} />
          <span>{row.is_active ? "Actif" : "Inactif"}</span>
        </label>
        <div className="flex items-center gap-2">
          <Link to={editTo} params={{ productId: row.id }} className="text-xs underline">
            Éditer
          </Link>
          <button onClick={onDelete} className="text-xs text-destructive underline">
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

