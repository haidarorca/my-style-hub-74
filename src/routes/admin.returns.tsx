// ═══════════════════════════════════════════════════════════════
// /admin/returns — Centre Retours & Annulations
// Liste des dossiers + filtres simples.
// ═══════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  listReturnCases,
  type ReturnKind,
  type ReturnStatus,
} from "@/lib/returns.functions";
import { AlertTriangle, ArrowRight, Search, Undo2, XCircle } from "lucide-react";

export const Route = createFileRoute("/admin/returns")({
  component: ReturnsListPage,
});

const STATUS_META: Record<ReturnStatus, { label: string; cls: string }> = {
  open: { label: "En analyse", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  decided: { label: "Décidé", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  closed: { label: "Clôturé", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  cancelled: { label: "Annulé", cls: "bg-slate-100 text-slate-700 border-slate-200" },
};

function fmt(n: number | null | undefined) {
  if (!n) return "0 FCFA";
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

function ReturnsListPage() {
  const [status, setStatus] = useState<ReturnStatus | "all">("all");
  const [kind, setKind] = useState<ReturnKind | "all">("all");
  const [search, setSearch] = useState("");

  const listFn = useServerFn(listReturnCases);
  const { data: rows, isLoading } = useQuery({
    queryKey: ["return-cases", status, kind, search],
    queryFn: () => listFn({ data: { status, kind, search } }),
    refetchInterval: 30_000,
  });

  const counts = useMemo(() => {
    const arr = rows ?? [];
    return {
      open: arr.filter((r) => r.status === "open").length,
      decided: arr.filter((r) => r.status === "decided").length,
      total: arr.length,
    };
  }, [rows]);

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
            Centre Retours & Annulations
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Un dossier traite uniquement les articles concernés. Le contexte de
            la commande est visible en lecture seule.
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200">
            <span className="font-bold text-amber-800">{counts.open}</span>{" "}
            <span className="text-amber-700">en analyse</span>
          </span>
          <span className="px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200">
            <span className="font-bold text-blue-800">{counts.decided}</span>{" "}
            <span className="text-blue-700">décidés</span>
          </span>
        </div>
      </header>

      {/* Filtres */}
      <div className="bg-white border rounded-xl p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par code…"
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
          />
        </div>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as any)}
          className="px-3 py-2 border rounded-lg text-sm"
        >
          <option value="all">Tous les types</option>
          <option value="return">Retours</option>
          <option value="cancellation">Annulations</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as any)}
          className="px-3 py-2 border rounded-lg text-sm"
        >
          <option value="all">Tous les statuts</option>
          <option value="open">En analyse</option>
          <option value="decided">Décidés</option>
          <option value="closed">Clôturés</option>
          <option value="cancelled">Annulés</option>
        </select>
      </div>

      {/* Tableau */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-600">
            <tr>
              <th className="text-left px-4 py-2 font-semibold">Code</th>
              <th className="text-left px-4 py-2 font-semibold">Type</th>
              <th className="text-left px-4 py-2 font-semibold">Statut</th>
              <th className="text-right px-4 py-2 font-semibold">Conseillé</th>
              <th className="text-right px-4 py-2 font-semibold">Final</th>
              <th className="text-left px-4 py-2 font-semibold">Ouvert le</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                  Chargement…
                </td>
              </tr>
            )}
            {!isLoading && (rows?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  Aucun dossier.
                </td>
              </tr>
            )}
            {(rows ?? []).map((r) => {
              const meta = STATUS_META[r.status];
              return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono font-semibold">{r.code}</td>
                  <td className="px-4 py-2">
                    <span className="inline-flex items-center gap-1 text-xs">
                      {r.kind === "return" ? (
                        <Undo2 className="w-3.5 h-3.5 text-blue-600" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-rose-600" />
                      )}
                      {r.kind === "return" ? "Retour" : "Annulation"}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded border text-xs ${meta.cls}`}>
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">{fmt(r.refund_suggested_xof)}</td>
                  <td className="px-4 py-2 text-right font-semibold">
                    {r.refund_final_xof != null ? fmt(r.refund_final_xof) : "—"}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {new Date(r.created_at).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      to="/admin/returns/$caseId"
                      params={{ caseId: r.id }}
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs font-semibold"
                    >
                      Ouvrir <ArrowRight className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
