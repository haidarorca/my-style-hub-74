import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Plus, Trash2, Store, Pencil, X, MoreHorizontal, CheckCircle2, PauseCircle,
  Ban, Clock, AlertTriangle, CalendarClock, Eye, ShoppingBag, Search,
  ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { createVendor, deleteVendor, updateVendor } from "@/lib/admin.functions";
import { setVendorStatus, setVendorAccessWindow } from "@/lib/admin-vendor-status.functions";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { CountrySelect } from "@/components/CountrySelect";
import { useCountries, useCountryLabel } from "@/hooks/use-countries";

export const Route = createFileRoute("/admin/vendors")({
  component: () => <PermissionGate perm="vendors"><VendorsPage /></PermissionGate>,
});

type AccountStatus = "active" | "pending" | "suspended" | "expired" | "blocked";

type VendorProfile = {
  email: string | null; full_name: string | null;
  shop_name: string | null; phone: string | null;
  source_country_id: string | null;
  vendor_mode: "commission" | "no_commission";
  ships_internationally: boolean;
  allowed_destination_country_ids: string[] | null;
  is_verified: boolean | null;
  vendor_status: AccountStatus;
  access_starts_at: string | null;
  access_ends_at: string | null;
  address: string | null;
  created_at: string;
};
type VendorRow = { user_id: string; profiles: VendorProfile | null };

type Counts = { products: number; orders: number };

const STATUS_META: Record<AccountStatus, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  active:    { label: "Actif",      cls: "bg-emerald-500/15 text-emerald-700",  icon: CheckCircle2 },
  pending:   { label: "En attente", cls: "bg-amber-500/15 text-amber-700",      icon: Clock },
  suspended: { label: "Suspendu",   cls: "bg-orange-500/15 text-orange-700",    icon: PauseCircle },
  expired:   { label: "Expiré",     cls: "bg-muted text-foreground",            icon: AlertTriangle },
  blocked:   { label: "Bloqué",     cls: "bg-destructive/15 text-destructive",  icon: Ban },
};

function StatusBadge({ status }: { status: AccountStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", meta.cls)}>
      <Icon className="h-3 w-3" /> {meta.label}
    </span>
  );
}

