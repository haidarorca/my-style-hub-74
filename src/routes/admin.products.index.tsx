import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Search, X, Check, Pencil, Flag, ShieldAlert, PackageCheck, PackageX, Hourglass, Eye,
} from "lucide-react";
import {
  listAdminProducts, listReportedProducts, setProductStatus, setReportStatus,
  type AdminProductRow, type AdminReportRow,
} from "@/lib/admin-products.functions";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

const searchSchema = z.object({
  tab: fallback(z.enum(["moderation", "reported"]), "moderation").default("moderation"),
  page: fallback(z.number().int().min(1), 1).default(1),
  q: fallback(z.string(), "").default(""),
  // moderation
  status: fallback(z.enum(["all", "pending", "approved", "rejected"]), "pending").default("pending"),
  kind: fallback(z.enum(["all", "new", "edit"]), "all").default("all"),
  sort: fallback(z.enum(["created_at", "updated_at", "price", "name"]), "created_at").default("created_at"),
  dir: fallback(z.enum(["asc", "desc"]), "desc").default("desc"),
  // reported
  rstatus: fallback(z.enum(["all", "open", "reviewed", "dismissed"]), "open").default("open"),
  reason: fallback(z.string(), "all").default("all"),
});
type SearchState = z.infer<typeof searchSchema>;

const PAGE_SIZE = 25;

export const Route = createFileRoute("/admin/products/")({
  validateSearch: zodValidator(searchSchema),
  component: () => (
    <PermissionGate perm="product_validation">
      <ProductsAdminPage />
    </PermissionGate>
  ),
});

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try { return format(new Date(s), "dd/MM/yyyy"); } catch { return "—"; }
}
function fmtMoney(n: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) + " FCFA";
}

function ProductsAdminPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/products/" });

  const [queryInput, setQueryInput] = useState(search.q);
  const debouncedQ = useDebouncedValue(queryInput, 300);
  useEffect(() => {
    if (debouncedQ !== search.q) {
      navigate({ search: (prev: SearchState) => ({ ...prev, q: debouncedQ, page: 1 }), replace: true });
    }
  }, [debouncedQ, navigate, search.q]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Produits</h1>
        <p className="text-xs text-muted-foreground">Modération et signalements</p>
      </div>

      <Tabs
        value={search.tab}
        onValueChange={(v) =>
          navigate({ search: (prev: SearchState) => ({ ...prev, tab: v as "moderation" | "reported", page: 1 }) })
        }
      >
        <TabsList>
          <TabsTrigger value="moderation"><PackageCheck className="mr-1 h-3 w-3" /> Modération</TabsTrigger>
          <TabsTrigger value="reported"><Flag className="mr-1 h-3 w-3" /> Signalés</TabsTrigger>
        </TabsList>
      </Tabs>

      {search.tab === "moderation" ? (
        <ModerationPanel
          search={search}
          navigate={navigate}
          queryInput={queryInput}
          setQueryInput={setQueryInput}
        />
      ) : (
        <ReportedPanel
          search={search}
          navigate={navigate}
          queryInput={queryInput}
          setQueryInput={setQueryInput}
        />
      )}
    </div>
  );
}

/* ---------------------- Moderation ---------------------- */

type PanelProps = {
  search: SearchState;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  navigate: any;
  queryInput: string;
  setQueryInput: (s: string) => void;
};

