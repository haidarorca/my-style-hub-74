// ═══════════════════════════════════════════════════════════════
// SubOrderActionCard — Phase 2 UX : carte d'action sous-commande.
//
// Objectif : un employé doit comprendre en < 2 secondes :
//   1. Identité de la sous-commande (KZ-XXX · i/N, boutique, type, poids)
//   2. Priorité métier (couleur + pastille)
//   3. Résumé compact (articles, total, frais, reste à payer)
//   4. Action principale attendue (gros bouton "Action suivante")
//   5. Compteurs d'actions en attente (bloqué / argent / livré)
//
// 100% présentation : un seul callback `onSelect(row)` ouvre le drawer
// où toutes les actions du workflow restent disponibles inchangées.
// ═══════════════════════════════════════════════════════════════

import { Store, Layers, AlertTriangle, Wallet, CheckCircle2, Ban, ArrowRight } from "lucide-react";
import { fmtF, fmtDateTime } from "@/cockpit/lib/workflow";
import { LINE_KIND_SHORT, LINE_KIND_BADGE } from "@/lib/line-kind";
import type { SubOrderRow } from "@/cockpit/hooks/useSubOrderRows";
import { SubOrderBadges } from "./SubOrderBadges";
import { getHistory, type SubOrderHistoryMap } from "@/cockpit/hooks/useSubOrderHistories";
import {
  getSubOrderPriority,
  getStatusBadge,
  getPrimaryAction,
} from "@/cockpit/lib/sub-order-actions";

interface Props {
  row: SubOrderRow;
  onSelect: (row: SubOrderRow) => void;
  historyMap?: SubOrderHistoryMap;
  /** Reste à payer (déduit en amont par PipelineView). */
  remaining?: number;
  /** Total frais (fret/import) de la commande mère. */
  freight?: number;
}

