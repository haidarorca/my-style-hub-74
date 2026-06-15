// ═══════════════════════════════════════════════════════════════
// SubOrderProfitabilityPanel — Vue financière d'une sous-commande.
//
// Affichée dans le drawer dès qu'on est scopé sur UNE boutique.
// Montre : ventes, commission encaissée, marge Kawzone, remboursements,
// avoirs, problèmes opérationnels (annulations, ruptures, livraison).
//
// Le "prix réel d'achat" n'est pas encore stocké en base : un emplacement
// dédié est prévu mais affiché en "—" tant que `cost_price` n'existe pas
// sur products / order_items.
// ═══════════════════════════════════════════════════════════════

import { TrendingUp, AlertTriangle, RotateCcw, Wallet, Receipt } from "lucide-react";
import { fmtF } from "@/cockpit/lib/workflow";
import type { OrderArticle } from "@/cockpit/lib/article-states";
import type { DerivedSubOrder } from "@/cockpit/lib/sub-orders";

interface Props {
  sub: DerivedSubOrder;
  articles: OrderArticle[];
}

export function SubOrderProfitabilityPanel({ sub, articles }: Props) {
  const f = sub.financials;
  const scopeLabel =
    sub.cockpit_scope === "kawzone" ? "Boutique Kawzone"
    : sub.cockpit_scope === "commission" ? "Commission Kawzone"
    : "Externe (observée)";
  const scopeClass =
    sub.cockpit_scope === "kawzone" ? "bg-blue-600 text-white"
    : sub.cockpit_scope === "commission" ? "bg-purple-600 text-white"
    : "bg-gray-400 text-white";

  const cancelled = articles.filter(a => a.status === "cancelled").length;
  const blocked = f.blocked_count;
  const replaced = articles.filter(a => a.stock_break?.action === "replace").length;
  const partial = articles.filter(a => (a.delivered_qty ?? 0) > 0 && (a.delivered_qty ?? 0) < a.quantity).length;
  const modifications = articles.filter(a => a.status_history && a.status_history.length > 1).length;

  return (
    <div className="bg-white border rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="h-4 w-4 text-blue-600" />
          <h3 className="text-sm font-semibold">Rentabilité sous-commande</h3>
        </div>
        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${scopeClass}`}>{scopeLabel}</span>
      </div>

      {/* Ligne revenus */}
      <div className="grid grid-cols-3 gap-2">
        <Cell label="Prix de vente" value={fmtF(f.product_total)} tone="default" />
        <Cell label="Commission" value={fmtF(f.commission_total)} tone="purple" />
        <Cell label="Marge Kawzone" value={fmtF(f.kawzone_margin)} tone="emerald" />
      </div>

      {/* Coût réel — placeholder en attendant le champ produit */}
      <div className="grid grid-cols-3 gap-2">
        <Cell label="Coût réel" value="—" hint="À renseigner sur la fiche produit" tone="muted" />
        <Cell label="Remboursés" value={fmtF(f.refund_total)} icon={<RotateCcw className="h-3 w-3" />} tone={f.refund_total > 0 ? "red" : "muted"} />
        <Cell label="Avoirs" value={fmtF(f.credit_total)} icon={<Receipt className="h-3 w-3" />} tone={f.credit_total > 0 ? "amber" : "muted"} />
      </div>

      {/* Indicateurs opérationnels */}
      <div className="border-t pt-2">
        <div className="text-[10px] text-gray-500 mb-1 font-semibold uppercase">Indicateurs opérationnels</div>
        <div className="grid grid-cols-3 gap-1.5 text-[10px]">
          <Indicator label="Articles" value={f.article_count} />
          <Indicator label="Livrés" value={f.delivered_count} tone="emerald" />
          <Indicator label="Annulés" value={cancelled} tone={cancelled > 0 ? "gray" : "muted"} />
          <Indicator label="Bloqués" value={blocked} icon={<AlertTriangle className="h-3 w-3" />} tone={blocked > 0 ? "red" : "muted"} />
          <Indicator label="Remplacés" value={replaced} tone={replaced > 0 ? "amber" : "muted"} />
          <Indicator label="Partiels" value={partial} tone={partial > 0 ? "amber" : "muted"} />
          <Indicator label="Modifs" value={modifications} tone={modifications > 0 ? "blue" : "muted"} />
          <Indicator label="Règl. attente" value={sub.aggregate.pending_money.actions.length} icon={<Wallet className="h-3 w-3" />} tone={sub.aggregate.pending_money.total_abs > 0 ? "amber" : "muted"} />
          <Indicator label="Prêt expédition" value={sub.aggregate.flags.can_ship_today ? "✓" : "—"} tone={sub.aggregate.flags.can_ship_today ? "emerald" : "muted"} />
        </div>
      </div>
    </div>
  );
}

function Cell({ label, value, hint, icon, tone }: { label: string; value: string; hint?: string; icon?: React.ReactNode; tone: "default" | "purple" | "emerald" | "red" | "amber" | "muted" }) {
  const cls = {
    default: "bg-gray-50 text-gray-900",
    purple: "bg-purple-50 text-purple-700",
    emerald: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-700",
    muted: "bg-gray-50 text-gray-400",
  }[tone];
  return (
    <div className={`rounded p-2 ${cls}`}>
      <div className="text-[9px] uppercase font-semibold opacity-70 flex items-center gap-1">{icon}{label}</div>
      <div className="text-sm font-bold mt-0.5">{value}</div>
      {hint && <div className="text-[8px] opacity-60 mt-0.5">{hint}</div>}
    </div>
  );
}

function Indicator({ label, value, icon, tone = "muted" }: { label: string; value: number | string; icon?: React.ReactNode; tone?: "muted" | "emerald" | "red" | "amber" | "blue" | "gray" }) {
  const cls = {
    muted: "text-gray-400",
    emerald: "text-emerald-600",
    red: "text-red-600",
    amber: "text-amber-600",
    blue: "text-blue-600",
    gray: "text-gray-600",
  }[tone];
  return (
    <div className="flex items-center justify-between bg-gray-50 rounded px-1.5 py-1">
      <span className="text-gray-500 flex items-center gap-1">{icon}{label}</span>
      <span className={`font-bold ${cls}`}>{value}</span>
    </div>
  );
}