function ModerationPanel({ search, navigate, queryInput, setQueryInput }: PanelProps) {
  const qc = useQueryClient();
  const fetchList = useServerFn(listAdminProducts);
  const mutateStatus = useServerFn(setProductStatus);

  const params = useMemo(
    () => ({
      page: search.page,
      pageSize: PAGE_SIZE,
      q: search.q,
      status: search.status,
      kind: search.kind,
      sort: search.sort,
      dir: search.dir,
    }),
    [search.page, search.q, search.status, search.kind, search.sort, search.dir],
  );

  const { data, isFetching, isLoading } = useQuery({
    queryKey: ["admin", "products", "moderation", params],
    queryFn: () => fetchList({ data: params }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totals = data?.totals ?? { pending: 0, approved: 0, rejected: 0, edits_pending: 0 };

  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

  const act = useCallback(
    async (id: string, status: "approved" | "rejected") => {
      setBusyId(id);
      try {
        await mutateStatus({
          data: {
            product_id: id,
            status,
            rejection_reason: status === "rejected" ? rejectReason[id] || null : null,
          },
        });
        toast.success(status === "approved" ? "Produit approuvé" : "Produit rejeté");
        qc.invalidateQueries({ queryKey: ["admin", "products"] });
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusyId(null);
      }
    },
    [mutateStatus, qc, rejectReason],
  );

  const onPage = useCallback(
    (next: number) => navigate({ search: (prev: SearchState) => ({ ...prev, page: next }) }),
    [navigate],
  );

  const onReset = useCallback(() => {
    setQueryInput("");
    navigate({
      search: (prev: SearchState) => ({
        ...prev, page: 1, q: "", status: "pending", kind: "all", sort: "created_at", dir: "desc",
      }),
    });
  }, [navigate, setQueryInput]);

  const filtersActive = search.q || search.status !== "pending" || search.kind !== "all";

  return (
    <>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatTile label="À valider" value={totals.pending} icon={Hourglass} color="text-amber-600" />
        <StatTile label="Approuvés" value={totals.approved} icon={PackageCheck} color="text-emerald-600" />
        <StatTile label="Rejetés" value={totals.rejected} icon={PackageX} color="text-destructive" />
        <StatTile label="Modifications" value={totals.edits_pending} icon={Pencil} color="text-primary" />
      </div>

      <Card>
        <CardContent className="space-y-3 p-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Nom, code, désignation…"
                className="pl-8"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
              />
            </div>
            <Select
              value={search.status}
              onValueChange={(v) =>
                navigate({ search: (prev: SearchState) => ({ ...prev, status: v as SearchState["status"], page: 1 }) })
              }
            >
              <SelectTrigger><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="pending">À valider</SelectItem>
                <SelectItem value="approved">Approuvés</SelectItem>
                <SelectItem value="rejected">Rejetés</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={search.kind}
              onValueChange={(v) =>
                navigate({ search: (prev: SearchState) => ({ ...prev, kind: v as SearchState["kind"], page: 1 }) })
              }
            >
              <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Nouveaux + modifications</SelectItem>
                <SelectItem value="new">Nouveaux</SelectItem>
                <SelectItem value="edit">Modifications</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={`${search.sort}:${search.dir}`}
              onValueChange={(v) => {
                const [sort, dir] = v.split(":") as [SearchState["sort"], SearchState["dir"]];
                navigate({ search: (prev: SearchState) => ({ ...prev, sort, dir, page: 1 }) });
              }}
            >
              <SelectTrigger><SelectValue placeholder="Tri" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at:desc">Plus récents</SelectItem>
                <SelectItem value="created_at:asc">Plus anciens</SelectItem>
                <SelectItem value="updated_at:desc">Modifiés récemment</SelectItem>
                <SelectItem value="price:desc">Prix décroissant</SelectItem>
                <SelectItem value="price:asc">Prix croissant</SelectItem>
                <SelectItem value="name:asc">Nom A → Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {filtersActive ? (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onReset}>
              <X className="mr-1 h-3 w-3" /> Réinitialiser les filtres
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {total} produit{total > 1 ? "s" : ""}{isFetching ? " · …" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile cards */}
          <div className="space-y-2 p-3 md:hidden">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Chargement…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun produit.</p>
            ) : (
              rows.map((p) => (
                <ProductCardMobile
                  key={p.id}
                  row={p}
                  busy={busyId === p.id}
                  reason={rejectReason[p.id] ?? ""}
                  onReason={(v) => setRejectReason((r) => ({ ...r, [p.id]: v }))}
                  onAct={act}
                />
              ))
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produit</TableHead>
                  <TableHead>Vendeur</TableHead>
                  <TableHead>Prix</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Soumis</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Chargement…</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Aucun produit.</TableCell></TableRow>
                ) : rows.map((p) => (
                  <ProductRowDesktop
                    key={p.id}
                    row={p}
                    busy={busyId === p.id}
                    reason={rejectReason[p.id] ?? ""}
                    onReason={(v) => setRejectReason((r) => ({ ...r, [p.id]: v }))}
                    onAct={act}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          <PaginationBar page={search.page} pageSize={PAGE_SIZE} total={total} onPageChange={onPage} className="border-t" />
        </CardContent>
      </Card>
    </>
  );
}

const ProductRowDesktop = memo(function ProductRowDesktop({
  row, busy, reason, onReason, onAct,
}: {
  row: AdminProductRow; busy: boolean; reason: string;
  onReason: (v: string) => void;
  onAct: (id: string, s: "approved" | "rejected") => void;
}) {
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-muted">
            {row.image_url ? (
              <img src={row.image_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
            ) : null}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{row.name}</div>
            <div className="text-xs text-muted-foreground">#{row.code}</div>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-xs">
        {row.vendor_shop_name || row.vendor_full_name || "—"}
      </TableCell>
      <TableCell className="text-xs font-medium">{fmtMoney(row.price)}</TableCell>
      <TableCell><ProductStatusBadge row={row} /></TableCell>
      <TableCell className="text-xs">{fmtDate(row.created_at)}</TableCell>
      <TableCell className="text-right">
        <div className="inline-flex items-center gap-1">
          {row.status === "pending" ? (
            <>
              <Input
                placeholder="Motif (optionnel)"
                value={reason}
                onChange={(e) => onReason(e.target.value)}
                className="h-7 w-40 text-xs"
              />
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onAct(row.id, "rejected")} disabled={busy}>
                <X className="mr-1 h-3 w-3" /> Rejeter
              </Button>
              <Button
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onAct(row.id, "approved")}
                disabled={busy || !!row.pending_category_request_id}
                title={row.pending_category_request_id ? "Validez d'abord la catégorie proposée" : undefined}
              >
                <Check className="mr-1 h-3 w-3" /> Approuver
              </Button>
            </>
          ) : (
            <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
              <Link to="/admin/products/$productId/edit" params={{ productId: row.id }}>
                <Pencil className="mr-1 h-3 w-3" /> Éditer
              </Link>
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
});

const ProductCardMobile = memo(function ProductCardMobile({
  row, busy, reason, onReason, onAct,
}: {
  row: AdminProductRow; busy: boolean; reason: string;
  onReason: (v: string) => void;
  onAct: (id: string, s: "approved" | "rejected") => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start gap-2">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded bg-muted">
          {row.image_url ? <img src={row.image_url} alt="" className="h-full w-full object-cover" loading="lazy" /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{row.name}</div>
          <div className="text-xs text-muted-foreground">#{row.code} · {fmtMoney(row.price)}</div>
          <div className="truncate text-xs text-muted-foreground">{row.vendor_shop_name || row.vendor_full_name || "—"}</div>
        </div>
        <ProductStatusBadge row={row} />
      </div>
      {row.status === "pending" ? (
        <div className="mt-2 flex flex-col gap-2">
          <Input
            placeholder="Motif de rejet (optionnel)"
            value={reason}
            onChange={(e) => onReason(e.target.value)}
            className="h-8 text-xs"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => onAct(row.id, "rejected")} disabled={busy}>
              <X className="mr-1 h-3 w-3" /> Rejeter
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={() => onAct(row.id, "approved")}
              disabled={busy || !!row.pending_category_request_id}
            >
              <Check className="mr-1 h-3 w-3" /> Approuver
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
});

function ProductStatusBadge({ row }: { row: AdminProductRow }) {
  if (row.status === "pending") {
    return (
      <Badge variant="outline" className="border-amber-500 text-amber-600">
        {row.is_edit ? "Modification" : "Nouveau"}
      </Badge>
    );
  }
  if (row.status === "approved") return <Badge className="bg-emerald-600">Approuvé</Badge>;
  return <Badge variant="destructive">Rejeté</Badge>;
}

/* ---------------------- Reported ---------------------- */

const REASON_OPTIONS = [
  { value: "all", label: "Toutes les raisons" },
  { value: "counterfeit", label: "Contrefaçon" },
  { value: "inappropriate", label: "Contenu inapproprié" },
  { value: "scam", label: "Arnaque" },
  { value: "wrong_info", label: "Informations erronées" },
  { value: "other", label: "Autre" },
];

function ReportedPanel({ search, navigate, queryInput, setQueryInput }: PanelProps) {
  const qc = useQueryClient();
  const fetchList = useServerFn(listReportedProducts);
  const mutateReport = useServerFn(setReportStatus);

  const params = useMemo(
    () => ({
      page: search.page,
      pageSize: PAGE_SIZE,
      q: search.q,
      status: search.rstatus,
      reason: search.reason,
    }),
    [search.page, search.q, search.rstatus, search.reason],
  );

  const { data, isFetching, isLoading } = useQuery({
    queryKey: ["admin", "products", "reported", params],
    queryFn: () => fetchList({ data: params }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totals = data?.totals ?? { open: 0, reviewed: 0, dismissed: 0 };

  const [busyId, setBusyId] = useState<string | null>(null);

  const act = useCallback(
    async (id: string, status: "reviewed" | "dismissed" | "open") => {
      setBusyId(id);
      try {
        await mutateReport({ data: { report_id: id, status } });
        toast.success("Signalement mis à jour");
        qc.invalidateQueries({ queryKey: ["admin", "products", "reported"] });
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusyId(null);
      }
    },
    [mutateReport, qc],
  );

  const onPage = useCallback(
    (next: number) => navigate({ search: (prev: SearchState) => ({ ...prev, page: next }) }),
    [navigate],
  );

  const onReset = useCallback(() => {
    setQueryInput("");
    navigate({ search: (prev: SearchState) => ({ ...prev, page: 1, q: "", rstatus: "open", reason: "all" }) });
  }, [navigate, setQueryInput]);

  const filtersActive = search.q || search.rstatus !== "open" || search.reason !== "all";

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Ouverts" value={totals.open} icon={ShieldAlert} color="text-destructive" />
        <StatTile label="Examinés" value={totals.reviewed} icon={Check} color="text-emerald-600" />
        <StatTile label="Rejetés" value={totals.dismissed} icon={X} color="text-muted-foreground" />
      </div>

      <Card>
        <CardContent className="space-y-3 p-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher dans le motif…"
                className="pl-8"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
              />
            </div>
            <Select
              value={search.rstatus}
              onValueChange={(v) =>
                navigate({ search: (prev: SearchState) => ({ ...prev, rstatus: v as SearchState["rstatus"], page: 1 }) })
              }
            >
              <SelectTrigger><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="open">Ouverts</SelectItem>
                <SelectItem value="reviewed">Examinés</SelectItem>
                <SelectItem value="dismissed">Rejetés</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={search.reason}
              onValueChange={(v) => navigate({ search: (prev: SearchState) => ({ ...prev, reason: v, page: 1 }) })}
            >
              <SelectTrigger><SelectValue placeholder="Raison" /></SelectTrigger>
              <SelectContent>
                {REASON_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {filtersActive ? (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onReset}>
              <X className="mr-1 h-3 w-3" /> Réinitialiser les filtres
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {total} signalement{total > 1 ? "s" : ""}{isFetching ? " · …" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="space-y-2 p-3 md:hidden">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Chargement…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun signalement.</p>
            ) : (
              rows.map((r) => (
                <ReportCardMobile key={r.report_id} row={r} busy={busyId === r.report_id} onAct={act} />
              ))
            )}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produit</TableHead>
                  <TableHead>Vendeur</TableHead>
                  <TableHead>Motif</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Chargement…</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Aucun signalement.</TableCell></TableRow>
                ) : rows.map((r) => (
                  <ReportRowDesktop key={r.report_id} row={r} busy={busyId === r.report_id} onAct={act} />
                ))}
              </TableBody>
            </Table>
          </div>

          <PaginationBar page={search.page} pageSize={PAGE_SIZE} total={total} onPageChange={onPage} className="border-t" />
        </CardContent>
      </Card>
    </>
  );
}

const ReportRowDesktop = memo(function ReportRowDesktop({
  row, busy, onAct,
}: {
  row: AdminReportRow; busy: boolean;
  onAct: (id: string, s: "reviewed" | "dismissed" | "open") => void;
}) {
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-muted">
            {row.product_image_url ? (
              <img src={row.product_image_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
            ) : null}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{row.product_name ?? "Produit supprimé"}</div>
            <div className="text-xs text-muted-foreground">
              {row.product_code ? `#${row.product_code}` : "—"} · {row.reports_total} signalement{row.reports_total > 1 ? "s" : ""}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-xs">{row.vendor_shop_name ?? "—"}</TableCell>
      <TableCell className="max-w-[260px] text-xs">
        {row.reason_category ? <Badge variant="outline" className="mr-1">{row.reason_category}</Badge> : null}
        <span className="line-clamp-2 align-middle">{row.reason}</span>
      </TableCell>
      <TableCell><ReportStatusBadge status={row.status} /></TableCell>
      <TableCell className="text-xs">{fmtDate(row.created_at)}</TableCell>
      <TableCell className="text-right">
        <div className="inline-flex items-center gap-1">
          {row.product_id ? (
            <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
              <Link to="/admin/products/$productId/edit" params={{ productId: row.product_id }}>
                <Pencil className="mr-1 h-3 w-3" /> Voir
              </Link>
            </Button>
          ) : null}
          {row.status !== "reviewed" ? (
            <Button size="sm" className="h-7 px-2 text-xs" disabled={busy} onClick={() => onAct(row.report_id, "reviewed")}>
              <Check className="mr-1 h-3 w-3" /> Traiter
            </Button>
          ) : null}
          {row.status !== "dismissed" ? (
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy} onClick={() => onAct(row.report_id, "dismissed")}>
              <X className="mr-1 h-3 w-3" /> Rejeter
            </Button>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
});

const ReportCardMobile = memo(function ReportCardMobile({
  row, busy, onAct,
}: {
  row: AdminReportRow; busy: boolean;
  onAct: (id: string, s: "reviewed" | "dismissed" | "open") => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start gap-2">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-muted">
          {row.product_image_url ? <img src={row.product_image_url} alt="" className="h-full w-full object-cover" loading="lazy" /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{row.product_name ?? "Produit supprimé"}</div>
          <div className="truncate text-xs text-muted-foreground">{row.vendor_shop_name ?? "—"}</div>
          <div className="mt-1 line-clamp-2 text-xs">
            {row.reason_category ? <Badge variant="outline" className="mr-1">{row.reason_category}</Badge> : null}
            {row.reason}
          </div>
        </div>
        <ReportStatusBadge status={row.status} />
      </div>
      <div className="mt-2 flex gap-2">
        {row.product_id ? (
          <Button asChild size="sm" variant="outline" className="flex-1">
            <Link to="/admin/products/$productId/edit" params={{ productId: row.product_id }}>Voir</Link>
          </Button>
        ) : null}
        {row.status !== "reviewed" ? (
          <Button size="sm" className="flex-1" disabled={busy} onClick={() => onAct(row.report_id, "reviewed")}>Traiter</Button>
        ) : null}
        {row.status !== "dismissed" ? (
          <Button size="sm" variant="outline" className="flex-1" disabled={busy} onClick={() => onAct(row.report_id, "dismissed")}>Rejeter</Button>
        ) : null}
      </div>
    </div>
  );
});

function ReportStatusBadge({ status }: { status: string }) {
  if (status === "open") return <Badge variant="destructive">Ouvert</Badge>;
  if (status === "reviewed") return <Badge className="bg-emerald-600">Examiné</Badge>;
  if (status === "dismissed") return <Badge variant="secondary">Rejeté</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

/* ---------------------- Shared ---------------------- */

const StatTile = memo(function StatTile({
  label, value, icon: Icon, color,
}: { label: string; value: number | string; icon: typeof Search; color: string }) {
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
