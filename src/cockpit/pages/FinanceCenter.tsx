// ═══════════════════════════════════════════════════════════════
// CENTRE FINANCIER — Page principale (lecture seule)
//
// 3 sections :
//   1. Balance bandeau : entrées / sorties / net / engagements
//   2. Journal financier (table virtualisable plus tard)
//   3. Dettes & Créances (à payer / à encaisser)
// ═══════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { useFormatDisplay } from "@/hooks/use-currencies";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  listJournal, getFinanceSummary, listOutstanding,
  type JournalRow, type SubOrderAccountingRow,
} from "@/lib/finance.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Wallet, TrendingUp, TrendingDown, Clock, ArrowUpRight, Filter,
} from "lucide-react";

const MOVEMENT_LABEL: Record<string, string> = {
  cash_in: "Encaissement",
  cash_out: "Décaissement",
  credit_note_issued: "Avoir émis",
  credit_note_used: "Avoir utilisé",
  penalty_kept: "Pénalité gardée",
  penalty_to_vendor: "Pénalité reversée",
  commission_due_to_vendor: "Commission due",
  loss_kawzone: "Perte Kawzone",
  loss_vendor: "Perte vendeur",
  loss_shared: "Perte partagée",
  gain_kawzone: "Gain Kawzone",
  gain_vendor: "Gain vendeur",
};

// `fmt` legacy gardé pour les lignes journal multi-devise (r.currency déjà précisé).
function fmt(amount: number, currency = "XOF"): string {
  if (!amount) return "—";
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount.toLocaleString("fr-FR")} ${currency}`;
  }
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" });
}

export default function FinanceCenter() {
  const journalFn = useServerFn(listJournal);
  const summaryFn = useServerFn(getFinanceSummary);
  const outstandingFn = useServerFn(listOutstanding);
  const fmtDisp = useFormatDisplay();

  const [search, setSearch] = useState("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const params = useMemo(() => ({
    from: from || null, to: to ? `${to}T23:59:59Z` : null,
  }), [from, to]);

  const { data: summary } = useQuery({
    queryKey: ["finance-summary", params],
    queryFn: () => summaryFn({ data: params }),
    staleTime: 30_000,
  });

  const { data: journal = [], isLoading: jLoading } = useQuery({
    queryKey: ["finance-journal", params],
    queryFn: () => journalFn({ data: params }),
    staleTime: 15_000,
  });

  const { data: outstanding = [] } = useQuery({
    queryKey: ["finance-outstanding"],
    queryFn: () => outstandingFn(),
    staleTime: 30_000,
  });

  const filteredJournal = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return journal;
    return journal.filter((r) =>
      (r.reference ?? "").toLowerCase().includes(s) ||
      (r.note ?? "").toLowerCase().includes(s) ||
      (r.order_id ?? "").includes(s) ||
      MOVEMENT_LABEL[r.movement_type]?.toLowerCase().includes(s)
    );
  }, [journal, search]);

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="w-6 h-6 text-blue-600" />
            Centre Financier
          </h1>
          <p className="text-sm text-muted-foreground">
            Vue comptable opérationnelle — lecture seule. Saisie via le Drawer commande.
          </p>
        </div>
        <Link to="/admin/cockpit"><Button variant="outline" size="sm">← Retour Cockpit</Button></Link>
      </div>

      {/* Balance */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3 text-emerald-600"/>Entrées</div>
          <div className="text-2xl font-bold text-emerald-700">{fmt(summary?.total_in ?? 0)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><TrendingDown className="w-3 h-3 text-red-600"/>Sorties</div>
          <div className="text-2xl font-bold text-red-700">{fmt(summary?.total_out ?? 0)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Net</div>
          <div className={`text-2xl font-bold ${(summary?.net ?? 0) >= 0 ? "text-emerald-700" : "text-red-700"}`}>
            {fmt(summary?.net ?? 0)}
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3"/>Engagements</div>
          <div className="text-sm mt-1 space-y-0.5">
            <div>À rembourser : <span className="font-semibold">{fmt(summary?.pending_refund_to_client ?? 0)}</span></div>
            <div>Avoirs à émettre : <span className="font-semibold">{fmt(summary?.pending_credit_to_client ?? 0)}</span></div>
            <div>Comm. vendeur : <span className="font-semibold">{fmt(summary?.pending_commission_to_vendor ?? 0)}</span></div>
          </div>
        </CardContent></Card>
      </div>

      {/* Filtres */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Filter className="w-4 h-4"/>Filtres journal</CardTitle></CardHeader>
        <CardContent className="flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-muted-foreground">Recherche</label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Référence, note, commande…" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Du</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Au</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[150px]" />
          </div>
          {(from || to) && (
            <Button variant="ghost" size="sm" onClick={() => { setFrom(""); setTo(""); }}>Réinitialiser</Button>
          )}
        </CardContent>
      </Card>

      {/* Journal */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Journal financier ({filteredJournal.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {jLoading ? (
            <div className="p-8 text-center text-muted-foreground">Chargement…</div>
          ) : filteredJournal.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Aucun mouvement sur la période.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Sens</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead>Imputation</TableHead>
                  <TableHead>Référence</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJournal.map((r: JournalRow) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{fmtDate(r.occurred_at)}</TableCell>
                    <TableCell>{MOVEMENT_LABEL[r.movement_type] ?? r.movement_type}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={r.direction === "credit" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}>
                        {r.direction === "credit" ? "Entrée" : "Sortie"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {fmt(Number(r.amount), r.currency)}
                    </TableCell>
                    <TableCell><Badge variant="outline">{r.cost_attribution}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">{r.reference ?? r.note ?? "—"}</TableCell>
                    <TableCell>
                      {r.order_id && (
                        <Link to="/admin/cockpit" search={{ orderId: r.order_id, focus: "money" }}>
                          <Button size="sm" variant="ghost"><ArrowUpRight className="w-3 h-3"/></Button>
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dettes & Créances */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Dettes & Créances ouvertes ({outstanding.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {outstanding.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Aucun engagement ouvert 🎉</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sous-commande</TableHead>
                  <TableHead className="text-right">À rembourser client</TableHead>
                  <TableHead className="text-right">Avoir à émettre</TableHead>
                  <TableHead className="text-right">Commission vendeur</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outstanding.map((r: SubOrderAccountingRow) => (
                  <TableRow key={`${r.order_id}-${r.vendor_id}`}>
                    <TableCell className="font-mono text-xs">
                      {r.order_id.slice(0, 8)}… / {r.vendor_id.slice(0, 8)}…
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(Number(r.outstanding_to_refund_client))}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(Number(r.outstanding_credit_to_issue))}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(Number(r.commission_to_remit_vendor))}</TableCell>
                    <TableCell>
                      <Link to="/admin/cockpit" search={{ orderId: r.order_id, focus: "money" }}>
                        <Button size="sm" variant="ghost"><ArrowUpRight className="w-3 h-3"/></Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
