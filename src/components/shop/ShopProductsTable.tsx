import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Pencil, Eye, Trash2, Search, Package, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import {
  listShopProducts, toggleProductActive, deleteShopProduct,
  type ShopProductRow,
} from "@/lib/shop-management.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
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
  const [deleteTarget, setDeleteTarget] = useState<ShopProductRow | null>(null);
const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
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
      toast.success("Produit supprimé.");
      qc.invalidateQueries({ queryKey: ["shop-products", shopId] });
      qc.invalidateQueries({ queryKey: ["shop-overview", shopId] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher (nom ou code)…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-8"
          />
        </div>
        <Select value={status} onValueChange={(v: any) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="approved">Approuvés</SelectItem>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="rejected">Refusés</SelectItem>
          </SelectContent>
        </Select>
        <Select value={activeFilter} onValueChange={(v: any) => { setActiveFilter(v); setPage(1); }}>
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

      {/* Empty / loading */}
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
          {/* Mobile cards */}
     {/* Mobile cards */}

<div className="mb-4 flex items-center gap-2">
  <input
    type="checkbox"
    checked={
      rows.length > 0 &&
      selectedProducts.length === rows.length
    }
    onChange={() => {
      if (selectedProducts.length === rows.length) {
        setSelectedProducts([]);
      } else {
        setSelectedProducts(rows.map((p) => p.id));
      }
    }}
  />

  <button
    onClick={async () => {
      const confirmed = window.confirm(
        "Voulez-vous vraiment supprimer les produits sélectionnés ? Cette action est irréversible."
      );

      if (!confirmed) return;

      try {
        for (const productId of selectedProducts) {
          await deleteMut.mutateAsync(productId);
        }

        setSelectedProducts([]);

      } catch (error) {
        console.error(error);
      }
    }}
    disabled={selectedProducts.length === 0}
    className="rounded bg-red-600 px-3 py-2 text-white disabled:opacity-50"
  >
    Supprimer les produits sélectionnés
  </button>
</div>

<ul className="space-y-2 md:hidden">
  {rows.map((p) => (
    <div key={p.id} className="flex items-start gap-2">
      <input
        type="checkbox"
        checked={selectedProducts.includes(p.id)}
        onChange={() => {
          setSelectedProducts((prev) =>
            prev.includes(p.id)
              ? prev.filter((id) => id !== p.id)
              : [...prev, p.id]
          );
        }}
        className="mt-3"
      />

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
    </div>
  ))}
</ul>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2">Produit</th>
                  <th className="p-2">Code</th>
                  <th className="p-2">Prix</th>
                  <th className="p-2">Stock</th>
                  <th className="p-2">Variantes</th>
                  <th className="p-2">Statut</th>
                  <th className="p-2" title="Privé">Vues</th>
                  <th className="p-2" title="Privé">Ventes</th>
                  <th className="p-2">Actif</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-2">
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
                    <td className="p-2 font-mono text-xs">{p.code}</td>
                    <td className="p-2">{p.price.toLocaleString("fr-FR")} F</td>
                    <td className="p-2">{p.stock_total}</td>
                    <td className="p-2">{p.variant_count}</td>
                    <td className="p-2"><StatusBadge status={p.status} /></td>
                    <td className="p-2 text-xs text-muted-foreground">{p.views_count}</td>
                    <td className="p-2 text-xs text-muted-foreground">{p.sales_count}</td>
                    <td className="p-2">
                      <Switch
                        checked={p.is_active}
                        onCheckedChange={(v) => toggleMut.mutate({ productId: p.id, isActive: v })}
                      />
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-1">
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
              onClick={(e) => { e.preventDefault(); if (deleteTarget) deleteMut.mutate(deleteTarget.id); }}
            >
              {deleteMut.isPending ? "Suppression…" : "Supprimer"}
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
    <li className="rounded-xl border bg-card p-3">
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
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={row.is_active} onCheckedChange={onToggle} />
          <span className="text-muted-foreground">{row.is_active ? "Actif" : "Caché"}</span>
        </label>
        <div className="flex gap-1">
          <Button asChild size="icon" variant="ghost" className="h-8 w-8">
            <Link to={editTo} params={{ productId: row.id }}><Pencil className="h-4 w-4" /></Link>
          </Button>
          <Button asChild size="icon" variant="ghost" className="h-8 w-8">
            <Link to="/product/$productId" params={{ productId: row.id }}><Eye className="h-4 w-4" /></Link>
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </li>
  );
}
