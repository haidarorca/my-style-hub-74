import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Star, Trash2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/reviews")({
  component: AdminReviewsPage,
});

function StarPick({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)}>
          <Star className={`h-5 w-5 ${n <= value ? "fill-primary text-primary" : "text-muted-foreground"}`} />
        </button>
      ))}
    </div>
  );
}

function AdminReviewsPage() {
  const qc = useQueryClient();
  const [filterProduct, setFilterProduct] = useState<string>("");

  const { data: reviews } = useQuery({
    queryKey: ["admin-reviews", filterProduct],
    queryFn: async () => {
      let q = supabase
        .from("product_reviews")
        .select("id, rating, comment, created_at, user_id, product_id")
        .order("created_at", { ascending: false })
        .limit(200);
      if (filterProduct) q = q.eq("product_id", filterProduct);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data ?? [];
      const productIds = Array.from(new Set(rows.map((r) => r.product_id)));
      const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
      const [{ data: prods }, { data: profs }] = await Promise.all([
        productIds.length
          ? supabase.from("products").select("id, name, code").in("id", productIds)
          : Promise.resolve({ data: [] as any[] }),
        userIds.length
          ? supabase.from("profiles").select("id, full_name, email").in("id", userIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const pMap = new Map((prods ?? []).map((p) => [p.id, p]));
      const uMap = new Map((profs ?? []).map((p) => [p.id, p]));
      return rows.map((r) => ({
        ...r,
        product: pMap.get(r.product_id),
        author: uMap.get(r.user_id),
      }));
    },
  });

  const { data: products } = useQuery({
    queryKey: ["all-products-light"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, code")
        .order("name")
        .limit(500);
      return data ?? [];
    },
  });

  const { data: users } = useQuery({
    queryKey: ["all-users-light"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name")
        .limit(500);
      return data ?? [];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-reviews"] });

  // Create fake review
  const [createOpen, setCreateOpen] = useState(false);
  const [newProduct, setNewProduct] = useState("");
  const [newUser, setNewUser] = useState("");
  const [newRating, setNewRating] = useState(5);
  const [newComment, setNewComment] = useState("");

  const createReview = async () => {
    if (!newProduct || !newUser || newComment.trim().length < 3) {
      toast.error("Renseignez produit, utilisateur et commentaire");
      return;
    }
    const { error } = await supabase.from("product_reviews").insert({
      product_id: newProduct,
      user_id: newUser,
      rating: newRating,
      comment: newComment.trim(),
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Avis créé");
      setCreateOpen(false);
      setNewProduct(""); setNewUser(""); setNewComment(""); setNewRating(5);
      refresh();
    }
  };

  // Edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editRating, setEditRating] = useState(5);
  const [editComment, setEditComment] = useState("");

  const saveEdit = async () => {
    if (!editId) return;
    const { error } = await supabase
      .from("product_reviews")
      .update({ rating: editRating, comment: editComment.trim() })
      .eq("id", editId);
    if (error) toast.error(error.message);
    else {
      toast.success("Avis modifié");
      setEditId(null);
      refresh();
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("product_reviews").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Supprimé");
      refresh();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold">Gestion des avis</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-full">
              <Plus className="h-4 w-4 mr-1" /> Créer un avis
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Créer un avis (au nom d'un client)</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-xs font-semibold">Produit</p>
                <Select value={newProduct} onValueChange={setNewProduct}>
                  <SelectTrigger><SelectValue placeholder="Choisir un produit" /></SelectTrigger>
                  <SelectContent>
                    {products?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name} ({p.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold">Utilisateur (auteur)</p>
                <Select value={newUser} onValueChange={setNewUser}>
                  <SelectTrigger><SelectValue placeholder="Choisir un utilisateur" /></SelectTrigger>
                  <SelectContent>
                    {users?.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold">Note</p>
                <StarPick value={newRating} onChange={setNewRating} />
              </div>
              <Textarea placeholder="Commentaire…" value={newComment} onChange={(e) => setNewComment(e.target.value)} rows={4} />
              <Button onClick={createReview} className="rounded-full">Publier</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-2">
        <p className="text-xs text-muted-foreground">Filtrer :</p>
        <Select value={filterProduct || "__all__"} onValueChange={(v) => setFilterProduct(v === "__all__" ? "" : v)}>
          <SelectTrigger className="h-8 w-64"><SelectValue placeholder="Tous les produits" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Tous les produits</SelectItem>
            {products?.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {reviews && reviews.length > 0 ? (
          reviews.map((r) => (
            <div key={r.id} className="rounded-xl border bg-card p-3">
              {editId === r.id ? (
                <div className="space-y-2">
                  <StarPick value={editRating} onChange={setEditRating} />
                  <Textarea value={editComment} onChange={(e) => setEditComment(e.target.value)} rows={3} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveEdit} className="rounded-full">Enregistrer</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Annuler</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">
                        {r.product?.name ?? r.product_id} • {r.author?.full_name || r.author?.email || r.user_id}
                      </p>
                      <div className="mt-1 flex items-center gap-1">
                        {[1,2,3,4,5].map((n) => (
                          <Star key={n} className={`h-3.5 w-3.5 ${n <= r.rating ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                        ))}
                      </div>
                      {r.comment && <p className="mt-1 text-sm whitespace-pre-wrap">{r.comment}</p>}
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditId(r.id); setEditRating(r.rating); setEditComment(r.comment ?? ""); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove(r.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Aucun avis.</p>
        )}
      </div>
    </div>
  );
}
