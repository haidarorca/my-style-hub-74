import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Search, X, Eye, Ban, CheckCircle2, MoreHorizontal, Trash2, ShoppingBag,
  Users, UserCheck, UserX, Wallet, UserPlus,
} from "lucide-react";
import {
  listCustomers, setCustomerBlocked, deleteCustomer, createCustomerAccount,
  type CustomerListRow,
} from "@/lib/admin-customers.functions";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { cn } from "@/lib/utils";
import { useCountries, useCountryLabel } from "@/hooks/use-countries";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useFormatDisplay } from "@/hooks/use-currencies";

const searchSchema = z.object({
  page: fallback(z.number().int().min(1), 1).default(1),
  q: fallback(z.string(), "").default(""),
  status: fallback(z.enum(["all", "active", "blocked"]), "all").default("all"),
  country: fallback(z.string(), "all").default("all"),
  has_orders: fallback(z.enum(["all", "with", "without"]), "all").default("all"),
});
type SearchState = z.infer<typeof searchSchema>;

const PAGE_SIZE = 25;

export const Route = createFileRoute("/admin/customers")({
  validateSearch: zodValidator(searchSchema),
  component: () => (
    <PermissionGate perm="customers">
      <CustomersPage />
    </PermissionGate>
  ),
});

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

