import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { getOrderOverview } from "@/lib/order-overview.functions";
import { listAllOrderPayments } from "@/lib/cockpit-payments.functions";
import { getOrderNumber } from "@/cockpit/lib/orderNumbers";
import { fmtF, IMPORT_STEPS, getImportStepIndex } from "@/cockpit/lib/workflow";
import type { OrderOverviewRow } from "@/lib/order-overview.functions";
import {
  Search, Filter, ChevronDown, ChevronUp, Eye, Globe, Calendar,
  Package, Phone, User, DollarSign, TrendingUp, X, Smartphone,
  MapPin, Flag, Layers, CreditCard, CheckCircle2, Clock, AlertCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/admin/order-overview")({
  component: OrderOverviewPage,
});

/* ═══════════════════════════════════════════════════════════════
   PAGE PRINCIPALE
   ═══════════════════════════════════════════════════════════════ */

function OrderOverviewPage() {
  const { user } = useAuth();
  const getOverview = useServerFn(getOrderOverview);
  const getPayments = useServerFn(listAllOrderPayments);

  // ── Filtres ──
  // Valeurs "all"* utilisées car Radix UI SelectItem n'accepte pas value=""
  const [statusFilter, setStatusFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all_countries");
  const [typeFilter, setTypeFilter] = useState<"all_types" | "local" | "import" | "mixed">("all_types");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // ── Chargement données ──
  // Conversion "all"* → "" pour le serveur (qui attend "" pour "pas de filtre")
  const serverStatus = statusFilter === "all" ? "" : statusFilter;
  const serverCountry = countryFilter === "all_countries" ? "" : countryFilter;
  const serverType = typeFilter === "all_types" ? "" : typeFilter;

  const { data, isLoading } = useQuery({
    queryKey: ["order-overview", page, pageSize, serverStatus, serverCountry, serverType, q],
    queryFn: async () => getOverview({ data: { page, pageSize, statusFilter: serverStatus, countryFilter: serverCountry, typeFilter: serverType as any, q, dateFrom: null, dateTo: null } }),
    refetchInterval: 30000,
  });

  // ── Paiements (pour colonne montant payé) ──
  const { data: sbPayments } = useQuery({
    queryKey: ["overview-payments"],
    queryFn: async () => { try { return await getPayments({ data: undefined }); } catch { return []; } },
    refetchInterval: 20000,
  });

  const payments = (sbPayments ?? []) as any[];
  const paidByOrder = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of payments) {
      const oid = p.order_id ?? p.orderId;
      if (oid) map[oid] = (map[oid] ?? 0) + (p.amount ?? 0);
    }
    return map;
  }, [payments]);

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const countries = data?.countries ?? [];

  // ── Drawer détail ──
  const [selectedRow, setSelectedRow] = useState<OrderOverviewRow | null>(null);

  if (!user) return <div className="p-8 text-center text-muted-foreground">Connexion requise</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-20">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center gap-3">
          <Layers className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">Vue globale des commandes</h1>
          <Badge variant="secondary" className="ml-auto">
            {total} commande{total > 1 ? "s" : ""}
          </Badge>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 py-4 space-y-4">
        {/* Barre de filtres */}
        <FilterBar
          q={q} onQChange={setQ}
          status={statusFilter} onStatusChange={setStatusFilter}
          country={countryFilter} onCountryChange={setCountryFilter}
          type={typeFilter} onTypeChange={setTypeFilter}
          countries={countries}
        />

        {/* Tableau Desktop */}
        <div className="hidden md:block bg-white rounded-lg border shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Chargement...</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground">Aucune commande trouvée</div>
          ) : (
            <DesktopTable rows={rows} paidByOrder={paidByOrder} onViewDetail={setSelectedRow} />
          )}
        </div>

        {/* Cartes Mobile */}
        <div className="md:hidden space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">Aucune commande</div>
          ) : (
            rows.map(row => (
              <MobileCard key={row.order.order_id} row={row} paid={paidByOrder[row.order.order_id ?? ""] ?? 0} onView={() => setSelectedRow(row)} />
            ))
          )}
        </div>

        {/* Pagination */}
        {total > pageSize && (
          <div className="flex items-center justify-between bg-white rounded-lg border p-3">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
              Précédent
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} / {Math.ceil(total / pageSize)}
            </span>
            <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(p => p + 1)}>
              Suivant
            </Button>
          </div>
        )}
      </main>

      {/* Drawer détail */}
      <DetailDrawer row={selectedRow} paid={selectedRow ? (paidByOrder[selectedRow.order.order_id ?? ""] ?? 0) : 0} onClose={() => setSelectedRow(null)} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   BARRE DE FILTRES
   ═══════════════════════════════════════════════════════════════ */

