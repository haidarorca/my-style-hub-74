// ═══════════════════════════════════════════════════════════════
// SubOrderBadges — Cluster de badges métier (lecture seule).
//
// Toujours visibles sur les cartes du Cockpit (pipeline + liste +
// drawer) afin que les administrateurs identifient instantanément :
//   - Boutiques / produits supprimés
//   - Problèmes opérationnels (rupture, litige, paiement bloqué…)
//   - Action attendue (qui doit agir)
//   - Niveau de risque
//
// La liste des "problèmes opérationnels" est dérivée de OP_PROBLEMS
// (un seul point d'extension pour en ajouter de nouveaux).
// ═══════════════════════════════════════════════════════════════

import { AlertTriangle, Ban, ShieldAlert, Clock, Store, AlertOctagon } from "lucide-react";
import {
  AWAITS_LABELS,
  type AwaitsParty,
  type RiskLevel,
  type RiskAssessment,
} from "@/cockpit/lib/events";
import { OP_PROBLEMS, type OpProblemKey } from "@/cockpit/lib/cockpit-filters";
import type { SubOrderHistory } from "@/cockpit/hooks/useSubOrderHistories";

interface Props {
  history?: SubOrderHistory;
  compact?: boolean;
}

const RISK_TONE: Record<RiskLevel, string> = {
  none: "",
  low: "bg-amber-100 text-amber-800 border-amber-200",
  medium: "bg-orange-100 text-orange-800 border-orange-200",
  high: "bg-red-100 text-red-800 border-red-300",
  critical: "bg-red-600 text-white border-red-700",
};

const RISK_LABEL: Record<RiskLevel, string> = {
  none: "OK",
  low: "Risque faible",
  medium: "Risque moyen",
  high: "Risque élevé",
  critical: "Critique",
};

const AWAITS_TONE: Partial<Record<AwaitsParty, string>> = {
  awaits_admin: "bg-blue-100 text-blue-800",
  awaits_vendor: "bg-purple-100 text-purple-800",
  awaits_supplier: "bg-indigo-100 text-indigo-800",
  awaits_client: "bg-amber-100 text-amber-800",
  awaits_carrier: "bg-cyan-100 text-cyan-800",
};

// Style propre à chaque problème opérationnel.
const PROBLEM_STYLE: Record<OpProblemKey, { bg: string; shortLabel: string }> = {
  stock_break:          { bg: "bg-amber-200 text-amber-900",  shortLabel: "Rupture"  },
  product_deleted:      { bg: "bg-gray-700  text-white",      shortLabel: "P.supp."  },
  shop_deleted:         { bg: "bg-gray-800  text-white",      shortLabel: "B.supp."  },
  customer_dispute:     { bg: "bg-red-600   text-white",      shortLabel: "Litige"   },
  payment_blocked:      { bg: "bg-red-500   text-white",      shortLabel: "Paiem.✕"  },
  delivery_blocked:     { bg: "bg-orange-600 text-white",     shortLabel: "Livr.✕"   },
  supplier_unavailable: { bg: "bg-indigo-500 text-white",     shortLabel: "Fourn.✕"  },
};

export function SubOrderBadges({ history, compact = false }: Props) {
  if (!history) return null;
  const { events, risk, awaits } = history;

  // Détection générique des problèmes opérationnels (extensible via OP_PROBLEMS).
  const presentProblems = OP_PROBLEMS.filter(p => events.some(e => e.event_type === p.event));

  const interestingAwaits = [...awaits].filter((a) => a !== "awaits_nothing");
  if (presentProblems.length === 0 && interestingAwaits.length === 0 && risk.level === "none") {
    return null;
  }

  const size = compact ? "text-[8px] px-1 py-0.5" : "text-[10px] px-1.5 py-0.5";
  const icon = compact ? "h-2.5 w-2.5" : "h-3 w-3";

  return (
    <div className={`flex flex-wrap items-center gap-1 ${compact ? "mt-1" : "mt-1.5"}`}>
      {presentProblems.map(p => {
        const style = PROBLEM_STYLE[p.key];
        const Icon = p.key === "shop_deleted" ? Store : p.key === "product_deleted" ? Ban : AlertOctagon;
        return (
          <span
            key={p.key}
            title={p.label}
            className={`${size} font-bold rounded inline-flex items-center gap-0.5 ${style.bg}`}
          >
            <Icon className={icon} />
            {compact ? style.shortLabel : p.label}
          </span>
        );
      })}
      {risk.level !== "none" && <RiskBadge risk={risk} compact={compact} />}
      {interestingAwaits.map((a) => (
        <span
          key={a}
          title={AWAITS_LABELS[a]}
          className={`${size} font-semibold rounded inline-flex items-center gap-0.5 ${AWAITS_TONE[a] ?? "bg-gray-100 text-gray-700"}`}
        >
          <Clock className={icon} />
          {compact ? short(a) : AWAITS_LABELS[a]}
        </span>
      ))}
    </div>
  );
}

function short(a: AwaitsParty): string {
  switch (a) {
    case "awaits_admin": return "Kawzone";
    case "awaits_vendor": return "Vendeur";
    case "awaits_supplier": return "Fourn.";
    case "awaits_client": return "Client";
    case "awaits_carrier": return "Transp.";
    default: return "";
  }
}

function RiskBadge({ risk, compact }: { risk: RiskAssessment; compact: boolean }) {
  const size = compact ? "text-[8px] px-1 py-0.5" : "text-[10px] px-1.5 py-0.5";
  const icon = compact ? "h-2.5 w-2.5" : "h-3 w-3";
  const title =
    `${RISK_LABEL[risk.level]} (score ${risk.score})` +
    (risk.reasons.length ? `\nMotifs : ${risk.reasons.join(", ")}` : "");
  return (
    <span
      title={title}
      className={`${size} font-bold rounded inline-flex items-center gap-0.5 border ${RISK_TONE[risk.level]}`}
    >
      {risk.level === "critical" || risk.level === "high" ? (
        <AlertTriangle className={icon} />
      ) : (
        <ShieldAlert className={icon} />
      )}
      {RISK_LABEL[risk.level]}
    </span>
  );
}
