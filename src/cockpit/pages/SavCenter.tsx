// ═══════════════════════════════════════════════════════════════
// CENTRE SAV — Page principale
//
// Trois indicateurs prioritaires demandés par le métier :
//   1. Qui doit agir  (owner_party)
//   2. Ancienneté     (opened_at → âge en jours)
//   3. Montant impacté (financial_impact_amount)
//
// Lecture seule sur la liste, avec actions rapides : changer le
// statut, changer la partie responsable, clôturer.
// ═══════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  listSavCases,
  updateSavCase,
  type SavCase,
  type SavOwnerParty,
  type SavStatus,
  type SavProblemType,
} from "@/lib/sav.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle, Clock, Wallet, Users, Building2, Factory, UserRound,
  ArrowUpRight, Filter,
} from "lucide-react";
import { toast } from "sonner";
import { useFormatDisplay } from "@/hooks/use-currencies";

const OWNER_LABEL: Record<SavOwnerParty, string> = {
  kawzone: "Kawzone",
  vendor: "Vendeur",
  supplier: "Fournisseur",
  client: "Client",
};
const OWNER_ICON: Record<SavOwnerParty, typeof Users> = {
  kawzone: Users,
  vendor: Building2,
  supplier: Factory,
  client: UserRound,
};
const OWNER_TONE: Record<SavOwnerParty, string> = {
  kawzone: "bg-blue-100 text-blue-800 border-blue-200",
  vendor:  "bg-purple-100 text-purple-800 border-purple-200",
  supplier:"bg-amber-100 text-amber-800 border-amber-200",
  client:  "bg-emerald-100 text-emerald-800 border-emerald-200",
};

const STATUS_LABEL: Record<SavStatus, string> = {
  open: "Ouvert", in_progress: "En cours", waiting: "En attente",
  resolved: "Résolu", closed: "Clôturé",
};
const STATUS_TONE: Record<SavStatus, string> = {
  open: "bg-red-100 text-red-800",
  in_progress: "bg-amber-100 text-amber-800",
  waiting: "bg-slate-100 text-slate-700",
  resolved: "bg-emerald-100 text-emerald-800",
  closed: "bg-slate-200 text-slate-600",
};

const PROBLEM_LABEL: Record<SavProblemType, string> = {
  stock_break: "Rupture stock",
  product_deleted: "Produit supprimé",
  shop_deleted: "Boutique supprimée",
  dispute: "Litige",
  payment_blocked: "Paiement bloqué",
  delivery_blocked: "Livraison bloquée",
  supplier_unavailable: "Fournisseur indisponible",
  other: "Autre",
};