function FilterBar({
  q, onQChange,
  status, onStatusChange,
  country, onCountryChange,
  type, onTypeChange,
  countries,
}: {
  q: string; onQChange: (v: string) => void;
  status: string; onStatusChange: (v: string) => void;
  country: string; onCountryChange: (v: string) => void;
  type: "all_types" | "local" | "import" | "mixed"; onTypeChange: (v: "all_types" | "local" | "import" | "mixed") => void;
  countries: { id: string; name: string; flag_emoji: string | null }[];
}) {
  // Valeurs "all"* car Radix UI interdit value=""
  const statusOptions = [
    { value: "all", label: "Toutes" },
    { value: "new", label: "À traiter" },
    { value: "confirmed", label: "Confirmées" },
    { value: "ordered_supplier", label: "Chez fournisseur" },
    { value: "received_warehouse", label: "Réception" },
    { value: "awaiting_weighing", label: "À peser" },
    { value: "fees_calculated", label: "Frais calculés" },
    { value: "payment_fees", label: "Attente paiement" },
    { value: "ready_delivery", label: "Prêtes livraison" },
    { value: "shipped", label: "Expédiées" },
    { value: "delivered", label: "Terminées" },
    { value: "cancelled", label: "Annulées" },
  ];

  return (
    <div className="bg-white rounded-lg border shadow-sm p-4 space-y-3">
      {/* Ligne 1 : recherche + filtres rapides */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher commande, client, téléphone..."
            value={q}
            onChange={(e) => onQChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={onStatusChange}>
          <SelectTrigger className="w-[180px]">
            <Filter className="h-4 w-4 mr-1" />
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => onTypeChange(v as any)}>
          <SelectTrigger className="w-[150px]">
            <Globe className="h-4 w-4 mr-1" />
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all_types">Tous types</SelectItem>
            <SelectItem value="local">Local</SelectItem>
            <SelectItem value="import">Import</SelectItem>
            <SelectItem value="mixed">Mixte</SelectItem>
          </SelectContent>
        </Select>
        {countries.length > 0 && (
          <Select value={country} onValueChange={onCountryChange}>
            <SelectTrigger className="w-[160px]">
              <Flag className="h-4 w-4 mr-1" />
              <SelectValue placeholder="Pays" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_countries">Tous pays</SelectItem>
              {countries.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.flag_emoji ? `${c.flag_emoji} ` : ""}{c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TABLEAU DESKTOP
   ═══════════════════════════════════════════════════════════════ */

function DesktopTable({
  rows, paidByOrder, onViewDetail,
}: {
  rows: OrderOverviewRow[];
  paidByOrder: Record<string, number>;
  onViewDetail: (row: OrderOverviewRow) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr className="text-left text-xs font-medium text-muted-foreground uppercase">
            <th className="px-4 py-3">Commande</th>
            <th className="px-4 py-3">Client</th>
            <th className="px-4 py-3">Pays</th>
            <th className="px-4 py-3 text-center">Sous-cmd</th>
            <th className="px-4 py-3">Progression</th>
            <th className="px-4 py-3 text-right">Total</th>
            <th className="px-4 py-3 text-right">Payé</th>
            <th className="px-4 py-3 text-right">Reste</th>
            <th className="px-4 py-3">Statut</th>
            <th className="px-4 py-3 text-center">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map(row => (
            <RowDesktop key={row.order.order_id} row={row} paid={paidByOrder[row.order.order_id ?? ""] ?? 0} onView={() => onViewDetail(row)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowDesktop({ row, paid, onView }: { row: OrderOverviewRow; paid: number; onView: () => void }) {
  const o = row.order;
  const total = (o.order_total ?? 0) + (o.total_shipping_fees ?? 0);
  const remaining = Math.max(0, total - paid);
  const kz = getOrderNumber(o.order_id ?? "");
  const date = new Date(o.order_created_at).toLocaleDateString("fr-FR");

  // Progression
  const progressText = row.kawzone_total > 0
    ? `${row.kawzone_done}/${row.kawzone_total}`
    : "—";
  const progressPct = row.kawzone_total > 0
    ? Math.round((row.kawzone_done / row.kawzone_total) * 100)
    : 0;

  // Statut
  const statusConfig = getStatusConfig(o.logistics_status);

  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3">
        <div className="font-semibold text-primary">{kz}</div>
        <div className="text-[11px] text-muted-foreground">{date}</div>
      </td>
      <td className="px-4 py-3">
        <div className="font-medium">{o.customer_name ?? "—"}</div>
        {o.customer_phone && <div className="text-[11px] text-muted-foreground">{o.customer_phone}</div>}
      </td>
      <td className="px-4 py-3">
        {o.destination_country_name ? (
          <div className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{o.destination_country_name}</span>
          </div>
        ) : "—"}
      </td>
      <td className="px-4 py-3 text-center">
        <Badge variant="outline" className="text-xs">
          {row.sub_orders.length}
        </Badge>
      </td>
      <td className="px-4 py-3">
        {row.kawzone_total > 0 ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span>{progressText}</span>
              <span className="text-muted-foreground">{progressPct}%</span>
            </div>
            <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right font-medium">{fmtF(total)}</td>
      <td className="px-4 py-3 text-right text-emerald-600">{fmtF(paid)}</td>
      <td className="px-4 py-3 text-right">
        {remaining > 0 ? (
          <span className="text-red-600 font-medium">{fmtF(remaining)}</span>
        ) : (
          <CheckCircle2 className="h-4 w-4 text-emerald-500 inline" />
        )}
      </td>
      <td className="px-4 py-3">
        <Badge variant={statusConfig.variant as any} className="text-[10px]">
          {statusConfig.label}
        </Badge>
      </td>
      <td className="px-4 py-3 text-center">
        <Button variant="ghost" size="sm" onClick={onView}>
          <Eye className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CARTES MOBILE
   ═══════════════════════════════════════════════════════════════ */

function MobileCard({ row, paid, onView }: { row: OrderOverviewRow; paid: number; onView: () => void }) {
  const o = row.order;
  const total = (o.order_total ?? 0) + (o.total_shipping_fees ?? 0);
  const remaining = Math.max(0, total - paid);
  const kz = getOrderNumber(o.order_id ?? "");
  const date = new Date(o.order_created_at).toLocaleDateString("fr-FR");
  const statusConfig = getStatusConfig(o.logistics_status);
  const progressPct = row.kawzone_total > 0 ? Math.round((row.kawzone_done / row.kawzone_total) * 100) : 0;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="font-bold text-primary">{kz}</div>
            <div className="text-xs text-muted-foreground">{date}</div>
          </div>
          <Badge variant={statusConfig.variant as any} className="text-[10px]">
            {statusConfig.label}
          </Badge>
        </div>

        {/* Client */}
        <div className="flex items-center gap-2 text-sm">
          <User className="h-4 w-4 text-muted-foreground" />
          <span>{o.customer_name ?? "—"}</span>
        </div>
        {o.customer_phone && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Phone className="h-3.5 w-3.5" />
            <span>{o.customer_phone}</span>
          </div>
        )}
        {o.destination_country_name && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Globe className="h-3.5 w-3.5" />
            <span>{o.destination_country_name}</span>
          </div>
        )}

        {/* Progression */}
        {row.kawzone_total > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Progression</span>
              <span>{row.kawzone_done}/{row.kawzone_total} ({progressPct}%)</span>
            </div>
            <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        )}

        {/* Finances */}
        <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t">
          <div>
            <div className="text-[10px] text-muted-foreground">Total</div>
            <div className="text-sm font-semibold">{fmtF(total)}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground">Payé</div>
            <div className="text-sm font-semibold text-emerald-600">{fmtF(paid)}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground">Reste</div>
            <div className="text-sm font-semibold text-red-600">{fmtF(remaining)}</div>
          </div>
        </div>

        {/* Bouton */}
        <Button variant="outline" size="sm" className="w-full" onClick={onView}>
          <Eye className="h-4 w-4 mr-1" /> Voir détails
        </Button>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DRAWER DÉTAIL
   ═══════════════════════════════════════════════════════════════ */

function DetailDrawer({ row, paid, onClose }: { row: OrderOverviewRow | null; paid: number; onClose: () => void }) {
  const open = !!row;
  if (!row) return null;

  const o = row.order;
  const total = (o.order_total ?? 0) + (o.total_shipping_fees ?? 0);
  const remaining = Math.max(0, total - paid);
  const kz = getOrderNumber(o.order_id ?? "");

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {kz}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* Client */}
          <Section title="Client" icon={User}>
            <div className="space-y-1 text-sm">
              <div className="font-medium">{o.customer_name ?? "Non renseigné"}</div>
              {o.customer_phone && <div className="text-muted-foreground">{o.customer_phone}</div>}
              {o.destination_country_name && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" />
                  {o.destination_country_name}
                </div>
              )}
              {o.customer_city && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {o.customer_city}
                </div>
              )}
            </div>
          </Section>

          {/* Finances */}
          <Section title="Finances" icon={DollarSign}>
            <div className="grid grid-cols-3 gap-3">
              <FinBox label="Total" value={total} tone="neutral" />
              <FinBox label="Payé" value={paid} tone="emerald" />
              <FinBox label="Reste" value={remaining} tone="red" />
            </div>
          </Section>

          {/* Sous-commandes */}
          <Section title="Sous-commandes" icon={Layers}>
            <div className="space-y-2">
              {row.sub_orders.length === 0 ? (
                <div className="text-xs text-muted-foreground italic">Aucune sous-commande détectée</div>
              ) : (
                row.sub_orders.map((sub, i) => (
                  <div key={i} className="flex items-center justify-between rounded-md bg-muted/50 p-2.5">
                    <div className="flex items-center gap-2">
                      {sub.is_done ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <Clock className="h-4 w-4 text-amber-500" />
                      )}
                      <div>
                        <div className="text-sm font-medium">{sub.vendor_name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {sub.article_count} article{sub.article_count > 1 ? "s" : ""}
                          {!sub.is_kawzone_managed && " · Autonome"}
                        </div>
                      </div>
                    </div>
                    <Badge variant={sub.is_done ? "default" : "outline"} className="text-[10px]">
                      {sub.is_done ? "Terminée" : "En cours"}
                    </Badge>
                  </div>
                ))
              )}
            </div>
            {row.kawzone_total > 0 && (
              <div className="text-xs text-muted-foreground mt-2">
                Progression Kawzone : {row.kawzone_done}/{row.kawzone_total} sous-commande{row.kawzone_total > 1 ? "s" : ""} terminée{row.kawzone_done > 1 ? "s" : ""}
              </div>
            )}
          </Section>

          {/* Statut global */}
          <Section title="Statut global" icon={AlertCircle}>
            <div className="flex items-center gap-2">
              <StatusBadge status={o.logistics_status} />
              {o.order_type && (
                <Badge variant="outline" className="text-[10px]">
                  {o.order_type === "local" ? "Local" : o.order_type === "import" ? "Import" : "Mixte"}
                </Badge>
              )}
            </div>
            {o.tracking_number && (
              <div className="text-xs text-muted-foreground mt-2">
                Tracking : {o.tracking_number}
              </div>
            )}
          </Section>

          {/* Dates */}
          <Section title="Chronologie" icon={Calendar}>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div>Créée : {new Date(o.order_created_at).toLocaleString("fr-FR")}</div>
              {o.warehouse_received_at && <div>Réception entrepôt : {new Date(o.warehouse_received_at).toLocaleString("fr-FR")}</div>}
              {o.shipped_at && <div>Expédiée : {new Date(o.shipped_at).toLocaleString("fr-FR")}</div>}
              {o.estimated_arrival_at && <div>Arrivée estimée : {new Date(o.estimated_arrival_at).toLocaleString("fr-FR")}</div>}
            </div>
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ═══════════════════════════════════════════════════════════════
   COMPOSANTS AUXILIAIRES
   ═══════════════════════════════════════════════════════════════ */

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-4 w-4" />
        {title}
      </h3>
      {children}
    </div>
  );
}

function FinBox({ label, value, tone }: { label: string; value: number; tone: "neutral" | "emerald" | "red" }) {
  const color = tone === "emerald" ? "text-emerald-600" : tone === "red" ? "text-red-600" : "";
  return (
    <div className="text-center rounded-md bg-muted/50 p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-bold ${color}`}>{fmtF(value)}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const cfg = getStatusConfig(status);
  return <Badge variant={cfg.variant as any}>{cfg.label}</Badge>;
}

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

function getStatusConfig(status: string | null) {
  switch (status) {
    case "new": return { label: "À traiter", variant: "secondary" };
    case "confirmed": return { label: "Confirmée", variant: "default" };
    case "ordered_supplier": return { label: "Fournisseur", variant: "outline" };
    case "received_warehouse": return { label: "Réception", variant: "outline" };
    case "awaiting_weighing": return { label: "À peser", variant: "destructive" };
    case "fees_calculated": return { label: "Frais calculés", variant: "outline" };
    case "payment_fees": return { label: "Attente paiement", variant: "destructive" };
    case "ready_delivery": return { label: "Prête", variant: "default" };
    case "shipped": return { label: "Expédiée", variant: "secondary" };
    case "delivered": return { label: "Terminée", variant: "secondary" };
    case "cancelled": return { label: "Annulée", variant: "outline" };
    default: return { label: status ?? "Inconnu", variant: "outline" };
  }
}