export function SubOrderActionCard({ row, onSelect, historyMap, remaining = 0, freight = 0 }: Props) {
  const a = row.aggregate;
  const status = row.effective_status;
  const blocked = a.counters.blocked;
  const moneyAbs = a.pending_money.total_abs;
  const delivered = a.counters.delivered;
  const vendorDeleted = row.vendor_id === "unknown";

  const priority = getSubOrderPriority(status, blocked);
  const badge = getStatusBadge(status);
  const primary = getPrimaryAction(status, row.line_kind);

  const kindLabel = LINE_KIND_SHORT[row.line_kind];
  const kindClass = LINE_KIND_BADGE[row.line_kind];

  const scopeBadge =
    row.cockpit_scope === "kawzone"
      ? { label: "KZ", cls: "bg-blue-600 text-white" }
      : row.cockpit_scope === "commission"
        ? { label: "COM", cls: "bg-purple-600 text-white" }
        : { label: "EXT", cls: "bg-gray-400 text-white" };

  // Compteur global d'actions en attente (somme des "à traiter").
  const pendingCount = blocked + (moneyAbs > 0 ? 1 : 0) + (remaining > 0 ? 1 : 0);

  return (
    <div
      className={`w-full rounded-lg border bg-white border-l-4 shadow-sm hover:shadow-md transition-shadow ${priority.borderClass}`}
    >
      {/* ── HEADER : identité préservée (KZ-XXX · i/N · boutique · type · poids) ── */}
      <button
        onClick={() => onSelect(row)}
        className="w-full text-left px-3 pt-2.5 pb-2"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-[10px] font-bold text-gray-700">{row.label}</span>
              {row.total > 1 && (
                <span className="text-[9px] font-bold text-indigo-600 inline-flex items-center gap-0.5">
                  <Layers className="h-2.5 w-2.5" />
                  {row.index}/{row.total}
                </span>
              )}
              <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${scopeBadge.cls}`}>{scopeBadge.label}</span>
              <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${kindClass}`}>{kindLabel}</span>
            </div>
            <div className="mt-1 flex items-center gap-1 min-w-0">
              <Store className="h-3.5 w-3.5 text-gray-500 shrink-0" />
              <span className="text-sm font-bold truncate">{row.vendor_name}</span>
              {vendorDeleted && (
                <span className="text-[8px] uppercase font-bold bg-gray-700 text-white px-1 rounded inline-flex items-center gap-0.5">
                  <Ban className="h-2.5 w-2.5" />supp.
                </span>
              )}
            </div>
            <div className="text-[10px] text-gray-500 truncate">
              {row.order.customer_name ?? "—"} · {fmtDateTime(row.order.order_created_at)}
            </div>
          </div>

          {/* Pastille priorité + statut */}
          <div className="shrink-0 flex flex-col items-end gap-1">
            <span
              className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${priority.pillClass} ${priority.pulse ? "animate-pulse" : ""}`}
            >
              {priority.pulse && <AlertTriangle className="h-2.5 w-2.5" />}
              {priority.label}
            </span>
            {pendingCount > 0 && (
              <span className="text-[9px] font-bold bg-white border border-current text-gray-700 px-1.5 py-0.5 rounded-full">
                {pendingCount} en attente
              </span>
            )}
          </div>
        </div>

        {/* ── Badge statut métier ── */}
        <div className={`mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-semibold ${badge.className}`}>
          <span className="text-sm leading-none">{badge.emoji}</span>
          <span>{badge.label}</span>
        </div>

        {/* ── Résumé métier compact ── */}
        <div className="mt-2 grid grid-cols-4 gap-1 text-center">
          <Stat label="Articles" value={String(row.financials.article_count)} />
          <Stat label="Produits" value={fmtF(row.financials.product_total)} />
          <Stat
            label="Frais"
            value={freight > 0 ? fmtF(freight) : "—"}
            tone={freight > 0 ? "orange" : "muted"}
          />
          <Stat
            label="Reste"
            value={remaining > 0 ? fmtF(remaining) : "Payé"}
            tone={remaining > 0 ? "red" : "emerald"}
          />
        </div>

        {/* ── Compteurs d'actions en attente ── */}
        {(blocked > 0 || moneyAbs > 0 || delivered > 0) && (
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            {blocked > 0 && (
              <Counter icon={AlertTriangle} value={blocked} label="bloqué" tone="red" />
            )}
            {moneyAbs > 0 && (
              <Counter icon={Wallet} value={fmtF(moneyAbs)} label="à régler" tone="amber" />
            )}
            {delivered > 0 && (
              <Counter icon={CheckCircle2} value={delivered} label="livré" tone="emerald" />
            )}
          </div>
        )}

        <SubOrderBadges history={getHistory(historyMap, row.mother_order_id, row.vendor_id)} compact />
      </button>

      {/* ── ACTION SUIVANTE (bouton unique mis en avant) ── */}
      {primary && (
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(row); }}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2 border-t text-left text-xs font-bold transition-colors ${priority.pillClass} hover:brightness-110`}
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <primary.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{primary.label}</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 opacity-80" />
        </button>
      )}
    </div>
  );
}

// ─── Sous-composants ───
function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "orange" | "red" | "emerald" | "muted" }) {
  const cls = {
    default: "text-gray-800",
    orange: "text-orange-700",
    red: "text-red-600",
    emerald: "text-emerald-700",
    muted: "text-gray-400",
  }[tone];
  return (
    <div className="rounded bg-gray-50 px-1 py-1 min-w-0">
      <div className="text-[8px] uppercase text-gray-500 tracking-wide leading-none">{label}</div>
      <div className={`text-[11px] font-bold mt-0.5 truncate ${cls}`}>{value}</div>
    </div>
  );
}

function Counter({ icon: Icon, value, label, tone }: { icon: React.ElementType; value: string | number; label: string; tone: "red" | "amber" | "emerald" }) {
  const cls = {
    red: "bg-red-50 text-red-700 border-red-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cls}`}>
      <Icon className="h-3 w-3" />
      <span className="font-bold">{value}</span>
      <span className="opacity-80">{label}</span>
    </span>
  );
}
