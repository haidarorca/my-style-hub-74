import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X, Pencil, Trash2, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";

export const Route = createFileRoute("/admin/products")({
  component: ProductsPage,
});

type ProductRow = {
  id: string; name: string; code: string; price: number;
  description: string | null;
  designation: string | null;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  is_edit: boolean | null;
  product_images: { url: string }[] | null;
  vendor_id: string;
  pending_category_request_id: string | null;
  pending_category_request: { id: string; level: number; name: string; status: string } | null;
};

type Variant = {
  id: string; size: string | null; color: string | null;
  color_hex: string | null; stock: number; price_override: number | null;
  image_url: string | null;
};

type Customization = {
  id: string; type: string;
  allow_all_fonts: boolean | null; allowed_fonts: string[] | null;
  allow_all_colors: boolean | null; allowed_colors: string[] | null;
  image_size_message: string | null;
};

function ProductDetailDialog({ product, onClose }: { product: ProductRow | null; onClose: () => void }) {
  const { data: details } = useQuery({
    queryKey: ["admin", "product-details", product?.id],
    enabled: !!product,
    queryFn: async () => {
      const [imgs, vars, custs, vendor] = await Promise.all([
        supabase.from("product_images").select("url, position").eq("product_id", product!.id).order("position"),
        supabase.from("product_variants").select("*").eq("product_id", product!.id),
        supabase.from("product_customizations").select("*").eq("product_id", product!.id),
        supabase.from("profiles").select("full_name, shop_name, email, phone").eq("id", product!.vendor_id).maybeSingle(),
      ]);
      return {
        images: (imgs.data ?? []) as { url: string; position: number }[],
        variants: (vars.data ?? []) as Variant[],
        customizations: (custs.data ?? []) as Customization[],
        vendor: vendor.data as { full_name: string | null; shop_name: string | null; email: string | null; phone: string | null } | null,
      };
    },
  });

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product?.name}</DialogTitle>
          <DialogDescription>Code {product?.code} • {product?.price} FCFA</DialogDescription>
        </DialogHeader>
        {!product ? null : (
          <div className="space-y-4 text-sm">
            {details?.vendor && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-xs font-semibold text-muted-foreground">Vendeur</div>
                <div>{details.vendor.shop_name || details.vendor.full_name || "—"}</div>
                <div className="text-xs text-muted-foreground">{details.vendor.email}{details.vendor.phone && ` • ${details.vendor.phone}`}</div>
              </div>
            )}

            {product.designation && (
              <div><div className="text-xs font-semibold text-muted-foreground">Désignation</div><div>{product.designation}</div></div>
            )}
            {product.description && (
              <div><div className="text-xs font-semibold text-muted-foreground">Description</div><div className="whitespace-pre-wrap">{product.description}</div></div>
            )}

            <div>
              <div className="mb-2 text-xs font-semibold text-muted-foreground">Images ({details?.images.length ?? 0})</div>
              <div className="grid grid-cols-3 gap-2">
                {details?.images.map((im, i) => (
                  <a key={i} href={im.url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg bg-muted">
                    <img src={im.url} alt="" className="h-full w-full object-cover" />
                  </a>
                ))}
                {details && details.images.length === 0 && <div className="col-span-3 text-xs text-muted-foreground">Aucune image.</div>}
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold text-muted-foreground">Variantes ({details?.variants.length ?? 0})</div>
              {details && details.variants.length === 0 ? (
                <div className="text-xs text-muted-foreground">Aucune variante.</div>
              ) : (
                <ul className="space-y-2">
                  {details?.variants.map((v) => (
                    <li key={v.id} className="flex items-center gap-2 rounded-lg border p-2">
                      {v.image_url ? (
                        <a href={v.image_url} target="_blank" rel="noreferrer" className="h-12 w-12 shrink-0 overflow-hidden rounded bg-muted">
                          <img src={v.image_url} alt="" className="h-full w-full object-cover" />
                        </a>
                      ) : v.color_hex ? (
                        <div className="h-12 w-12 shrink-0 rounded border" style={{ background: v.color_hex }} />
                      ) : (
                        <div className="h-12 w-12 shrink-0 rounded bg-muted" />
                      )}
                      <div className="flex-1 text-xs">
                        {v.color && <div><b>Couleur/Modèle :</b> {v.color}</div>}
                        {v.size && <div><b>Taille :</b> {v.size}</div>}
                        <div className="text-muted-foreground">Stock {v.stock}{v.price_override != null && ` • ${v.price_override} FCFA`}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {details && details.customizations.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-semibold text-muted-foreground">Personnalisation</div>
                <ul className="space-y-2">
                  {details.customizations.map((c) => (
                    <li key={c.id} className="rounded-lg border p-2 text-xs">
                      <div className="font-semibold">Type : {c.type}</div>
                      {c.type === "image" && c.image_size_message && <div>Consignes image : {c.image_size_message}</div>}
                      {c.type === "logo" && (
                        <>
                          <div>Polices : {c.allow_all_fonts ? "toutes" : (c.allowed_fonts ?? []).join(", ") || "—"}</div>
                          <div>Couleurs : {c.allow_all_colors ? "toutes" : (c.allowed_colors ?? []).join(", ") || "—"}</div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>Fermer</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductList({ status }: { status: "pending" | "approved" | "rejected" }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [viewing, setViewing] = useState<ProductRow | null>(null);
  const [editForm, setEditForm] = useState({ name: "", price: "", description: "" });

  const { data: items } = useQuery({
    queryKey: ["admin", "products", status],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, code, price, description, designation, status, rejection_reason, is_edit, vendor_id, pending_category_request_id, product_images(url), pending_category_request:category_requests!products_pending_category_request_id_fkey(id, level, name, status)")
        .eq("status", status)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProductRow[];
    },
  });

  async function setStatus(id: string, next: "approved" | "rejected") {
    const payload: { status: "approved" | "rejected"; rejection_reason?: string | null; is_edit?: boolean } = { status: next };
    if (next === "rejected") payload.rejection_reason = reason[id] || "Non conforme";
    else payload.rejection_reason = null;
    if (next === "approved") payload.is_edit = false;
    const { error } = await supabase.from("products").update(payload).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(next === "approved" ? "Approuvé" : "Rejeté");
    qc.invalidateQueries({ queryKey: ["admin", "products"] });
  }

  async function deleteProduct(id: string) {
    if (!confirm("Supprimer définitivement ce produit ?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Produit supprimé");
    qc.invalidateQueries({ queryKey: ["admin", "products"] });
  }

  function openEdit(p: ProductRow) {
    setEditing(p);
    setEditForm({ name: p.name, price: String(p.price), description: p.description ?? "" });
  }

  async function saveEdit() {
    if (!editing) return;
    const { error } = await supabase.from("products").update({
      name: editForm.name.trim(),
      price: Number(editForm.price) || 0,
      description: editForm.description.trim() || null,
    }).eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Produit mis à jour");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["admin", "products"] });
  }

  if (!items) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Aucun produit.</p>;

  return (
    <ul className="space-y-3">
      {items.map((p) => {
        const img = p.product_images?.[0]?.url;
        const blockedByCat = !!p.pending_category_request_id && p.pending_category_request?.status === "pending";
        return (
          <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
              {img && <img src={img} alt={p.name} className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="truncate text-sm font-semibold">{p.name}</div>
                {p.is_edit && status === "pending" && (
                  <Badge variant="outline" className="border-amber-500 text-amber-600">Modification</Badge>
                )}
                {!p.is_edit && status === "pending" && (
                  <Badge variant="secondary">Nouveau</Badge>
                )}
                {blockedByCat && (
                  <Badge variant="outline" className="border-amber-600 text-amber-700">
                    Catégorie en attente : « {p.pending_category_request?.name} »
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">Code {p.code} • {p.price} FCFA</div>
              {p.rejection_reason && <div className="mt-1 text-xs text-destructive">Motif : {p.rejection_reason}</div>}
            </div>
            {status === "pending" ? (
              <div className="flex w-full items-center gap-2 md:w-auto">
                <Input
                  placeholder="Motif de rejet (optionnel)"
                  value={reason[p.id] ?? ""}
                  onChange={(e) => setReason({ ...reason, [p.id]: e.target.value })}
                  className="h-8"
                />
                <Button size="sm" variant="outline" onClick={() => setStatus(p.id, "rejected")}>
                  <X className="mr-1 h-4 w-4" /> Rejeter
                </Button>
                <Button
                  size="sm"
                  onClick={() => setStatus(p.id, "approved")}
                  disabled={blockedByCat}
                  title={blockedByCat ? "Validez d'abord la catégorie proposée" : undefined}
                >
                  <Check className="mr-1 h-4 w-4" /> Approuver
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Badge variant={status === "approved" ? "default" : "destructive"}>{status}</Badge>
                {status === "rejected" && (
                  <Button size="sm" onClick={() => setStatus(p.id, "approved")}>Approuver</Button>
                )}
                {status === "approved" && (
                  <Button size="sm" variant="outline" onClick={() => setStatus(p.id, "rejected")}>Retirer</Button>
                )}
              </div>
            )}
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setViewing(p)} title="Voir détails">
                <Eye className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(p)} title="Modifier">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => deleteProduct(p.id)} title="Supprimer">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </li>
        );
      })}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier le produit</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nom</Label><Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></div>
            <div><Label>Prix (FCFA)</Label><Input type="number" value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea rows={4} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Annuler</Button>
            <Button onClick={saveEdit}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ProductDetailDialog product={viewing} onClose={() => setViewing(null)} />
    </ul>
  );
}

function ProductsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Validation des produits</h1>
      <Card>
        <CardHeader><CardTitle className="text-base">Modération</CardTitle></CardHeader>
        <CardContent>
          <Tabs defaultValue="pending">
            <TabsList>
              <TabsTrigger value="pending">À valider</TabsTrigger>
              <TabsTrigger value="approved">Approuvés</TabsTrigger>
              <TabsTrigger value="rejected">Rejetés</TabsTrigger>
            </TabsList>
            <TabsContent value="pending" className="mt-4"><ProductList status="pending" /></TabsContent>
            <TabsContent value="approved" className="mt-4"><ProductList status="approved" /></TabsContent>
            <TabsContent value="rejected" className="mt-4"><ProductList status="rejected" /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
