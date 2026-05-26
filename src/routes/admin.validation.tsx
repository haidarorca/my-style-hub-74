/**
 * admin.validation.tsx — File d'attente validation produits (P0)
 * Workflow: pending → published / rejected → archived
 */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { AdminTabs, AdminTabList, AdminTabTrigger, AdminTabContent } from "@/components/admin/AdminTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search, CheckCircle2, XCircle, Archive, Eye, MoreVertical, PackageCheck, Clock, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/validation")({
  component: ValidationDashboard,
});

type ProductStatus = "pending" | "published" | "rejected" | "archived";

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  status: ProductStatus;
  category_id: string | null;
  user_id: string | null;
  shop_id: string | null;
  images: string[] | null;
  created_at: string;
  profiles: { full_name: string | null } | null;
  shops: { name: string | null } | null;
}

const STATUS_LABELS: Record<ProductStatus, { label: string; icon: typeof Clock; variant: string }> = {
  pending:   { label: "En attente",   icon: Clock,        variant: "outline" },
  published: { label: "Publié",       icon: CheckCircle2, variant: "default" },
  rejected:  { label: "Rejeté",       icon: XCircle,      variant: "destructive" },
  archived:  { label: "Archivé",      icon: Archive,      variant: "secondary" },
};

const TABS: { value: ProductStatus | "all"; label: string }[] = [
  { value: "all",       label: "Tous" },
  { value: "pending",   label: "En attente" },
  { value: "published", label: "Publiés" },
  { value: "rejected",  label: "Rejetés" },
  { value: "archived",  label: "Archivés" },
];

