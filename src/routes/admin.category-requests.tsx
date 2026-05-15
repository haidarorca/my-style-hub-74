import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X, GitMerge, Pencil, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/category-requests")({
  component: CategoryRequestsPage,
});

type Cat = { id: string; name: string; level: number; parent_id: string | null };
type Req = {
  id: string;
  vendor_id: string;
  level: number;
  name: string;
  parent_id: string | null;
  status: "pending" | "approved" | "rejected" | "merged";
  admin_note: string | null;
  resolved_category_id: string | null;
  created_at: string;
};

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function CategoryRequestsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  const { data: requests } = useQuery({
    queryKey: ["admin", "category-requests", filter],
    queryFn: async () => {
      let q = supabase.from("category_requests").select("*").order("created_at", { ascending: false });
      if (filter === "pending") q = q.eq("status", "pending");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Req[];
    },
  });

  const { data: cats } = useQuery({
    queryKey: ["admin", "all-categories"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, name, level, parent_id").order("position");
      return (data ?? []) as Cat[];
    },
  });

  const { data: vendors } = useQuery({
    queryKey: ["admin", "vendor-names", (requests ?? []).map((r) => r.vendor_id).join(",")],
    enabled: !!requests && requests.length > 0,
    queryFn: async () => {
      const ids = Array.from(new Set((requests ?? []).map((r) => r.vendor_id)));
      const { data } = await supabase.from("profiles").select("id, shop_name, full_name").in("id", ids);
      return (data ?? []) as { id: string; shop_name: string | null; full_name: string | null }[];
    },
  });

  const vendorMap = useMemo(() => {
    const m = new Map<string, string>();
    (vendors ?? []).forEach((v) => m.set(v.id, v.shop_name || v.full_name || "Vendeur"));
    return m;
  }, [vendors]);

  const catMap = useMemo(() => {
    const m = new Map<string, Cat>();
    (cats ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [cats]);

  function pathOf(id: string | null): string {
    if (!id) return "—";
    const parts: string[] = [];
    let cur: Cat | undefined = catMap.get(id);
    while (cur) {
      parts.unshift(cur.name);
      cur = cur.parent_id ? catMap.get(cur.parent_id) : undefined;
    }
    return parts.join(" › ");
  }

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin", "category-requests"] });
    qc.invalidateQueries({ queryKey: ["admin", "products"] });
    qc.invalidateQueries({ queryKey: ["admin", "category-requests-pending-count"] });
  };

  async function linkProductsToCategory(reqId: string, categoryId: string) {
    const { error } = await supabase
      .from("products")
      .update({ category_id: categoryId, pending_category_request_id: null })
      .eq("pending_category_request_id", reqId);
    if (error) throw error;
  }

  async function resolveChildRequests(reqId: string, newCategoryId: string) {
    // Pending child requests had their parent set to this request — re-link to the freshly created category.
    const { error } = await supabase
      .from("category_requests")
      .update({ parent_id: newCategoryId, parent_request_id: null })
      .eq("parent_request_id", reqId)
      .eq("status", "pending");
    if (error) throw error;
  }

  async function notifyVendor(vendorId: string, title: string, message: string) {
    await supabase.from("notifications").insert({
      user_id: vendorId,
      title,
      message,
      link: "/vendor/notifications",
    });
  }

  async function approve(req: Req, finalName: string) {
    const trimmed = finalName.trim();
    if (trimmed.length < 2) return toast.error("Nom trop court.");
    const renamed = trimmed !== req.name.trim();
    const { data: created, error: insErr } = await supabase
      .from("categories")
      .insert({
        name: trimmed,
        slug: slugify(trimmed) + "-" + Math.random().toString(36).slice(2, 6),
        level: req.level,
        parent_id: req.parent_id,
        position: 999,
      })
      .select("id")
      .single();
    if (insErr) return toast.error(insErr.message);
    const { error: upErr } = await supabase
      .from("category_requests")
      .update({ status: "approved", resolved_category_id: created.id, admin_note: null })
      .eq("id", req.id);
    if (upErr) return toast.error(upErr.message);
    try {
      await linkProductsToCategory(req.id, created.id);
      await resolveChildRequests(req.id, created.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de propagation");
    }
    await notifyVendor(
      req.vendor_id,
      renamed ? "Catégorie acceptée (renommée)" : "Catégorie acceptée",
      renamed
        ? `Votre proposition « ${req.name} » a été acceptée sous le nom « ${trimmed} ». Vos produits liés sont débloqués.`
        : `Votre catégorie « ${trimmed} » a été acceptée. Vos produits liés sont débloqués.`,
    );
    toast.success("Catégorie créée. Produits liés débloqués.");
    refresh();
    qc.invalidateQueries({ queryKey: ["admin", "categories"] });
  }

  async function merge(req: Req, targetId: string) {
    if (!targetId) return toast.error("Choisissez une catégorie.");
    const target = catMap.get(targetId);
    const { error } = await supabase
      .from("category_requests")
      .update({ status: "merged", resolved_category_id: targetId })
      .eq("id", req.id);
    if (error) return toast.error(error.message);
    try {
      await linkProductsToCategory(req.id, targetId);
      await resolveChildRequests(req.id, targetId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de propagation");
    }
    await notifyVendor(
      req.vendor_id,
      "Catégorie fusionnée",
      `Votre proposition « ${req.name} » a été fusionnée avec « ${target?.name ?? "une catégorie existante"} ». Vos produits liés sont débloqués.`,
    );
    toast.success("Demande fusionnée. Produits liés débloqués.");
    refresh();
  }

  async function reject(req: Req, note: string) {
    const trimmedNote = note.trim();
    const { error } = await supabase
      .from("category_requests")
      .update({ status: "rejected", admin_note: trimmedNote || null })
      .eq("id", req.id);
    if (error) return toast.error(error.message);
    // Cascade-reject child pending requests (their parent no longer exists)
    await supabase
      .from("category_requests")
      .update({ status: "rejected", admin_note: "Refus en cascade : catégorie parente refusée." })
      .eq("parent_request_id", req.id)
      .eq("status", "pending");
    await notifyVendor(
      req.vendor_id,
      "Catégorie refusée",
      `Votre proposition « ${req.name} » a été refusée${trimmedNote ? ` : ${trimmedNote}` : "."} Modifiez vos produits pour choisir une autre catégorie.`,
    );
    toast.success("Demande refusée.");
    refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Demandes de catégories</h1>
        <Select value={filter} onValueChange={(v) => setFilter(v as "pending" | "all")}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="all">Toutes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {(!requests || requests.length === 0) && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-sm text-muted-foreground">
          <Inbox className="mb-2 h-6 w-6" />
          Aucune demande {filter === "pending" ? "en attente" : ""}.
        </div>
      )}

      <div className="space-y-2">
        {(requests ?? []).map((r) => (
          <RequestRow
            key={r.id}
            req={r}
            vendorName={vendorMap.get(r.vendor_id) ?? "Vendeur"}
            parentPath={pathOf(r.parent_id)}
            cats={cats ?? []}
            onApprove={async (r, n) => { await approve(r, n); }}
            onMerge={async (r, t) => { await merge(r, t); }}
            onReject={async (r, n) => { await reject(r, n); }}
          />
        ))}
      </div>
    </div>
  );
}

function RequestRow({
  req, vendorName, parentPath, cats, onApprove, onMerge, onReject,
}: {
  req: Req;
  vendorName: string;
  parentPath: string;
  cats: Cat[];
  onApprove: (req: Req, finalName: string) => Promise<void>;
  onMerge: (req: Req, targetId: string) => Promise<void>;
  onReject: (req: Req, note: string) => Promise<void>;
}) {
  const [editName, setEditName] = useState(req.name);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const candidates = cats.filter(
    (c) => c.level === req.level && (req.level === 1 || c.parent_id === req.parent_id),
  );

  const statusBadge = {
    pending: "bg-amber-500/15 text-amber-700",
    approved: "bg-emerald-500/15 text-emerald-700",
    rejected: "bg-rose-500/15 text-rose-700",
    merged: "bg-blue-500/15 text-blue-700",
  }[req.status];

  const statusLabel = {
    pending: "En attente",
    approved: "Acceptée",
    rejected: "Refusée",
    merged: "Fusionnée",
  }[req.status];

  const wrap = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">Niveau {req.level}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge}`}>{statusLabel}</span>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              par <b className="text-foreground/80">{vendorName}</b> · parent: {parentPath}
            </p>
          </div>
        </div>

        {req.status === "pending" ? (
          <>
            <div className="flex items-center gap-2">
              <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <Input
                className="h-9"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={80}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => wrap(() => onApprove(req, editName))} disabled={busy}>
                <Check className="mr-1 h-3.5 w-3.5" /> Accepter
              </Button>
              <Button size="sm" variant="outline" onClick={() => setMergeOpen(true)} disabled={busy}>
                <GitMerge className="mr-1 h-3.5 w-3.5" /> Fusionner
              </Button>
              <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700" onClick={() => setRejectOpen(true)} disabled={busy}>
                <X className="mr-1 h-3.5 w-3.5" /> Refuser
              </Button>
            </div>
          </>
        ) : (
          <p className="text-xs text-foreground/80">
            <b>{req.name}</b>
            {req.admin_note && <span className="block text-[11px] text-muted-foreground">Note : {req.admin_note}</span>}
          </p>
        )}
      </CardContent>

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Fusionner avec une catégorie existante</DialogTitle>
            <DialogDescription className="text-xs">
              La demande sera marquée comme fusionnée. Aucune nouvelle catégorie ne sera créée.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Catégorie existante (niveau {req.level})</Label>
            <Select value={mergeTarget} onValueChange={setMergeTarget}>
              <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
              <SelectContent>
                {candidates.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMergeOpen(false)}>Annuler</Button>
            <Button onClick={() => wrap(async () => { await onMerge(req, mergeTarget); setMergeOpen(false); })} disabled={busy}>
              Fusionner
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Refuser la demande</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Raison (optionnel)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Ex. Doublon, hors-sujet…" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>Annuler</Button>
            <Button variant="destructive" onClick={() => wrap(async () => { await onReject(req, note); setRejectOpen(false); })} disabled={busy}>
              Refuser
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
