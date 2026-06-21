import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ArrowLeft, Ban, CheckCircle2, Trash2, Pencil, MapPin, ShoppingBag,
  Mail, Phone, User as UserIcon, Wallet, CalendarClock, Globe,
} from "lucide-react";
import {
  getCustomerDetail, setCustomerBlocked, deleteCustomer, updateCustomerProfile,
} from "@/lib/admin-customers.functions";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCountries, useCountryLabel } from "@/hooks/use-countries";
import { cn } from "@/lib/utils";
import { useFormatDisplay } from "@/hooks/use-currencies";

export const Route = createFileRoute("/admin/customers/$userId")({
  component: () => (
    <PermissionGate perm="customers">
      <CustomerDetailPage />
    </PermissionGate>
  ),
});

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try { return format(new Date(s), "dd/MM/yyyy HH:mm"); } catch { return "—"; }
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  new: "Nouvelle",
  confirmed: "Confirmée",
  preparing: "En préparation",
  shipped: "Expédiée",
  delivered: "Livrée",
  cancelled: "Annulée",
  refunded: "Remboursée",
};
const ORDER_STATUS_CLS: Record<string, string> = {
  new: "bg-blue-500/15 text-blue-700",
  confirmed: "bg-indigo-500/15 text-indigo-700",
  preparing: "bg-amber-500/15 text-amber-700",
  shipped: "bg-violet-500/15 text-violet-700",
  delivered: "bg-emerald-500/15 text-emerald-700",
  cancelled: "bg-destructive/15 text-destructive",
  refunded: "bg-muted text-foreground",
};