function ValidationDashboard() {
  const { isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<ProductStatus | "all">("pending");
  const [search, setSearch] = useState("");
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);

  /* ── Fetch ── */
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["admin-validation-products", tab],
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("id, name, description, price, status, category_id, user_id, shop_id, images, created_at, profiles(full_name), shops(name)")
        .order("created_at", { ascending: false });
      if (tab !== "all") q = q.eq("status", tab);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Product[];
    },
  });

  /* ── Mutations ── */
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ProductStatus }) => {
      const { error } = await supabase.from("products").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin-validation-products"] });
      toast({ title: "Statut mis à jour", description: `Produit ${STATUS_LABELS[vars.status].label.toLowerCase()}` });
      setDetailProduct(null);
    },
    onError: (e) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-validation-products"] });
      toast({ title: "Produit supprimé" });
      setDetailProduct(null);
    },
    onError: (e) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  /* ── Filter ── */
  const filtered = products.filter((p) =>
    search.trim() === "" ||
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.description?.toLowerCase().includes(search.toLowerCase())
  );

  const counts = {
    all: products.length,
    pending: products.filter((p) => p.status === "pending").length,
    published: products.filter((p) => p.status === "published").length,
    rejected: products.filter((p) => p.status === "rejected").length,
    archived: products.filter((p) => p.status === "archived").length,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <PackageCheck className="h-5 w-5" />
            Validation produits
          </h1>
          <p className="text-sm text-muted-foreground">
            {counts.pending} en attente · {counts.published} publiés · {counts.rejected} rejetés
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un produit…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Tabs */}
      <AdminTabs value={tab} onValueChange={(v) => setTab(v as ProductStatus | "all")}>
        <AdminTabList>
          {TABS.map((t) => (
            <AdminTabTrigger key={t.value} value={t.value}>
              {t.label}
              <span className={cn("ml-1.5 text-[10px] tabular-nums", tab === t.value ? "opacity-80" : "opacity-50")}>
                {counts[t.value] ?? 0}
              </span>
            </AdminTabTrigger>
          ))}
        </AdminTabList>

        {TABS.map((t) => (
          <AdminTabContent key={t.value} value={t.value} className="mt-4">
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground text-sm">Chargement…</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm flex flex-col items-center gap-2">
                <AlertCircle className="h-8 w-8 opacity-30" />
                Aucun produit {t.value === "all" ? "" : t.label.toLowerCase()}
              </div>
            ) : (
              <div className="grid gap-3">
                {filtered.map((product) => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    onView={() => setDetailProduct(product)}
                    onUpdate={(status) => updateStatus.mutate({ id: product.id, status })}
                    onDelete={isSuperAdmin ? () => deleteProduct.mutate(product.id) : undefined}
                    isLoading={updateStatus.isPending}
                  />
                ))}
              </div>
            )}
          </AdminTabsContent>
        ))}
      </AdminTabs>

      {/* Detail Dialog */}
      {detailProduct && (
        <Dialog open onOpenChange={() => setDetailProduct(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base">{detailProduct.name}</DialogTitle>
              <DialogDescription className="text-xs">
                Par {detailProduct.profiles?.full_name ?? "—"} · Boutique {detailProduct.shops?.name ?? "—"}
              </DialogDescription>
            </DialogHeader>

            {detailProduct.images && detailProduct.images.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {detailProduct.images.map((img, i) => (
                  <img key={i} src={img} alt="" className="h-24 w-24 object-cover rounded-lg border shrink-0" />
                ))}
              </div>
            )}

            <div className="text-sm space-y-2">
              <p className="text-muted-foreground whitespace-pre-wrap text-xs leading-relaxed">
                {detailProduct.description || "Aucune description"}
              </p>
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold">{detailProduct.price.toLocaleString()} FCFA</span>
                <StatusBadge status={detailProduct.status} />
              </div>
            </div>

            <DialogFooter className="flex flex-wrap gap-2">
              {detailProduct.status === "pending" && (
                <>
                  <Button size="sm" onClick={() => updateStatus.mutate({ id: detailProduct.id, status: "published" })} disabled={updateStatus.isPending}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Publier
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => updateStatus.mutate({ id: detailProduct.id, status: "rejected" })} disabled={updateStatus.isPending}>
                    <XCircle className="h-4 w-4 mr-1" /> Rejeter
                  </Button>
                </>
              )}
              {detailProduct.status === "rejected" && (
                <Button size="sm" onClick={() => updateStatus.mutate({ id: detailProduct.id, status: "pending" })} disabled={updateStatus.isPending}>
                  <Clock className="h-4 w-4 mr-1" /> Remettre en attente
                </Button>
              )}
              {detailProduct.status !== "archived" && (
                <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: detailProduct.id, status: "archived" })} disabled={updateStatus.isPending}>
                  <Archive className="h-4 w-4 mr-1" /> Archiver
                </Button>
              )}
              {isSuperAdmin && (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteProduct.mutate(detailProduct.id)} disabled={deleteProduct.isPending}>
                  Supprimer
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function ProductRow({
  product,
  onView,
  onUpdate,
  onDelete,
  isLoading,
}: {
  product: Product;
  onView: () => void;
  onUpdate: (s: ProductStatus) => void;
  onDelete?: () => void;
  isLoading: boolean;
}) {
  const status = STATUS_LABELS[product.status];
  const StatusIcon = status.icon;

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-3 flex items-center gap-3">
        {/* Image */}
        <div className="h-14 w-14 shrink-0 rounded-lg border bg-muted overflow-hidden">
          {product.images && product.images[0] ? (
            <img src={product.images[0]} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-muted-foreground">
              <PackageCheck className="h-5 w-5 opacity-30" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{product.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <StatusBadge status={product.status} />
            <span className="text-xs text-muted-foreground">
              {product.price.toLocaleString()} FCFA
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground truncate">
            Par {product.profiles?.full_name ?? "—"} · {product.shops?.name ?? "—"}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onView}>
            <Eye className="h-4 w-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {product.status === "pending" && (
                <>
                  <DropdownMenuItem onClick={() => onUpdate("published")} disabled={isLoading}>
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Publier
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onUpdate("rejected")} disabled={isLoading} className="text-destructive">
                    <XCircle className="h-4 w-4 mr-2" /> Rejeter
                  </DropdownMenuItem>
                </>
              )}
              {product.status === "rejected" && (
                <DropdownMenuItem onClick={() => onUpdate("pending")} disabled={isLoading}>
                  <Clock className="h-4 w-4 mr-2" /> Remettre en attente
                </DropdownMenuItem>
              )}
              {product.status !== "archived" && (
                <DropdownMenuItem onClick={() => onUpdate("archived")} disabled={isLoading}>
                  <Archive className="h-4 w-4 mr-2" /> Archiver
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem onClick={onDelete} className="text-destructive">
                  Supprimer définitivement
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: ProductStatus }) {
  const cfg = STATUS_LABELS[status];
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant as never} className="text-[10px] h-5 gap-1">
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}
