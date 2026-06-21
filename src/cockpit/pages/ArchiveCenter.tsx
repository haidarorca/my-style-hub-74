// ═══════════════════════════════════════════════════════════════
// ARCHIVE — Consultation des sous-commandes clôturées
// ═══════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { listArchive, type ArchiveRow } from "@/lib/archive.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Archive as ArchiveIcon, ArrowUpRight, Filter } from "lucide-react";
import { useFormatDisplay } from "@/hooks/use-currencies";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" });
}

export default function ArchiveCenter() {
  const listFn = useServerFn(listArchive);
  const fmt = useFormatDisplay();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "delivered" | "cancelled">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const params = useMemo(() => ({
    status,
    search: search.trim() || null,
    from: from || null,
    to: to ? `${to}T23:59:59Z` : null,
  }), [status, search, from, to]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["archive", params],
    queryFn: () => listFn({ data: params }),
    staleTime: 30_000,
  });

  const kpis = useMemo(() => {
    const delivered = rows.filter((r) => r.status === "delivered").length;
    const cancelled = rows.filter((r) => r.status === "cancelled").length;
    const grossTotal = rows.reduce((s, r) => s + r.gross_value, 0);
    const lossTotal = rows.reduce((s, r) => s + r.loss_value, 0);
    return { delivered, cancelled, grossTotal, lossTotal };
  }, [rows]);

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArchiveIcon className="w-6 h-6 text-slate-600" />
            Archive
          </h1>
          <p className="text-sm text-muted-foreground">
            Sous-commandes clôturées sans dossier SAV ni engagement financier en cours.
          </p>
        </div>
        <Link to="/admin/cockpit"><Button variant="outline" size="sm">← Retour Cockpit</Button></Link>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Sous-commandes</div>
          <div className="text-2xl font-bold">{rows.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Livrées</div>
          <div className="text-2xl font-bold text-emerald-700">{kpis.delivered}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Annulées</div>
          <div className="text-2xl font-bold text-red-700">{kpis.cancelled}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Chiffre brut / Pertes</div>
          <div className="text-sm font-semibold mt-1">{fmt(kpis.grossTotal)} <span className="text-red-700">/ {fmt(kpis.lossTotal)}</span></div>
        </CardContent></Card>
      </div>

      {/* Filtres */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Filter className="w-4 h-4"/>Filtres</CardTitle></CardHeader>
        <CardContent className="flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-muted-foreground">Recherche client</label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom, téléphone…" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Statut</label>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="delivered">Livrées</SelectItem>
                <SelectItem value="cancelled">Annulées</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Du</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Au</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[150px]" />
          </div>
        </CardContent>
      </Card>

      {/* Liste */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Chargement…</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Aucune sous-commande archivée sur cette période.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date clôture</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Boutique</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Brut</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Pertes</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r: ArchiveRow) => (
                  <TableRow key={`${r.order_id}-${r.vendor_id}`}>
                    <TableCell className="whitespace-nowrap">{fmtDate(r.closed_at)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{r.customer_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.customer_phone ?? ""}</div>
                    </TableCell>
                    <TableCell className="text-sm">{r.shop_name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={r.status === "delivered" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}>
                        {r.status === "delivered" ? "Livrée" : "Annulée"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.gross_value)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{fmt(r.net_value)}</TableCell>
                    <TableCell className="text-right tabular-nums text-red-700">{fmt(r.loss_value)}</TableCell>
                    <TableCell>
                      <Link to="/admin/cockpit" search={{ orderId: r.order_id }}>
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