function ageInDays(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function ageTone(days: number): string {
  if (days >= 7) return "text-red-700 font-semibold";
  if (days >= 3) return "text-amber-700 font-semibold";
  return "text-slate-700";
}

function formatMoney(amount: number, currency: string): string {
  if (!amount) return "—";
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount.toLocaleString("fr-FR")} ${currency}`;
  }
}

export default function SavCenter() {
  const fmtDisp = useFormatDisplay();
  const list = useServerFn(listSavCases);
  const update = useServerFn(updateSavCase);
  const qc = useQueryClient();

  const [ownerFilter, setOwnerFilter] = useState<SavOwnerParty | "all">("all");
  const [statusFilter, setStatusFilter] = useState<SavStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [includeClosed, setIncludeClosed] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["sav-cases", { includeClosed }],
    queryFn: () => list({ data: { include_closed: includeClosed } }),
    staleTime: 15_000,
  });

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof update>[0]["data"]) => update({ data: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sav-cases"] });
      toast.success("Dossier mis à jour");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((c) => {
      if (ownerFilter !== "all" && c.owner_party !== ownerFilter) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (s && !(c.title.toLowerCase().includes(s) || (c.description ?? "").toLowerCase().includes(s) || c.order_id.includes(s))) return false;
      return true;
    });
  }, [rows, ownerFilter, statusFilter, search]);

  // KPI bandeau
  const kpis = useMemo(() => {
    const open = rows.filter((r) => r.status !== "closed");
    const byOwner: Record<SavOwnerParty, number> = { kawzone: 0, vendor: 0, supplier: 0, client: 0 };
    let totalImpact = 0;
    let oldDays = 0;
    for (const r of open) {
      byOwner[r.owner_party] += 1;
      totalImpact += Number(r.financial_impact_amount ?? 0);
      oldDays = Math.max(oldDays, ageInDays(r.opened_at));
    }
    return { open: open.length, byOwner, totalImpact, oldDays };
  }, [rows]);

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
            Centre SAV
          </h1>
          <p className="text-sm text-muted-foreground">
            Pilotage des dossiers problématiques — qui agit, depuis quand, pour combien.
          </p>
        </div>
        <Link to="/admin/cockpit">
          <Button variant="outline" size="sm">← Retour Cockpit</Button>
        </Link>
      </div>

      {/* KPI bandeau */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Dossiers ouverts</div>
          <div className="text-2xl font-bold">{kpis.open}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3"/>Plus ancien</div>
          <div className={`text-2xl font-bold ${ageTone(kpis.oldDays)}`}>{kpis.oldDays} j</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><Wallet className="w-3 h-3"/>Impact financier</div>
          <div className="text-2xl font-bold">{fmtDisp(kpis.totalImpact)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Qui doit agir</div>
          <div className="flex gap-1 flex-wrap mt-1">
            {(Object.keys(kpis.byOwner) as SavOwnerParty[]).map((k) => (
              <Badge key={k} variant="outline" className={OWNER_TONE[k]}>
                {OWNER_LABEL[k]} {kpis.byOwner[k]}
              </Badge>
            ))}
          </div>
        </CardContent></Card>
      </div>

      {/* Filtres */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Filter className="w-4 h-4"/>Filtres</CardTitle></CardHeader>
        <CardContent className="flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-muted-foreground">Recherche</label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Titre, description, commande…" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Doit agir</label>
            <Select value={ownerFilter} onValueChange={(v) => setOwnerFilter(v as any)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {(Object.keys(OWNER_LABEL) as SavOwnerParty[]).map((k) => (
                  <SelectItem key={k} value={k}>{OWNER_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Statut</label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {(Object.keys(STATUS_LABEL) as SavStatus[]).map((k) => (
                  <SelectItem key={k} value={k}>{STATUS_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant={includeClosed ? "default" : "outline"} size="sm" onClick={() => setIncludeClosed((v) => !v)}>
            {includeClosed ? "Masquer clôturés" : "Inclure clôturés"}
          </Button>
        </CardContent>
      </Card>

      {/* Liste */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Chargement…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              Aucun dossier SAV — l'activité est saine 🎉
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dossier</TableHead>
                  <TableHead>Doit agir</TableHead>
                  <TableHead>Ancienneté</TableHead>
                  <TableHead className="text-right">Impact</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const OwnerIcon = OWNER_ICON[c.owner_party];
                  const days = ageInDays(c.opened_at);
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-medium">{c.title}</div>
                        <div className="text-xs text-muted-foreground">{PROBLEM_LABEL[c.problem_type]}</div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={c.owner_party}
                          onValueChange={(v) => mutation.mutate({ id: c.id, owner_party: v as SavOwnerParty })}
                        >
                          <SelectTrigger className={`w-[140px] h-8 ${OWNER_TONE[c.owner_party]}`}>
                            <div className="flex items-center gap-1"><OwnerIcon className="w-3 h-3"/><SelectValue /></div>
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(OWNER_LABEL) as SavOwnerParty[]).map((k) => (
                              <SelectItem key={k} value={k}>{OWNER_LABEL[k]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <span className={ageTone(days)}>{days} j</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(Number(c.financial_impact_amount ?? 0), c.financial_impact_currency)}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={c.status}
                          onValueChange={(v) => mutation.mutate({ id: c.id, status: v as SavStatus })}
                        >
                          <SelectTrigger className={`w-[130px] h-8 ${STATUS_TONE[c.status]}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(STATUS_LABEL) as SavStatus[]).map((k) => (
                              <SelectItem key={k} value={k}>{STATUS_LABEL[k]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Link
                          to="/admin/cockpit"
                          search={{ orderId: c.order_id }}
                        >
                          <Button size="sm" variant="ghost">
                            Ouvrir <ArrowUpRight className="w-3 h-3 ml-1"/>
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
