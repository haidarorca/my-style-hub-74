import { useState, useMemo } from "react";
import type { SavCaseRow } from "@/lib/sav-workflow.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CaseStatusBadge, CaseTypeBadge, SlaBadge, AdminDecisionBadge, VendorRecoBadge, STATUS_LABEL, CASE_TYPE_LABEL } from "./SavCaseBadges";
import { SavCaseDrawer, type SavRole } from "./SavCaseDrawer";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";

interface Props {
  cases: SavCaseRow[];
  role: SavRole;
  loading?: boolean;
  onChanged?: () => void;
}

export function SavCaseList({ cases, role, loading, onChanged }: Props) {
  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState<string>("all");
  const [typeF, setTypeF] = useState<string>("all");
  const [selected, setSelected] = useState<SavCaseRow | null>(null);

  const filtered = useMemo(() => cases.filter((c) => {
    if (statusF !== "all" && c.status !== statusF) return false;
    if (typeF !== "all" && c.case_type !== typeF) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!c.title.toLowerCase().includes(s) && !(c.description ?? "").toLowerCase().includes(s) && !c.order_id.includes(s)) return false;
    }
    return true;
  }), [cases, search, statusF, typeF]);

  return (
    <>
      <div className="flex gap-2 flex-wrap mb-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Recherche…" className="max-w-xs" />
        <Select value={statusF} onValueChange={setStatusF}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeF} onValueChange={setTypeF}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous types</SelectItem>
            {Object.entries(CASE_TYPE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dossier</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Statut</TableHead>
              {role !== "client" && <TableHead>Vendeur</TableHead>}
              {role === "admin" && <TableHead>Admin</TableHead>}
              <TableHead>SLA</TableHead>
              <TableHead>Ouvert</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Chargement…</TableCell></TableRow>}
            {!loading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Aucun dossier</TableCell></TableRow>
            )}
            {filtered.map((c) => (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => setSelected(c)}>
                <TableCell>
                  <div className="font-medium flex items-center gap-2">
                    {c.title}
                    {c.on_behalf_of_user_id && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">Admin pour client</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{c.order_id.slice(0, 8)}…</div>
                </TableCell>
                <TableCell><CaseTypeBadge type={c.case_type} /></TableCell>
                <TableCell><CaseStatusBadge status={c.status} /></TableCell>
                {role !== "client" && <TableCell><VendorRecoBadge reco={c.vendor_recommendation} /></TableCell>}
                {role === "admin" && <TableCell><AdminDecisionBadge decision={c.admin_decision} /></TableCell>}
                <TableCell><SlaBadge deadline={c.sla_deadline_at} /></TableCell>
                <TableCell className="text-xs">{new Date(c.opened_at).toLocaleDateString("fr-FR")}</TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelected(c); }}>
                    <Eye className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <SavCaseDrawer
        caseRow={selected}
        role={role}
        open={Boolean(selected)}
        onOpenChange={(v) => { if (!v) setSelected(null); }}
        onChanged={() => { onChanged?.(); }}
      />
    </>
  );
}
