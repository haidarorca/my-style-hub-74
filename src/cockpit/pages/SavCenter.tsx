// ═══════════════════════════════════════════════════════════════
// CENTRE SAV — Cockpit Admin
// Pilotage complet : KPI, filtres, drawer décisionnel, règles
// ═══════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { listAllCases, type SavCaseRow, type SavStatus } from "@/lib/sav-workflow.functions";
import { SavCaseList } from "@/components/sav/SavCaseList";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Settings2, RefreshCw } from "lucide-react";

const KPIS: Array<{ label: string; statuses: SavStatus[]; tone: string }> = [
  { label: "Nouveaux", statuses: ["open", "draft"], tone: "bg-blue-50 text-blue-700" },
  { label: "Attente vendeur", statuses: ["waiting_vendor", "in_review"], tone: "bg-amber-50 text-amber-700" },
  { label: "Attente client", statuses: ["waiting_client"], tone: "bg-amber-50 text-amber-700" },
  { label: "Vendeur répondu", statuses: ["vendor_responded"], tone: "bg-cyan-50 text-cyan-700" },
  { label: "Arbitrage", statuses: ["in_arbitration"], tone: "bg-orange-50 text-orange-700" },
  { label: "Acceptés", statuses: ["accepted", "partially_accepted"], tone: "bg-emerald-50 text-emerald-700" },
  { label: "Refusés", statuses: ["refused"], tone: "bg-red-50 text-red-700" },
  { label: "Escaladés", statuses: ["escalated"], tone: "bg-red-50 text-red-700" },
  { label: "En exécution", statuses: ["in_execution"], tone: "bg-violet-50 text-violet-700" },
  { label: "Clôturés", statuses: ["closed", "resolved"], tone: "bg-slate-100 text-slate-700" },
];

export default function SavCenter() {
  const list = useServerFn(listAllCases);
  const [search, setSearch] = useState("");
  const [includeClosed, setIncludeClosed] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ["sav-all", { includeClosed, search, fromDate, toDate }],
    queryFn: () => list({ data: {
      include_closed: includeClosed,
      search: search || null,
      from_date: fromDate || null,
      to_date: toDate || null,
    }}),
    staleTime: 10_000,
  });

  const cases = data as SavCaseRow[];

  const kpiCounts = useMemo(() => {
    return KPIS.map((k) => ({ ...k, count: cases.filter((c) => k.statuses.includes(c.status)).length }));
  }, [cases]);

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
            Centre SAV
          </h1>
          <p className="text-sm text-muted-foreground">
            Annulations, retours, échanges, garanties, litiges, remboursements et exceptions — tout en un seul endroit.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" /> Rafraîchir
          </Button>
          <Link to="/admin/sav-rules">
            <Button variant="outline" size="sm">
              <Settings2 className="w-4 h-4 mr-1" /> Règles SAV
            </Button>
          </Link>
          <Link to="/admin/cockpit">
            <Button variant="outline" size="sm">← Cockpit</Button>
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {kpiCounts.map((k) => (
          <Card key={k.label}><CardContent className={`p-3 ${k.tone}`}>
            <div className="text-xs">{k.label}</div>
            <div className="text-2xl font-bold">{k.count}</div>
          </CardContent></Card>
        ))}
      </div>

      {/* Filtres */}
      <Card><CardContent className="p-3 flex gap-2 flex-wrap items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-muted-foreground">Recherche globale</label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Titre, description, commande…" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Du</label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Au</label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <Button variant={includeClosed ? "default" : "outline"} size="sm" onClick={() => setIncludeClosed((v) => !v)}>
          {includeClosed ? "Masquer clôturés" : "Inclure clôturés"}
        </Button>
      </CardContent></Card>

      <SavCaseList cases={cases} role="admin" loading={isLoading} onChanged={refetch} />
    </div>
  );
}