function CustomersPage() {
  const fmtMoney = useFormatDisplay();
  const qc = useQueryClient();
  const navigate = useNavigate({ from: "/admin/customers" });
  const search = Route.useSearch();

  const fetchList = useServerFn(listCustomers);
  const setBlocked = useServerFn(setCustomerBlocked);
  const del = useServerFn(deleteCustomer);
  const createAccount = useServerFn(createCustomerAccount);

  const [createOpen, setCreateOpen] = useState(false);

  const [queryInput, setQueryInput] = useState(search.q);
  const debouncedQ = useDebouncedValue(queryInput, 300);

  // Sync debounced text input back to the URL.
  useEffect(() => {
    if (debouncedQ !== search.q) {
      navigate({ search: (prev: SearchState) => ({ ...prev, q: debouncedQ, page: 1 }), replace: true });
    }
  }, [debouncedQ, navigate, search.q]);

  const queryParams = useMemo(
    () => ({
      page: search.page,
      pageSize: PAGE_SIZE,
      q: search.q,
      status: search.status,
      country_id: search.country === "all" ? null : search.country,
      has_orders: search.has_orders,
    }),
    [search.page, search.q, search.status, search.country, search.has_orders],
  );

  const { data, isFetching, isLoading } = useQuery({
    queryKey: ["admin", "customers", queryParams],
    queryFn: () => fetchList({ data: queryParams }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const { data: countries } = useCountries({ onlyEnabled: true });
  const labelOf = useCountryLabel();
  const countryName = useCallback(
    (id: string | null) => {
      if (!id) return "—";
      const c = countries?.find((x) => x.id === id);
      return c ? `${c.flag_emoji ?? ""} ${labelOf(c)}` : "—";
    },
    [countries, labelOf],
  );

  const rows = data?.rows ?? [];
  const totals = data?.totals ?? { active: 0, blocked: 0, revenue: 0 };
  const total = data?.total ?? 0;

  const [confirmDelete, setConfirmDelete] = useState<CustomerListRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggleBlock = useCallback(async (c: CustomerListRow) => {
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
  }, [qc, setBlocked]);

  const handleDelete = useCallback(async () => {
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
  }, [confirmDelete, del, qc]);

  const onPage = useCallback((next: number) => {
    navigate({ search: (prev: SearchState) => ({ ...prev, page: next }) });
  }, [navigate]);

  const onResetFilters = useCallback(() => {
    setQueryInput("");
    navigate({ search: { page: 1, q: "", status: "all", country: "all", has_orders: "all" } });
  }, [navigate]);

  const filtersActive =
    search.q || search.status !== "all" || search.country !== "all" || search.has_orders !== "all";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Clients</h1>
          <p className="text-xs text-muted-foreground">
            {total} client{total > 1 ? "s" : ""}{isFetching ? " · …" : ""}
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <UserPlus className="mr-1.5 h-4 w-4" /> Créer un client
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatTile label="Clients" value={total} icon={Users} color="text-primary" />
        <StatTile label="Actifs" value={totals.active} icon={UserCheck} color="text-emerald-600" />
        <StatTile label="Bloqués" value={totals.blocked} icon={UserX} color="text-destructive" />
        <StatTile label="Page" value={`${search.page} / ${Math.max(1, Math.ceil(total / PAGE_SIZE))}`} icon={Wallet} color="text-amber-600" />
      </div>

      <Card>
        <CardContent className="space-y-3 p-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Nom, email, téléphone…"
                className="pl-8"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
              />
            </div>
            <Select
              value={search.status}
              onValueChange={(v) => navigate({ search: (prev: SearchState) => ({ ...prev, status: v as "all" | "active" | "blocked", page: 1 }) })}
            >
              <SelectTrigger><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="active">Actif</SelectItem>
                <SelectItem value="blocked">Bloqué</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={search.country}
              onValueChange={(v) => navigate({ search: (prev: SearchState) => ({ ...prev, country: v, page: 1 }) })}
            >
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
            <Select
              value={search.has_orders}
              onValueChange={(v) => navigate({ search: (prev: SearchState) => ({ ...prev, has_orders: v as "all" | "with" | "without", page: 1 }) })}
            >
              <SelectTrigger><SelectValue placeholder="Commandes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Avec ou sans commande</SelectItem>
                <SelectItem value="with">Avec commandes</SelectItem>
                <SelectItem value="without">Sans commande</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {filtersActive ? (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onResetFilters}>
              <X className="mr-1 h-3 w-3" /> Réinitialiser les filtres
            </Button>
          ) : null}
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
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun client trouvé.</p>
            ) : (
              rows.map((c) => (
                <CustomerCardMobile
                  key={c.user_id}
                  row={c}
                  countryName={countryName(c.default_country_id)}
                  busy={busyId === c.user_id}
                  onToggleBlock={toggleBlock}
                  onDelete={setConfirmDelete}
                />
              ))
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
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
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground">Aucun client.</TableCell></TableRow>
                ) : rows.map((c) => (
                  <CustomerRowDesktop
                    key={c.user_id}
                    row={c}
                    countryName={countryName(c.default_country_id)}
                    busy={busyId === c.user_id}
                    onToggleBlock={toggleBlock}
                    onDelete={setConfirmDelete}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          <PaginationBar page={search.page} pageSize={PAGE_SIZE} total={total} onPageChange={onPage} className="border-t" />
        </CardContent>
      </Card>

      <CreateCustomerDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        countries={countries ?? []}
        onCreated={() => qc.invalidateQueries({ queryKey: ["admin", "customers"] })}
        createAccount={createAccount}
      />

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

const StatTile = memo(function StatTile({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: typeof Users; color: string }) {
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
});

type RowProps = {
  row: CustomerListRow;
  countryName: string;
  busy: boolean;
  onToggleBlock: (c: CustomerListRow) => void;
  onDelete: (c: CustomerListRow) => void;
};

const CustomerRowDesktop = memo(function CustomerRowDesktop({ row, countryName, busy, onToggleBlock, onDelete }: RowProps) {
  const fmtMoney = useFormatDisplay();
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{row.full_name || "—"}</div>
        <div className="text-xs text-muted-foreground font-mono">{row.user_id.slice(0, 8)}…</div>
      </TableCell>
      <TableCell>
        <div className="text-xs">{row.email ?? "—"}</div>
        <div className="text-xs text-muted-foreground">{row.phone ?? "—"}</div>
      </TableCell>
      <TableCell className="text-xs">{countryName}</TableCell>
      <TableCell><StatusBadge status={row.status} /></TableCell>
      <TableCell>
        <div className="inline-flex items-center gap-1 text-xs">
          <ShoppingBag className="h-3 w-3 text-muted-foreground" />
          {row.orders_count}
        </div>
      </TableCell>
      <TableCell className="text-xs font-medium">{fmtMoney(row.total_spent)}</TableCell>
      <TableCell className="text-xs">{fmtDate(row.created_at)}</TableCell>
      <TableCell className="text-xs">{fmtDate(row.last_sign_in_at)}</TableCell>
      <TableCell className="text-right">
        <div className="inline-flex gap-1">
          <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
            <Link to="/admin/customers/$userId" params={{ userId: row.user_id }}>
              <Eye className="mr-1 h-3 w-3" /> Détail
            </Link>
          </Button>
          <RowActions row={row} busy={busy} onToggleBlock={() => onToggleBlock(row)} onDelete={() => onDelete(row)} />
        </div>
      </TableCell>
    </TableRow>
  );
});

const CustomerCardMobile = memo(function CustomerCardMobile({ row, countryName, busy, onToggleBlock, onDelete }: RowProps) {
  const fmtMoney = useFormatDisplay();
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">
            {row.full_name || row.email || "Sans nom"}
          </div>
          <div className="truncate text-xs text-muted-foreground">{row.email ?? "—"}</div>
          <div className="truncate text-xs text-muted-foreground">{row.phone ?? "—"}</div>
        </div>
        <StatusBadge status={row.status} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
        <div><div className="text-muted-foreground">Pays</div><div className="font-medium">{countryName}</div></div>
        <div><div className="text-muted-foreground">Cmd</div><div className="font-medium">{row.orders_count}</div></div>
        <div><div className="text-muted-foreground">Dépensé</div><div className="font-medium">{fmtMoney(row.total_spent)}</div></div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="text-[10px] text-muted-foreground">
          Inscrit {fmtDate(row.created_at)} · {fmtDate(row.last_sign_in_at)}
        </div>
        <div className="flex gap-1">
          <Button asChild size="sm" variant="outline" className="h-8 px-2 text-xs">
            <Link to="/admin/customers/$userId" params={{ userId: row.user_id }}>
              <Eye className="mr-1 h-3 w-3" /> Voir
            </Link>
          </Button>
          <RowActions row={row} busy={busy} onToggleBlock={() => onToggleBlock(row)} onDelete={() => onDelete(row)} />
        </div>
      </div>
    </div>
  );
});

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
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={busy}>
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

function CreateCustomerDialog({
  open,
  onOpenChange,
  countries,
  onCreated,
  createAccount,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  countries: Array<{ id: string; name: string; flag_emoji?: string | null }>;
  onCreated: () => void;
  createAccount: (args: { data: Record<string, unknown> }) => Promise<unknown>;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [sex, setSex] = useState<"homme" | "femme" | "">("");
  const [countryId, setCountryId] = useState("");
  const [cityText, setCityText] = useState("");
  const [regionText, setRegionText] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFullName(""); setEmail(""); setPassword(""); setPhone("");
    setSex(""); setCountryId(""); setCityText(""); setRegionText(""); setAddress("");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Le mot de passe doit faire au moins 6 caractères.");
      return;
    }
    setBusy(true);
    try {
      await createAccount({
        data: {
          email: email.trim().toLowerCase(),
          password,
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          sex: sex || null,
          country_id: countryId || null,
          city_text: cityText.trim() || null,
          region_text: regionText.trim() || null,
          address: address.trim() || null,
        },
      });
      toast.success("Compte client créé. Le client peut se connecter immédiatement.");
      reset();
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Création échouée.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { onOpenChange(o); if (!o) reset(); } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Créer un compte client</DialogTitle>
          <DialogDescription>
            Pour les personnes qui n'arrivent pas à s'inscrire seules. Aucun code email n'est
            envoyé : le compte est actif immédiatement avec le mot de passe choisi.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cc-name">Nom complet *</Label>
            <Input id="cc-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cc-email">Email *</Label>
            <Input id="cc-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cc-password">Mot de passe *</Label>
            <Input id="cc-password" type="text" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="À communiquer au client" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cc-phone">Téléphone</Label>
            <Input id="cc-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+221…" />
          </div>
          <div className="space-y-1.5">
            <Label>Sexe</Label>
            <RadioGroup value={sex} onValueChange={(v) => setSex(v as "homme" | "femme")} className="grid grid-cols-2 gap-2">
              <Label htmlFor="cc-sex-h" className="flex cursor-pointer items-center gap-2 rounded-xl border border-border p-2.5 has-[:checked]:border-primary has-[:checked]:bg-accent">
                <RadioGroupItem id="cc-sex-h" value="homme" />
                <span className="text-sm">Homme</span>
              </Label>
              <Label htmlFor="cc-sex-f" className="flex cursor-pointer items-center gap-2 rounded-xl border border-border p-2.5 has-[:checked]:border-primary has-[:checked]:bg-accent">
                <RadioGroupItem id="cc-sex-f" value="femme" />
                <span className="text-sm">Femme</span>
              </Label>
            </RadioGroup>
          </div>
          <div className="space-y-1.5">
            <Label>Pays</Label>
            <Select value={countryId} onValueChange={setCountryId}>
              <SelectTrigger><SelectValue placeholder="Choisir le pays…" /></SelectTrigger>
              <SelectContent>
                {countries.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.flag_emoji ? `${c.flag_emoji} ` : ""}{c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Région</Label>
              <Input value={regionText} onChange={(e) => setRegionText(e.target.value)} placeholder="Dakar…" />
            </div>
            <div className="space-y-1.5">
              <Label>Ville</Label>
              <Input value={cityText} onChange={(e) => setCityText(e.target.value)} placeholder="Mbour…" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cc-address">Adresse</Label>
            <Input id="cc-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rue, quartier…" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Création…" : "Créer le compte"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