function CustomerDetailPage() {
  const fmtMoney = useFormatDisplay();
  const { userId } = Route.useParams();
  const qc = useQueryClient();
  const fetchDetail = useServerFn(getCustomerDetail);
  const setBlocked = useServerFn(setCustomerBlocked);
  const update = useServerFn(updateCustomerProfile);
  const del = useServerFn(deleteCustomer);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "customers", userId],
    queryFn: () => fetchDetail({ data: { user_id: userId } }),
  });

  const { data: countries } = useCountries({ onlyEnabled: false });
  const labelOf = useCountryLabel();
  const countryName = (id: string | null) => {
    if (!id) return "—";
    const c = countries?.find((x) => x.id === id);
    return c ? `${c.flag_emoji ?? ""} ${labelOf(c)}` : "—";
  };

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", phone: "", address: "" });
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);

  function openEdit() {
    setForm({
      full_name: data?.full_name ?? "",
      phone: data?.phone ?? "",
      address: data?.address ?? "",
    });
    setEditOpen(true);
  }

  async function saveEdit() {
    setBusy(true);
    try {
      await update({
        data: {
          user_id: userId,
          full_name: form.full_name.trim() || null,
          phone: form.phone.trim() || null,
          address: form.address.trim() || null,
        },
      });
      toast.success("Informations mises à jour");
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ["admin", "customers"] });
      qc.invalidateQueries({ queryKey: ["admin", "customers", userId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  async function toggleBlock() {
    if (!data) return;
    setBusy(true);
    try {
      await setBlocked({ data: { user_id: userId, blocked: data.status !== "blocked" } });
      toast.success(data.status === "blocked" ? "Compte débloqué" : "Compte bloqué");
      qc.invalidateQueries({ queryKey: ["admin", "customers"] });
      qc.invalidateQueries({ queryKey: ["admin", "customers", userId] });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await del({ data: { user_id: userId } });
      toast.success("Compte supprimé");
      qc.invalidateQueries({ queryKey: ["admin", "customers"] });
      window.history.back();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  if (error || !data) {
    return (
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm"><Link to="/admin/customers"><ArrowLeft className="mr-1 h-4 w-4" /> Retour</Link></Button>
        <p className="text-sm text-destructive">{(error as Error)?.message ?? "Client introuvable"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm"><Link to="/admin/customers"><ArrowLeft className="mr-1 h-4 w-4" /> Tous les clients</Link></Button>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={openEdit}><Pencil className="mr-1 h-3.5 w-3.5" /> Modifier</Button>
          <Button size="sm" variant={data.status === "blocked" ? "default" : "outline"} onClick={toggleBlock} disabled={busy}>
            {data.status === "blocked" ? <><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Débloquer</> : <><Ban className="mr-1 h-3.5 w-3.5" /> Bloquer</>}
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setConfirmDel(true)} disabled={busy}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Supprimer
          </Button>
        </div>
      </div>

      {/* Header card */}
      <Card>
        <CardContent className="flex flex-wrap items-start gap-4 p-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UserIcon className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold">{data.full_name || "Sans nom"}</h1>
              <span className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                data.status === "blocked" ? "bg-destructive/15 text-destructive" : "bg-emerald-500/15 text-emerald-700",
              )}>
                {data.status === "blocked" ? <Ban className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                {data.status === "blocked" ? "Bloqué" : "Actif"}
              </span>
            </div>
            <div className="mt-1 grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
              <div className="flex items-center gap-1"><Mail className="h-3 w-3" /> {data.email ?? "—"}</div>
              <div className="flex items-center gap-1"><Phone className="h-3 w-3" /> {data.phone ?? "—"}</div>
              <div className="flex items-center gap-1"><Globe className="h-3 w-3" /> {countryName(data.default_country_id)}</div>
              <div className="flex items-center gap-1"><CalendarClock className="h-3 w-3" /> Inscrit {fmtDate(data.created_at)}</div>
              <div className="flex items-center gap-1"><CalendarClock className="h-3 w-3" /> Dernière connexion {fmtDate(data.last_sign_in_at)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <Card>
          <CardHeader className="p-3 pb-1"><CardTitle className="text-[11px] font-medium text-muted-foreground">Commandes</CardTitle></CardHeader>
          <CardContent className="p-3 pt-0"><div className="flex items-center gap-2 text-lg font-bold"><ShoppingBag className="h-4 w-4 text-primary" />{data.stats.orders_count}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="p-3 pb-1"><CardTitle className="text-[11px] font-medium text-muted-foreground">Total dépensé</CardTitle></CardHeader>
          <CardContent className="p-3 pt-0"><div className="flex items-center gap-2 text-lg font-bold"><Wallet className="h-4 w-4 text-amber-600" />{fmtMoney(data.stats.total_spent)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="p-3 pb-1"><CardTitle className="text-[11px] font-medium text-muted-foreground">Adresses</CardTitle></CardHeader>
          <CardContent className="p-3 pt-0"><div className="flex items-center gap-2 text-lg font-bold"><MapPin className="h-4 w-4 text-blue-600" />{data.addresses.length}</div></CardContent>
        </Card>
      </div>

      {/* Addresses */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Adresses enregistrées</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {data.addresses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune adresse enregistrée.</p>
          ) : data.addresses.map((a) => (
            <div key={a.id} className={cn("rounded-lg border p-3", a.is_default && "border-primary/40 bg-primary/5")}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">{a.label}</div>
                {a.is_default && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">Par défaut</span>}
              </div>
              <div className="mt-1 text-xs">{a.full_name} · {a.phone}</div>
              <div className="text-xs text-muted-foreground">{a.address}, {a.city} · {countryName(a.destination_country_id)}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Orders */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Historique des commandes</CardTitle></CardHeader>
        <CardContent>
          {data.orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune commande pour ce client.</p>
          ) : (
            <ul className="divide-y">
              {data.orders.map((o) => (
                <li key={o.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">#{o.id.slice(0, 8)}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", ORDER_STATUS_CLS[o.status] ?? "bg-muted text-foreground")}>
                        {ORDER_STATUS_LABEL[o.status] ?? o.status}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">{fmtDate(o.created_at)} · {o.items_count} article{o.items_count > 1 ? "s" : ""}</div>
                  </div>
                  <div className="text-sm font-semibold">{fmtMoney(o.total)}</div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier les informations</DialogTitle>
            <DialogDescription>L'email et le mot de passe ne peuvent pas être modifiés ici pour des raisons de sécurité.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Nom complet</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div><Label className="text-xs">Téléphone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label className="text-xs">Adresse</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Annuler</Button>
            <Button onClick={saveEdit} disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer définitivement ce compte ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le compte de <strong>{data.full_name || data.email || "ce client"}</strong> sera supprimé. Les commandes passées resteront archivées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