function VendorsPage() {
  const qc = useQueryClient();
  const create = useServerFn(createVendor);
  const update = useServerFn(updateVendor);
  const del = useServerFn(deleteVendor);
  const setStatus = useServerFn(setVendorStatus);

  const { data: vendors, isLoading } = useQuery({
    queryKey: ["admin", "vendors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, profiles:profiles!inner(email, full_name, shop_name, phone, source_country_id, vendor_mode, ships_internationally, allowed_destination_country_ids, is_verified, vendor_status, access_starts_at, access_ends_at, address, created_at)")
        .eq("role", "vendeur");
      if (error) throw error;
      return (data ?? []) as unknown as VendorRow[];
    },
  });

  const vendorIds = useMemo(() => (vendors ?? []).map((v) => v.user_id), [vendors]);

  const { data: counts } = useQuery({
    queryKey: ["admin", "vendors", "counts", vendorIds],
    enabled: vendorIds.length > 0,
    queryFn: async () => {
      const out: Record<string, Counts> = {};
      vendorIds.forEach((id) => (out[id] = { products: 0, orders: 0 }));

      const [{ data: prods }, { data: items }] = await Promise.all([
        supabase.from("products").select("vendor_id").in("vendor_id", vendorIds),
        supabase.from("order_items").select("vendor_id, order_id").in("vendor_id", vendorIds),
      ]);
      (prods ?? []).forEach((p: { vendor_id: string }) => {
        if (out[p.vendor_id]) out[p.vendor_id].products += 1;
      });
      const seen = new Set<string>();
      (items ?? []).forEach((it: { vendor_id: string; order_id: string }) => {
        const k = `${it.vendor_id}|${it.order_id}`;
        if (seen.has(k)) return;
        seen.add(k);
        if (out[it.vendor_id]) out[it.vendor_id].orders += 1;
      });
      return out;
    },
  });

  // Filters
  const [query, setQuery] = useState("");
  const [fStatus, setFStatus] = useState<AccountStatus | "all">("all");
  const [fMode, setFMode] = useState<"all" | "commission" | "no_commission">("all");
  const [fCountry, setFCountry] = useState<string | "all">("all");
  const [fSignupFrom, setFSignupFrom] = useState<Date | undefined>();
  const [fSignupTo, setFSignupTo] = useState<Date | undefined>();
  const [fEndFrom, setFEndFrom] = useState<Date | undefined>();
  const [fEndTo, setFEndTo] = useState<Date | undefined>();

  // Per-column filters (Excel-like)
  const [colF, setColF] = useState<Record<ColKey, ColF>>({
    shop: {}, vendor: {}, email: {}, location: {}, status: {}, type: {}, signup: {}, endAccess: {},
  });
  const [sortBy, setSortBy] = useState<{ col: ColKey; dir: "asc" | "desc" } | null>(null);
  const updateColF = (k: ColKey, v: ColF) => setColF((s) => ({ ...s, [k]: v }));

  const { data: countries } = useCountries({ onlyEnabled: true });
  const labelOf = useCountryLabel();
  const countryName = (id: string | null) => {
    if (!id) return "—";
    const c = countries?.find((x) => x.id === id);
    return c ? `${c.flag_emoji ?? ""} ${labelOf(c)}` : "—";
  };

  const filtered = useMemo(() => {
    if (!vendors) return [];
    const q = query.trim().toLowerCase();
    return vendors
      .filter((v) => {
        const p = v.profiles;
        if (!p) return false;
        if (q) {
          const hay = `${p.email ?? ""} ${p.shop_name ?? ""} ${p.full_name ?? ""} ${p.phone ?? ""} ${p.address ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (fStatus !== "all" && p.vendor_status !== fStatus) return false;
        if (fMode !== "all" && p.vendor_mode !== fMode) return false;
        if (fCountry !== "all" && p.source_country_id !== fCountry) return false;
        if (fSignupFrom && new Date(p.created_at) < fSignupFrom) return false;
        if (fSignupTo) {
          const end = new Date(fSignupTo); end.setHours(23, 59, 59, 999);
          if (new Date(p.created_at) > end) return false;
        }
        if (fEndFrom && (!p.access_ends_at || new Date(p.access_ends_at) < fEndFrom)) return false;
        if (fEndTo) {
          const end = new Date(fEndTo); end.setHours(23, 59, 59, 999);
          if (!p.access_ends_at || new Date(p.access_ends_at) > end) return false;
        }
        // Per-column text filters (Excel-like)
        const statusLabel = STATUS_META[(p.vendor_status ?? "pending") as AccountStatus]?.label ?? "";
        const typeLabel = p.vendor_mode === "commission" ? "Avec commission" : "Sans commission";
        const accessors: Record<ColKey, string> = {
          shop: p.shop_name ?? "",
          vendor: p.full_name ?? "",
          email: p.email ?? "",
          location: `${countryName(p.source_country_id)} ${p.address ?? ""}`,
          status: statusLabel,
          type: typeLabel,
          signup: p.created_at ?? "",
          endAccess: p.access_ends_at ?? "",
        };
        for (const k of Object.keys(colF) as ColKey[]) {
          const f = colF[k];
          const val = (accessors[k] ?? "").toString().toLowerCase().trim();
          if (f.search && !val.includes(f.search.toLowerCase().trim())) return false;
          if (f.startsWith && !val.startsWith(f.startsWith.toLowerCase().trim())) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy) {
          const pa = a.profiles, pb = b.profiles;
          const getVal = (p: typeof pa): string | number => {
            if (!p) return "";
            switch (sortBy.col) {
              case "shop": return (p.shop_name ?? "").toLowerCase();
              case "vendor": return (p.full_name ?? "").toLowerCase();
              case "email": return (p.email ?? "").toLowerCase();
              case "location": return `${countryName(p.source_country_id)} ${p.address ?? ""}`.toLowerCase();
              case "status": return (STATUS_META[(p.vendor_status ?? "pending") as AccountStatus]?.label ?? "").toLowerCase();
              case "type": return p.vendor_mode === "commission" ? "1" : "0";
              case "signup": return new Date(p.created_at ?? 0).getTime();
              case "endAccess": return p.access_ends_at ? new Date(p.access_ends_at).getTime() : 0;
            }
          };
          const va = getVal(pa), vb = getVal(pb);
          const cmp = va < vb ? -1 : va > vb ? 1 : 0;
          return sortBy.dir === "asc" ? cmp : -cmp;
        }
        return new Date(b.profiles?.created_at ?? 0).getTime() - new Date(a.profiles?.created_at ?? 0).getTime();
      });
  }, [vendors, query, fStatus, fMode, fCountry, fSignupFrom, fSignupTo, fEndFrom, fEndTo, colF, sortBy, countries]);

  // Create dialog
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", full_name: "", shop_name: "", phone: "" });
  const [cSourceId, setCSourceId] = useState<string | null>(null);
  const [cMode, setCMode] = useState<"commission" | "no_commission">("no_commission");
  const [cIntl, setCIntl] = useState(false);
  const [cAllowed, setCAllowed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // Edit + actions dialogs
  const [editing, setEditing] = useState<VendorRow | null>(null);
  const [accessFor, setAccessFor] = useState<VendorRow | null>(null);
  const [reasonAction, setReasonAction] = useState<{ vendor: VendorRow; status: "suspended" | "blocked" } | null>(null);

  async function handleCreate() {
    if (!cSourceId) { toast.error("Pays source obligatoire"); return; }
    if (cIntl && cAllowed.length === 0) { toast.error("Sélectionnez au moins un pays de livraison autorisé."); return; }
    setBusy(true);
    try {
      await create({ data: {
        ...form, phone: form.phone || null,
        source_country_id: cSourceId, vendor_mode: cMode,
        ships_internationally: cIntl, allowed_destination_country_ids: cAllowed,
      } });
      toast.success("Vendeur créé");
      setOpen(false);
      setForm({ email: "", password: "", full_name: "", shop_name: "", phone: "" });
      setCSourceId(null); setCMode("no_commission"); setCIntl(false); setCAllowed([]);
      qc.invalidateQueries({ queryKey: ["admin", "vendors"] });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer ce vendeur ?")) return;
    try {
      await del({ data: { user_id: id } });
      toast.success("Supprimé");
      qc.invalidateQueries({ queryKey: ["admin", "vendors"] });
    } catch (e) { toast.error((e as Error).message); }
  }

  async function changeStatus(v: VendorRow, status: AccountStatus, reason?: string) {
    try {
      await setStatus({ data: { user_id: v.user_id, status, reason: reason ?? null } });
      toast.success(`Statut → ${STATUS_META[status].label}`);
      qc.invalidateQueries({ queryKey: ["admin", "vendors"] });
    } catch (e) { toast.error((e as Error).message); }
  }

  const fmtDate = (s: string | null) =>
    s ? format(new Date(s), "dd/MM/yyyy") : "—";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Vendeurs</h1>
          <p className="text-xs text-muted-foreground">{filtered.length} sur {vendors?.length ?? 0}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-1 h-4 w-4" /> Nouveau vendeur</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Créer un compte vendeur</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-xs">Nom complet</Label>
                <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div><Label className="text-xs">Nom de la boutique</Label>
                <Input value={form.shop_name} onChange={(e) => setForm({ ...form, shop_name: e.target.value })} /></div>
              <div><Label className="text-xs">Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label className="text-xs">Téléphone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label className="text-xs">Mot de passe (min 6)</Label>
                <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              <VendorScopeFields
                sourceId={cSourceId} setSourceId={setCSourceId}
                mode={cMode} setMode={setCMode}
                intl={cIntl} setIntl={setCIntl}
                allowed={cAllowed} setAllowed={setCAllowed}
                radioName="mode-create"
              />
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={busy}>{busy ? "Création…" : "Créer"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters toolbar */}
      <Card>
        <CardContent className="space-y-3 p-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Email, boutique, vendeur, ville…" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Select value={fStatus} onValueChange={(v) => setFStatus(v as typeof fStatus)}>
              <SelectTrigger><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                {(Object.keys(STATUS_META) as AccountStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fMode} onValueChange={(v) => setFMode(v as typeof fMode)}>
              <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                <SelectItem value="commission">Avec commission</SelectItem>
                <SelectItem value="no_commission">Sans commission</SelectItem>
              </SelectContent>
            </Select>
            <Select value={fCountry} onValueChange={setFCountry}>
              <SelectTrigger><SelectValue placeholder="Pays" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les pays</SelectItem>
                {(countries ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.flag_emoji ?? "🏳️"} {labelOf(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <DateRangeMini label="Inscrit depuis" value={fSignupFrom} onChange={setFSignupFrom} />
            <DateRangeMini label="Inscrit jusqu'à" value={fSignupTo} onChange={setFSignupTo} />
            <DateRangeMini label="Fin d'accès depuis" value={fEndFrom} onChange={setFEndFrom} />
            <DateRangeMini label="Fin d'accès jusqu'à" value={fEndTo} onChange={setFEndTo} />
          </div>
          {(query || fStatus !== "all" || fMode !== "all" || fCountry !== "all" || fSignupFrom || fSignupTo || fEndFrom || fEndTo) && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
              setQuery(""); setFStatus("all"); setFMode("all"); setFCountry("all");
              setFSignupFrom(undefined); setFSignupTo(undefined); setFEndFrom(undefined); setFEndTo(undefined);
            }}>
              <X className="mr-1 h-3 w-3" /> Réinitialiser les filtres
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Liste des vendeurs</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Chargement…</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Aucun vendeur correspondant.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead><FilterableHead label="Boutique" colKey="shop" colF={colF} updateColF={updateColF} sortBy={sortBy} setSortBy={setSortBy} /></TableHead>
                    <TableHead><FilterableHead label="Vendeur" colKey="vendor" colF={colF} updateColF={updateColF} sortBy={sortBy} setSortBy={setSortBy} /></TableHead>
                    <TableHead><FilterableHead label="Email" colKey="email" colF={colF} updateColF={updateColF} sortBy={sortBy} setSortBy={setSortBy} /></TableHead>
                    <TableHead>Téléphone</TableHead>
                    <TableHead><FilterableHead label="Pays / Ville" colKey="location" colF={colF} updateColF={updateColF} sortBy={sortBy} setSortBy={setSortBy} /></TableHead>
                    <TableHead><FilterableHead label="Statut" colKey="status" colF={colF} updateColF={updateColF} sortBy={sortBy} setSortBy={setSortBy} /></TableHead>
                    <TableHead><FilterableHead label="Type" colKey="type" colF={colF} updateColF={updateColF} sortBy={sortBy} setSortBy={setSortBy} /></TableHead>
                    <TableHead><FilterableHead label="Inscrit le" colKey="signup" colF={colF} updateColF={updateColF} sortBy={sortBy} setSortBy={setSortBy} kind="date" /></TableHead>
                    <TableHead><FilterableHead label="Fin d'accès" colKey="endAccess" colF={colF} updateColF={updateColF} sortBy={sortBy} setSortBy={setSortBy} kind="date" /></TableHead>
                    <TableHead className="text-right">Produits</TableHead>
                    <TableHead className="text-right">Commandes</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((v) => {
                    const p = v.profiles!;
                    const c = counts?.[v.user_id];
                    const expiringSoon = p.access_ends_at && new Date(p.access_ends_at).getTime() - Date.now() < 7 * 86400 * 1000;
                    return (
                      <TableRow key={v.user_id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent">
                              <Store className="h-4 w-4 text-primary" />
                            </div>
                            <span className="font-medium">{p.shop_name || "—"}</span>
                          </div>
                        </TableCell>
                        <TableCell>{p.full_name || "—"}</TableCell>
                        <TableCell className="text-xs">{p.email || "—"}</TableCell>
                        <TableCell className="text-xs">{p.phone || "—"}</TableCell>
                        <TableCell className="text-xs">
                          <div>{countryName(p.source_country_id)}</div>
                          {p.address && <div className="text-muted-foreground">{p.address}</div>}
                        </TableCell>
                        <TableCell><StatusBadge status={p.vendor_status} /></TableCell>
                        <TableCell className="text-xs">
                          {p.vendor_mode === "commission" ? "Commission" : "Sans"}
                        </TableCell>
                        <TableCell className="text-xs">{fmtDate(p.created_at)}</TableCell>
                        <TableCell className="text-xs">
                          {p.access_ends_at ? (
                            <span className={cn(expiringSoon && "font-semibold text-amber-700")}>
                              {fmtDate(p.access_ends_at)}
                            </span>
                          ) : <span className="text-muted-foreground">Illimité</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{c?.products ?? 0}</TableCell>
                        <TableCell className="text-right tabular-nums">{c?.orders ?? 0}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              {p.vendor_status !== "active" && (
                                <DropdownMenuItem onClick={() => changeStatus(v, "active")}>
                                  <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" /> Activer / Réactiver
                                </DropdownMenuItem>
                              )}
                              {p.vendor_status !== "suspended" && (
                                <DropdownMenuItem onClick={() => setReasonAction({ vendor: v, status: "suspended" })}>
                                  <PauseCircle className="mr-2 h-4 w-4 text-orange-600" /> Suspendre
                                </DropdownMenuItem>
                              )}
                              {p.vendor_status !== "blocked" && (
                                <DropdownMenuItem onClick={() => setReasonAction({ vendor: v, status: "blocked" })}>
                                  <Ban className="mr-2 h-4 w-4 text-destructive" /> Bloquer
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => setAccessFor(v)}>
                                <CalendarClock className="mr-2 h-4 w-4" /> Prolonger l'accès
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setEditing(v)}>
                                <Pencil className="mr-2 h-4 w-4" /> Modifier
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link to="/admin/products"><Eye className="mr-2 h-4 w-4" /> Voir les produits</Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link to="/admin/orders"><ShoppingBag className="mr-2 h-4 w-4" /> Voir les commandes</Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleDelete(v.user_id)} className="text-destructive focus:text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" /> Supprimer
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <EditVendorDialog
        vendor={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ["admin", "vendors"] });
        }}
        save={update}
      />

      <ReasonDialog
        state={reasonAction}
        onClose={() => setReasonAction(null)}
        onConfirm={async (reason) => {
          if (!reasonAction) return;
          await changeStatus(reasonAction.vendor, reasonAction.status, reason);
          setReasonAction(null);
        }}
      />

      <AccessWindowDialog
        vendor={accessFor}
        onClose={() => setAccessFor(null)}
        onSaved={() => {
          setAccessFor(null);
          qc.invalidateQueries({ queryKey: ["admin", "vendors"] });
        }}
      />
    </div>
  );
}

function DateRangeMini({ label, value, onChange }: { label: string; value?: Date; onChange: (d?: Date) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="justify-start text-xs font-normal">
          <CalendarClock className="mr-1 h-3 w-3" />
          {value ? format(value, "dd/MM/yyyy") : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={onChange} className="pointer-events-auto p-3" />
        {value && (
          <div className="border-t p-2">
            <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange(undefined)}>Effacer</Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

type ColFKind = "text" | "date";
type ColKey = "shop" | "vendor" | "email" | "location" | "status" | "type" | "signup" | "endAccess";
type ColF = { search?: string; startsWith?: string };
function FilterableHead({
  label, colKey, colF, updateColF, sortBy, setSortBy, kind = "text",
}: {
  label: string;
  colKey: ColKey;
  colF: Record<ColKey, { search?: string; startsWith?: string }>;
  updateColF: (k: ColKey, v: { search?: string; startsWith?: string }) => void;
  sortBy: { col: ColKey; dir: "asc" | "desc" } | null;
  setSortBy: (s: { col: ColKey; dir: "asc" | "desc" } | null) => void;
  kind?: ColFKind;
}) {
  const f = colF[colKey] ?? {};
  const isActive = !!(f.search || f.startsWith) || sortBy?.col === colKey;
  const SortIcon = sortBy?.col === colKey
    ? (sortBy.dir === "asc" ? ArrowUp : ArrowDown)
    : ArrowUpDown;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {label}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-5 w-5 p-0", isActive && "text-primary")}
            aria-label={`Filtrer ${label}`}
          >
            <SortIcon className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2 space-y-1" align="start">
          <Button variant="ghost" size="sm" className="w-full justify-start h-8"
            onClick={() => setSortBy({ col: colKey, dir: "asc" })}>
            <ArrowUp className="mr-2 h-3 w-3" />
            {kind === "date" ? "Plus ancien → récent" : "Trier A → Z"}
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start h-8"
            onClick={() => setSortBy({ col: colKey, dir: "desc" })}>
            <ArrowDown className="mr-2 h-3 w-3" />
            {kind === "date" ? "Plus récent → ancien" : "Trier Z → A"}
          </Button>
          {kind === "text" && (
            <>
              <div className="pt-1">
                <Label className="text-[10px] text-muted-foreground">Rechercher</Label>
                <Input
                  placeholder="Mot précis…"
                  value={f.search ?? ""}
                  onChange={(e) => updateColF(colKey, { ...f, search: e.target.value })}
                  className="h-8 mt-1"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Commence par</Label>
                <Input
                  placeholder="ex: M"
                  maxLength={3}
                  value={f.startsWith ?? ""}
                  onChange={(e) => updateColF(colKey, { ...f, startsWith: e.target.value })}
                  className="h-8 mt-1"
                />
              </div>
            </>
          )}
          <Button variant="ghost" size="sm" className="w-full h-8"
            onClick={() => { updateColF(colKey, {}); if (sortBy?.col === colKey) setSortBy(null); }}>
            <X className="mr-2 h-3 w-3" /> Réinitialiser
          </Button>
        </PopoverContent>
      </Popover>
    </span>
  );
}

function ReasonDialog({
  state, onClose, onConfirm,
}: {
  state: { vendor: VendorRow; status: "suspended" | "blocked" } | null;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (state) setReason(""); }, [state]);
  const isOpen = !!state;
  const action = state?.status === "suspended" ? "Suspendre" : "Bloquer";
  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{action} le vendeur</DialogTitle>
          <DialogDescription>
            {state?.vendor.profiles?.shop_name || state?.vendor.profiles?.email}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs">Raison (optionnel)</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motif visible en interne…" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button
            variant={state?.status === "blocked" ? "destructive" : "default"}
            disabled={busy}
            onClick={async () => { setBusy(true); try { await onConfirm(reason); } finally { setBusy(false); } }}
          >
            {busy ? "…" : action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccessWindowDialog({
  vendor, onClose, onSaved,
}: { vendor: VendorRow | null; onClose: () => void; onSaved: () => void }) {
  const setWindow = useServerFn(setVendorAccessWindow);
  const isOpen = !!vendor;
  const [mode, setMode] = useState<"preset" | "custom" | "date">("preset");
  const [preset, setPreset] = useState<string>("30");
  const [customDays, setCustomDays] = useState<number>(15);
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!vendor) return;
    const p = vendor.profiles;
    setMode("preset"); setPreset("30"); setCustomDays(15);
    setEndDate(p?.access_ends_at ? new Date(p.access_ends_at) : undefined);
    setStartDate(p?.access_starts_at ? new Date(p.access_starts_at) : new Date());
  }, [vendor]);

  function resolveEndsAt(): string | null {
    if (mode === "date") return endDate ? endDate.toISOString() : null;
    const base = startDate ?? new Date();
    if (mode === "preset") {
      if (preset === "unlimited") return null;
      const d = new Date(base); d.setDate(d.getDate() + parseInt(preset, 10));
      return d.toISOString();
    }
    const d = new Date(base); d.setDate(d.getDate() + Math.max(1, customDays));
    return d.toISOString();
  }

  async function handleSave() {
    if (!vendor) return;
    setBusy(true);
    try {
      const ends = resolveEndsAt();
      await setWindow({ data: {
        user_id: vendor.user_id,
        access_starts_at: startDate ? startDate.toISOString() : null,
        access_ends_at: ends,
      }});
      toast.success(ends ? `Accès jusqu'au ${format(new Date(ends), "dd/MM/yyyy")}` : "Accès illimité");
      onSaved();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  const previewEnd = resolveEndsAt();

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Durée d'accès vendeur</DialogTitle>
          <DialogDescription>{vendor?.profiles?.shop_name || vendor?.profiles?.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Date de début</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarClock className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "dd/MM/yyyy") : "Aujourd'hui"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={startDate} onSelect={setStartDate} className="pointer-events-auto p-3" />
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 text-xs">
            {(["preset", "custom", "date"] as const).map((m) => (
              <button key={m} type="button"
                onClick={() => setMode(m)}
                className={cn("rounded-md px-2 py-1.5 font-medium transition-colors",
                  mode === m ? "bg-background shadow" : "text-muted-foreground hover:text-foreground")}>
                {m === "preset" ? "Prédéfini" : m === "custom" ? "Personnalisé" : "Date précise"}
              </button>
            ))}
          </div>

          {mode === "preset" && (
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 jours</SelectItem>
                <SelectItem value="14">14 jours</SelectItem>
                <SelectItem value="30">1 mois (30 jours)</SelectItem>
                <SelectItem value="90">3 mois (90 jours)</SelectItem>
                <SelectItem value="180">6 mois (180 jours)</SelectItem>
                <SelectItem value="365">1 an (365 jours)</SelectItem>
                <SelectItem value="unlimited">Illimité</SelectItem>
              </SelectContent>
            </Select>
          )}

          {mode === "custom" && (
            <div className="flex items-center gap-2">
              <Input type="number" min={1} max={3650} value={customDays}
                onChange={(e) => setCustomDays(parseInt(e.target.value || "0", 10))} />
              <span className="text-sm text-muted-foreground">jours</span>
            </div>
          )}

          {mode === "date" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarClock className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, "dd/MM/yyyy") : "Choisir une date de fin"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={endDate} onSelect={setEndDate} className="pointer-events-auto p-3" />
              </PopoverContent>
            </Popover>
          )}

          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <span className="text-muted-foreground">Fin d'accès : </span>
            <span className="font-semibold">
              {previewEnd ? format(new Date(previewEnd), "dd/MM/yyyy") : "Illimité"}
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={handleSave} disabled={busy}>{busy ? "…" : "Appliquer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditVendorDialog({
  vendor, onClose, onSaved, save,
}: {
  vendor: VendorRow | null;
  onClose: () => void;
  onSaved: () => void;
  save: (args: { data: {
    user_id: string;
    shop_name: string | null;
    full_name: string | null;
    phone: string | null;
    source_country_id: string;
    vendor_mode: "commission" | "no_commission";
    ships_internationally: boolean;
    allowed_destination_country_ids: string[];
  } }) => Promise<unknown>;
}) {
  const isOpen = !!vendor;
  const [shopName, setShopName] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [mode, setMode] = useState<"commission" | "no_commission">("no_commission");
  const [intl, setIntl] = useState(false);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!vendor) return;
    const p = vendor.profiles;
    setShopName(p?.shop_name ?? "");
    setFullName(p?.full_name ?? "");
    setPhone(p?.phone ?? "");
    setSourceId(p?.source_country_id ?? null);
    setMode(p?.vendor_mode ?? "no_commission");
    setIntl(p?.ships_internationally ?? false);
    setAllowed(p?.allowed_destination_country_ids ?? []);
  }, [vendor]);

  async function handleSave() {
    if (!vendor) return;
    if (!sourceId) { toast.error("Pays source obligatoire"); return; }
    if (intl && allowed.length === 0) { toast.error("Sélectionnez au moins un pays de livraison autorisé."); return; }
    setSaving(true);
    try {
      await save({ data: {
        user_id: vendor.user_id,
        shop_name: shopName || null, full_name: fullName || null, phone: phone || null,
        source_country_id: sourceId, vendor_mode: mode,
        ships_internationally: intl, allowed_destination_country_ids: allowed,
      }});
      toast.success("Vendeur mis à jour");
      onSaved();
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Modifier le vendeur</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label className="text-xs">Nom de la boutique</Label>
            <Input value={shopName} onChange={(e) => setShopName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Nom complet</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Téléphone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <VendorScopeFields
            sourceId={sourceId} setSourceId={setSourceId}
            mode={mode} setMode={setMode}
            intl={intl} setIntl={setIntl}
            allowed={allowed} setAllowed={setAllowed}
            radioName="mode-edit"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VendorScopeFields({
  sourceId, setSourceId, mode, setMode, intl, setIntl, allowed, setAllowed, radioName,
}: {
  sourceId: string | null;
  setSourceId: (id: string | null) => void;
  mode: "commission" | "no_commission";
  setMode: (m: "commission" | "no_commission") => void;
  intl: boolean;
  setIntl: (v: boolean) => void;
  allowed: string[];
  setAllowed: (updater: (cur: string[]) => string[]) => void;
  radioName: string;
}) {
  const { data: countries } = useCountries({ onlyEnabled: true });
  const labelOf = useCountryLabel();
  const sourceCountry = countries?.find((c) => c.id === sourceId);
  const toggle = (id: string) =>
    setAllowed((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs">Pays source des produits *</Label>
        <CountrySelect value={sourceId} onChange={setSourceId} onlyEnabled placeholder="Choisir le pays source" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Mode commission *</Label>
        <div className="grid grid-cols-2 gap-2">
          <Label className="flex cursor-pointer items-center gap-2 rounded-lg border p-2 has-[:checked]:border-primary has-[:checked]:bg-accent">
            <input type="radio" name={radioName} checked={mode === "no_commission"} onChange={() => setMode("no_commission")} />
            <span className="text-xs font-medium">Sans commission</span>
          </Label>
          <Label className="flex cursor-pointer items-center gap-2 rounded-lg border p-2 has-[:checked]:border-primary has-[:checked]:bg-accent">
            <input type="radio" name={radioName} checked={mode === "commission"} onChange={() => setMode("commission")} />
            <span className="text-xs font-medium">Avec commission</span>
          </Label>
        </div>
      </div>
      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-semibold">Vente internationale</Label>
            <p className="text-[11px] text-muted-foreground">
              Désactivé = livraison uniquement dans {sourceCountry ? labelOf(sourceCountry) : "le pays source"}.
            </p>
          </div>
          <Switch checked={intl} onCheckedChange={setIntl} />
        </div>
        {intl && (
          <div className="space-y-1.5 pt-2 border-t">
            <Label className="text-xs">Pays de livraison autorisés *</Label>
            <div className="max-h-48 overflow-auto rounded-md border divide-y">
              {(countries ?? []).map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent">
                  <input type="checkbox" checked={allowed.includes(c.id)} onChange={() => toggle(c.id)} />
                  <span className="text-base">{c.flag_emoji ?? "🏳️"}</span>
                  <span className="flex-1 truncate">{labelOf(c)}</span>
                </label>
              ))}
            </div>
            {allowed.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {allowed.map((id) => {
                  const c = countries?.find((x) => x.id === id);
                  if (!c) return null;
                  return (
                    <span key={id} className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px]">
                      {c.flag_emoji} {c.name}
                      <button type="button" onClick={() => toggle(id)} aria-label="Retirer">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
