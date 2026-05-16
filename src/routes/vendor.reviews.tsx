import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Star, Search, MessageSquare, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/vendor/reviews")({
  component: VendorReviewsPage,
});

const PAGE_SIZE = 15;

function Stars({ value }: { value: number }) {
  return (
    <div className="flex">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn("h-3.5 w-3.5", i <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} />
      ))}
    </div>
  );
}

function VendorReviewsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "unanswered" | "answered">("all");
  const [page, setPage] = useState(0);
  const [replyOpen, setReplyOpen] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setPage(0); }, [search, filter]);

  // Vendor's product ids
  const { data: productIds = [] } = useQuery({
    queryKey: ["vendor-product-ids", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id").eq("vendor_id", user!.id);
      return (data ?? []).map((p: any) => p.id) as string[];
    },
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["vendor-reviews", user?.id, { search: search.trim(), filter, page, n: productIds.length }],
    enabled: !!user && productIds.length >= 0,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (productIds.length === 0) return { rows: [], total: 0, avg: 0, byStar: {} as Record<number, number> };

      let q = supabase
        .from("product_reviews")
        .select("id, product_id, rating, comment, photos, created_at, vendor_response, vendor_response_at, product:products(id, name, code)", { count: "exact" })
        .in("product_id", productIds)
        .order("created_at", { ascending: false });
      if (filter === "unanswered") q = q.is("vendor_response", null);
      if (filter === "answered") q = q.not("vendor_response", "is", null);
      if (search.trim()) {
        const esc = search.trim().replace(/[%,()]/g, " ");
        q = q.ilike("comment", `%${esc}%`);
      }
      const from = page * PAGE_SIZE;
      const { data: rows, count, error } = await q.range(from, from + PAGE_SIZE - 1);
      if (error) throw error;

      const { data: all } = await supabase
        .from("product_reviews").select("rating").in("product_id", productIds);
      const ratings = (all ?? []).map((r: any) => r.rating as number);
      const avg = ratings.length ? ratings.reduce((s, n) => s + n, 0) / ratings.length : 0;
      const byStar: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      ratings.forEach((r) => { byStar[r] = (byStar[r] ?? 0) + 1; });

      return { rows: rows ?? [], total: count ?? 0, avg, byStar };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function submitReply(reviewId: string) {
    if (!replyText.trim()) return toast.error("Réponse vide");
    setSaving(true);
    const { error } = await supabase
      .from("product_reviews")
      .update({ vendor_response: replyText.trim(), vendor_response_at: new Date().toISOString() })
      .eq("id", reviewId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Réponse envoyée");
    setReplyOpen(null); setReplyText("");
    qc.invalidateQueries({ queryKey: ["vendor-reviews"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Avis reçus</h1>
        <span className="text-xs text-muted-foreground">{total} avis{isFetching && !isLoading ? " · …" : ""}</span>
      </div>

      {/* Summary card */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold">{(data?.avg ?? 0).toFixed(1)}</span>
              <Stars value={Math.round(data?.avg ?? 0)} />
            </div>
            <p className="text-xs text-muted-foreground">Note moyenne sur toutes vos boutiques</p>
          </div>
          <div className="flex flex-col gap-1 text-xs">
            {[5, 4, 3, 2, 1].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <span className="w-4 text-right">{s}</span>
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                <div className="h-1.5 w-32 overflow-hidden rounded bg-muted">
                  <div className="h-full bg-amber-400"
                    style={{ width: `${(data?.byStar?.[s] ?? 0) / Math.max(1, Object.values(data?.byStar ?? {}).reduce((a: number, b) => a + (b as number), 0)) * 100}%` }} />
                </div>
                <span className="text-muted-foreground">{data?.byStar?.[s] ?? 0}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher dans les commentaires…" className="pl-8" />
        </div>
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3">
          {(["all", "unanswered", "answered"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium",
                filter === f ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent")}>
              {f === "all" ? "Tous" : f === "unanswered" ? "Sans réponse" : "Avec réponse"}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          Aucun avis pour le moment.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r: any) => {
            const answered = !!r.vendor_response;
            return (
              <Card key={r.id} className="overflow-hidden">
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="text-sm truncate">{r.product?.name ?? "Produit"}</CardTitle>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Stars value={r.rating} />
                      <span>· {new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <Badge variant={answered ? "secondary" : "destructive"}>{answered ? "Répondu" : "À traiter"}</Badge>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  {r.comment && <p className="text-sm whitespace-pre-wrap">{r.comment}</p>}
                  {r.photos?.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto">
                      {r.photos.map((url: string, i: number) => (
                        <img key={i} src={url} alt="" className="h-16 w-16 shrink-0 rounded-lg border object-cover" />
                      ))}
                    </div>
                  )}

                  {answered ? (
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-2">
                      <div className="mb-1 text-[11px] font-semibold text-primary">Votre réponse · {r.vendor_response_at && new Date(r.vendor_response_at).toLocaleDateString()}</div>
                      <p className="text-sm whitespace-pre-wrap">{r.vendor_response}</p>
                      <Button size="sm" variant="ghost" className="mt-1 h-7 text-xs"
                        onClick={() => { setReplyOpen(r.id); setReplyText(r.vendor_response); }}>
                        Modifier
                      </Button>
                    </div>
                  ) : replyOpen === r.id ? (
                    <div className="space-y-2 rounded-lg border bg-muted/30 p-2">
                      <Textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={3} placeholder="Répondre poliment et professionnellement…" />
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => { setReplyOpen(null); setReplyText(""); }}>Annuler</Button>
                        <Button size="sm" onClick={() => submitReply(r.id)} disabled={saving}>
                          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          Envoyer
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => { setReplyOpen(r.id); setReplyText(""); }}>
                      <MessageSquare className="mr-1 h-3.5 w-3.5" /> Répondre
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <span className="text-xs text-muted-foreground">Page {page + 1} / {totalPages}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Préc.</Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Suiv.</Button>
          </div>
        </div>
      )}
    </div>
  );
}
