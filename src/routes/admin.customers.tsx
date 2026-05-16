import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Search, X, Eye, Ban, CheckCircle2, MoreHorizontal, Trash2, ShoppingBag,
  Users, UserCheck, UserX, Wallet,
} from "lucide-react";
import {
  listCustomers, setCustomerBlocked, deleteCustomer,
  type CustomerListRow,
} from "@/lib/admin-customers.functions";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useCountries, useCountryLabel } from "@/hooks/use-countries";

export const Route = createFileRoute("/admin/customers")({
  component: () => (
    <PermissionGate perm="customers">
      <CustomersPage />
    </PermissionGate>
  ),
});

type StatusFilter = "all" | "active" | "blocked";
type OrdersFilter = "all" | "with" | "without";

function StatusBadge({ status }: { status: "active" | "blocked" }) {
  if (status === "blocked") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive">
        <Ban className="h-3 w-3" /> Bloqué
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
      <CheckCircle2 className="h-3 w-3" /> Actif
    </span>
  );
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try { return format(new Date(s), "dd/MM/yyyy"); } catch { return "—"; }
}
function fmtMoney(n: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) + " FCFA";
}

function DateMini({ label, value, onChange }: { label: string; value?: Date; onChange: (d?: Date) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 w-full justify-start text-xs">
          {value ? format(value, "dd/MM/yyyy") : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={onChange} initialFocus />
      </PopoverContent>
    </Popover>
  );
}

function CustomersPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listCustomers);
  const setBlocked = useServerFn(setCustomerBlocked);
  const del = useServerFn(deleteCustomer);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "customers"],
    queryFn: () => fetchList(),
  });

  const { data: countries } = useCountries({ onlyEnabled: true });
  const labelOf = useCountryLabel();
  const countryName = (id: string | null) => {
    if (!id) return "—";
    const c = countries?.find((x) => x.id === id);
    return c ? `${c.flag_emoji ?? ""} ${labelOf(c)}` : "—";
  };

  const [query, setQuery] = useState("");
  const [fStatus, setFStatus] = useState<StatusFilter>("all");
  const [fCountry, setFCountry] = useState<string>("all");
  const [fOrders, setFOrders] = useState<OrdersFilter>("all");
  const [fFrom, setFFrom] = useState<Date | undefined>();
  const [fTo, setFTo] = useState<Date | undefined>();

  const filtered = useMemo(() => {
    const list = data ?? [];
    const q = query.trim().toLowerCase();
    return list
      .filter((c) => {
        if (q) {
          const hay = `${c.email ?? ""} ${c.full_name ?? ""} ${c.phone ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (fStatus !== "all" && c.status !== fStatus) return false;
        if (fCountry !== "all" && c.default_country_id !== fCountry) return false;
        if (fOrders === "with" && c.orders_count === 0) return false;
        if (fOrders === "without" && c.orders_count > 0) return false;
        if (fFrom && new Date(c.created_at) < fFrom) return false;
        if (fTo) {
          const e = new Date(fTo); e.setHours(23, 59, 59, 999);
          if (new Date(c.created_at) > e) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [data, query, fStatus, fCountry, fOrders, fFrom, fTo]);

  const stats = useMemo(() => {
    const list = data ?? [];
    return {
      total: list.length,
      active: list.filter((c) => c.status === "active").length,
      blocked: list.filter((c) => c.status === "blocked").length,
      revenue: list.reduce((s, c) => s + c.total_spent, 0),
    };
  }, [data]);

  const [confirmDelete, setConfirmDelete] = useState<CustomerListRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggleBlock(c: CustomerListRow) {
    setBusyId(c.user_id);
    try {
      await setBlocked({ data: { user_id: c.user_id, blocked: c.status !== "blocked" } });
      toast.success(c.status === "blocked" ? "Compte débloqué" : "Compte bloqué");
      qc.invalidateQueries({ queryKey: ["admin", "customers"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setBusyId(confirmDelete.user_id);
    try {
      await del({ data: { user_id: confirmDelete.user_id } });
      toast.success("Compte supprimé");
      setConfirmDelete(null);
      qc.invalidateQueries({ queryKey: ["admin", "customers"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const filtersActive =
    query || fStatus !== "all" || fCountry !== "all" || fOrders !== "all" || fFrom || fTo;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Clients</h1>
          <p className="text-xs text-muted-foreground">
            {filtered.length} sur {data?.length ?? 0}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatTile label="Clients" value={stats.total} icon={Users} color="text-primary" />
        <StatTile label="Actifs" value={stats.active} icon={UserCheck} color="text-emerald-600" />
        <StatTile label="Bloqués" value={stats.blocked} icon={UserX} color="text-destructive" />
        <StatTile label="Revenu total" value={fmtMoney(stats.revenue)} icon={Wallet} color="text-amber-600" />
      </div>

      <Card>
        <CardContent className="space-y-3 p-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Nom, email, téléphone…"
                className="pl-8"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Select value={fStatus} onValueChange={(v) => setFStatus(v as StatusFilter)}>
              <SelectTrigger><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="active">Actif</SelectItem>
                <SelectItem value="blocked">Bloqué</SelectItem>
              </SelectContent>
            </Select>
            <Select value={fCountry} onValueChange={setFCountry}>
              <SelectTrigger><SelectValue placeholder="Pays" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les pays</SelectItem>
                {(countries ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.flag_emoji ?? "🏳️"} {labelOf(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fOrders} onValueChange={(v) => setFOrders(v as OrdersFilter)}>
              <SelectTrigger><SelectValue placeholder="Commandes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Avec ou sans commande</SelectItem>
                <SelectItem value="with">Avec commandes</SelectItem>
                <SelectItem value="without">Sans commande</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div>
              <Label className="text-[10px] text-muted-foreground">Inscrit depuis</Label>
              <DateMini label="Depuis" value={fFrom} onChange={setFFrom} />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Inscrit jusqu'à</Label>
              <DateMini label="Jusqu'à" value={fTo} onChange={setFTo} />
            </div>
          </div>
          {filtersActive && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setQuery(""); setFStatus("all"); setFCountry("all");
                setFOrders("all"); setFFrom(undefined); setFTo(undefined);
              }}
            >
              <X className="mr-1 h-3 w-3" /> Réinitialiser les filtres
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Liste des clients</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile cards */}
          <div className="space-y-2 p-3 md:hidden">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Chargement…</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun client trouvé.</p>
            ) : (
              filtered.map((c) => (
                <div key={c.user_id} className="rounded-lg border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {c.full_name || c.email || "Sans nom"}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{c.email ?? "—"}</div>
                      <div className="truncate text-xs text-muted-foreground">{c.phone ?? "—"}</div>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                    <div><div className="text-muted-foreground">Pays</div><div className="font-medium">{countryName(c.default_country_id)}</div></div>
                    <div><div className="text-muted-foreground">Cmd</div><div className="font-medium">{c.orders_count}</div></div>
                    <div><div className="text-muted-foreground">Dépensé</div><div className="font-medium">{fmtMoney(c.total_spent)}</div></div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-[10px] text-muted-foreground">
                      Inscrit {fmtDate(c.created_at)} · Dernière connexion {fmtDate(c.last_sign_in_at)}
                    </div>
                    <div className="flex gap-1">
                      <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                        <Link to="/admin/customers/$userId" params={{ userId: c.user_id }}>
                          <Eye className="mr-1 h-3 w-3" /> Voir
                        </Link>
                      </Button>
                      <RowActions
                        row={c}
                        busy={busyId === c.user_id}
                        onToggleBlock={() => toggleBlock(c)}
                        onDelete={() => setConfirmDelete(c)}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Pays livraison</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Commandes</TableHead>
                  <TableHead>Dépensé</TableHead>
                  <TableHead>Inscrit</TableHead>
                  <TableHead>Dernière connexion</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground">Chargement…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground">Aucun client.</TableCell></TableRow>
                ) : filtered.map((c) => (
                  <TableRow key={c.user_id}>
                    <TableCell>
                      <div className="font-medium">{c.full_name || "—"}</div>
                      <div className="text-xs text-muted-foreground font-mono">{c.user_id.slice(0, 8)}…</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs">{c.email ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{c.phone ?? "—"}</div>
                    </TableCell>
                    <TableCell className="text-xs">{countryName(c.default_country_id)}</TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                    <TableCell>
                      <div className="inline-flex items-center gap-1 text-xs">
                        <ShoppingBag className="h-3 w-3 text-muted-foreground" />
                        {c.orders_count}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-medium">{fmtMoney(c.total_spent)}</TableCell>
                    <TableCell className="text-xs">{fmtDate(c.created_at)}</TableCell>
                    <TableCell className="text-xs">{fmtDate(c.last_sign_in_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                          <Link to="/admin/customers/$userId" params={{ userId: c.user_id }}>
                            <Eye className="mr-1 h-3 w-3" /> Détail
                          </Link>
                        </Button>
                        <RowActions
                          row={c}
                          busy={busyId === c.user_id}
                          onToggleBlock={() => toggleBlock(c)}
                          onDelete={() => setConfirmDelete(c)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce compte client ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est <strong>irréversible</strong>. Le compte de{" "}
              <strong>{confirmDelete?.full_name || confirmDelete?.email || "ce client"}</strong> sera
              définitivement supprimé. Les commandes passées resteront archivées.
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

function StatTile({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: typeof Users; color: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
        <CardTitle className="text-[11px] font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={cn("h-4 w-4", color)} />
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <div className="text-lg font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function RowActions({
  row, busy, onToggleBlock, onDelete,
}: {
  row: CustomerListRow;
  busy: boolean;
  onToggleBlock: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={busy}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onToggleBlock}>
          {row.status === "blocked" ? (
            <><CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" /> Débloquer</>
          ) : (
            <><Ban className="mr-2 h-4 w-4 text-destructive" /> Bloquer</>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" /> Supprimer
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
