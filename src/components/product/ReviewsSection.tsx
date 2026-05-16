import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, Trash2, Pencil, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  is_verified: boolean;
  is_own: boolean;
  author_name: string;
}

function StarRow({ value, onChange, size = 16 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          className={onChange ? "cursor-pointer" : "cursor-default"}
        >
          <Star
            className={n <= value ? "fill-primary text-primary" : "text-muted-foreground"}
            style={{ width: size, height: size }}
          />
        </button>
      ))}
    </div>
  );
}

export function ReviewsSection({ productId }: { productId: string }) {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editComment, setEditComment] = useState("");
  const [editRating, setEditRating] = useState(5);

  const { data: reviews } = useQuery({
    queryKey: ["reviews", productId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("public_product_reviews" as never)
        .select("id, rating, comment, created_at, is_verified")
        .eq("product_id", productId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        id: string;
        rating: number;
        comment: string | null;
        created_at: string;
        is_verified: boolean;
      }>;
      // Overlay ownership for current user (RLS already allows reading own rows from the base table)
      let ownIds = new Set<string>();
      if (user) {
        const { data: own } = await supabase
          .from("product_reviews")
          .select("id")
          .eq("product_id", productId)
          .eq("user_id", user.id);
        ownIds = new Set((own ?? []).map((r) => r.id));
      }
      return rows.map((r) => ({
        ...r,
        is_own: ownIds.has(r.id),
        author_name: ownIds.has(r.id) ? "Vous" : "Client",
      })) as Review[];
    },
  });

  // Commandes livrées de l'utilisateur pour ce produit, qui n'ont pas encore d'avis
  const { data: eligibleOrderIds } = useQuery({
    queryKey: ["reviews-eligibility", productId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [] as string[];
      const { data: items, error } = await supabase
        .from("order_items")
        .select("order_id, orders!inner(status, buyer_id)")
        .eq("product_id", productId)
        .eq("buyer_id", user.id)
        .eq("orders.status", "delivered");
      if (error) throw error;
      const orderIds = Array.from(new Set((items ?? []).map((i) => i.order_id)));
      if (orderIds.length === 0) return [];
      const { data: existing } = await supabase
        .from("product_reviews")
        .select("order_id")
        .eq("product_id", productId)
        .eq("user_id", user.id)
        .in("order_id", orderIds);
      const used = new Set((existing ?? []).map((r) => r.order_id));
      return orderIds.filter((id) => !used.has(id));
    },
  });

  const canReview = !!user && (eligibleOrderIds?.length ?? 0) > 0;

  const avg = reviews && reviews.length > 0
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : 0;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["reviews", productId] });
    qc.invalidateQueries({ queryKey: ["reviews-eligibility", productId, user?.id] });
  };

  const submit = async () => {
    if (!user) {
      toast.error("Connectez-vous pour laisser un avis");
      return;
    }
    if (!canReview || !eligibleOrderIds || eligibleOrderIds.length === 0) {
      toast.error("Seuls les acheteurs ayant reçu ce produit peuvent laisser un avis");
      return;
    }
    if (comment.trim().length < 3) {
      toast.error("Écrivez un commentaire");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("product_reviews").insert({
      product_id: productId,
      user_id: user.id,
      order_id: eligibleOrderIds[0],
      rating,
      comment: comment.trim(),
    });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Avis publié");
      setComment("");
      setRating(5);
      refresh();
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("product_reviews").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Avis supprimé");
      refresh();
    }
  };

  const startEdit = (r: Review) => {
    setEditingId(r.id);
    setEditComment(r.comment ?? "");
    setEditRating(r.rating);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const { error } = await supabase
      .from("product_reviews")
      .update({ rating: editRating, comment: editComment.trim() })
      .eq("id", editingId);
    if (error) toast.error(error.message);
    else {
      toast.success("Avis modifié");
      setEditingId(null);
      refresh();
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">Avis clients</h2>
        {reviews && reviews.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs">
            <StarRow value={Math.round(avg)} size={14} />
            <span className="font-semibold">{avg.toFixed(1)}</span>
            <span className="text-muted-foreground">({reviews.length})</span>
          </div>
        )}
      </div>

      {/* New review form — only for verified buyers */}
      {canReview && (
        <div className="rounded-xl border border-border bg-card p-3 space-y-2">
          <p className="text-xs font-semibold">Votre note</p>
          <StarRow value={rating} onChange={setRating} size={20} />
          <Textarea
            placeholder="Partagez votre expérience…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
          />
          <Button onClick={submit} disabled={submitting} className="rounded-full">
            Publier l'avis
          </Button>
        </div>
      )}

      {/* List */}
      <div className="space-y-2">
        {reviews && reviews.length > 0 ? (
          reviews.map((r) => {
            const name = r.profiles?.full_name || r.profiles?.email || "Client";
            const isOwn = user?.id === r.user_id;
            const canEdit = isOwn || isAdmin;
            const verified = !!r.order_id;
            return (
              <div key={r.id} className="rounded-xl border border-border bg-card p-3">
                {editingId === r.id ? (
                  <div className="space-y-2">
                    <StarRow value={editRating} onChange={setEditRating} size={18} />
                    <Textarea value={editComment} onChange={(e) => setEditComment(e.target.value)} rows={3} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveEdit} className="rounded-full">Enregistrer</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Annuler</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-semibold">{name}</p>
                          {verified && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-semibold">
                              <ShieldCheck className="h-3 w-3" />
                              Achat vérifié
                            </span>
                          )}
                        </div>
                        <StarRow value={r.rating} size={12} />
                      </div>
                      {canEdit && (
                        <div className="flex gap-1">
                          {isOwn && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(r)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove(r.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                    {r.comment && (
                      <p className="mt-1.5 text-sm text-muted-foreground whitespace-pre-wrap">{r.comment}</p>
                    )}
                  </>
                )}
              </div>
            );
          })
        ) : (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Aucun avis pour l'instant.
          </p>
        )}
      </div>

      {user && !canReview && (
        <p className="text-[11px] text-muted-foreground text-center">
          Seuls les clients ayant reçu ce produit peuvent laisser un avis.
        </p>
      )}
    </section>
  );
}
