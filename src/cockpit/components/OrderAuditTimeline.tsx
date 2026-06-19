import { useMemo } from "react";
import {
  Package, CheckCircle, CreditCard, Truck, XCircle, Scale,
  AlertTriangle, RefreshCw, ShieldAlert, PackageCheck, Repeat,
} from "lucide-react";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";
import type { PaymentRecord, AuditEntry } from "@/cockpit/types";
import type { OrderArticle } from "@/cockpit/lib/article-states";
import { STOCK_BREAK_ACTIONS } from "@/cockpit/lib/article-states";
import { PAYMENT_METHOD_LABELS, STATUS_LABELS, fmtF } from "@/cockpit/lib/workflow";
import { LINE_KIND_SHORT, type LineKind } from "@/lib/line-kind";

/** Transforme une entrée d'audit brute en libellé métier lisible.
 *  Exemples :
 *   "[uuid::IMPORT_KNOWN_WEIGHT] Statut → confirmed"
 *      → label "Statut → Confirmée", sub "Sous-commande Import · Poids déclaré"
 *   "Statut → shipped" → "Statut → Expédiée" */
function humanizeAuditAction(action: string): { label: string; sub?: string } {
  const scoped = action.match(/^\[([0-9a-f-]+)::(LOCAL|IMPORT_KNOWN_WEIGHT|IMPORT_UNKNOWN_WEIGHT)\]\s*Statut\s*→\s*(\S+)\s*$/i);
  if (scoped) {
    const lk = scoped[2].toUpperCase() as LineKind;
    const st = scoped[3];
    const lkLabel = lk === "LOCAL" ? "Sous-commande Local" : `Sous-commande Import (${LINE_KIND_SHORT[lk]})`;
    return { label: `Statut → ${STATUS_LABELS[st] ?? st}`, sub: lkLabel };
  }
  const simple = action.match(/^Statut\s*→\s*(\S+)\s*$/i);
  if (simple) return { label: `Statut → ${STATUS_LABELS[simple[1]] ?? simple[1]}` };
  return { label: action };
}

/* ═══════════════════════════════════════════════════════════════
   OrderAuditTimeline — historique unique regroupant toutes
   les sources : statut, paiements, ruptures, overrides, livraisons.
   ═══════════════════════════════════════════════════════════════ */

interface Event {
  date: string;
  label: string;
  sub?: string;
  by?: string;
  icon: React.ElementType;
  tone: "gray" | "blue" | "emerald" | "indigo" | "orange" | "red" | "amber" | "violet" | "teal";
}

const TONES: Record<Event["tone"], { bg: string; text: string }> = {
  gray: { bg: "bg-gray-100", text: "text-gray-600" },
  blue: { bg: "bg-blue-100", text: "text-blue-700" },
  emerald: { bg: "bg-emerald-100", text: "text-emerald-700" },
  indigo: { bg: "bg-indigo-100", text: "text-indigo-700" },
  orange: { bg: "bg-orange-100", text: "text-orange-700" },
  red: { bg: "bg-red-100", text: "text-red-700" },
  amber: { bg: "bg-amber-100", text: "text-amber-700" },
  violet: { bg: "bg-violet-100", text: "text-violet-700" },
  teal: { bg: "bg-teal-100", text: "text-teal-700" },
};

interface Props {
  order: LogisticsOrderRow;
  payments: PaymentRecord[];
  audit: AuditEntry[];
  articles?: OrderArticle[];
}

export function OrderAuditTimeline({ order, payments, audit, articles }: Props) {
  const events = useMemo<Event[]>(() => {
    const out: Event[] = [];

    // Création
    if (order.order_created_at) out.push({
      date: order.order_created_at, label: "Commande créée", icon: Package, tone: "gray",
    });

    // Audit (changements de statut, annulation, etc.)
    for (const a of audit) {
      let icon: React.ElementType = CheckCircle;
      let tone: Event["tone"] = "blue";
      const action = a.action.toLowerCase();
      if (action.includes("annul") || action.includes("cancel")) { icon = XCircle; tone = "red"; }
      else if (action.includes("livr") || action.includes("deliver")) { icon = CheckCircle; tone = "emerald"; }
      else if (action.includes("expéd") || action.includes("ship")) { icon = Truck; tone = "indigo"; }
      else if (action.includes("pesée") || action.includes("weigh")) { icon = Scale; tone = "orange"; }
      out.push({ date: a.timestamp, label: a.action, sub: a.details ?? undefined, by: a.adminName, icon, tone });
    }

    // Paiements (+ modifications)
    for (const p of payments) {
      out.push({
        date: p.timestamp,
        label: `Paiement enregistré · ${fmtF(p.amount)}`,
        sub: `${PAYMENT_METHOD_LABELS[p.method] ?? p.method}${p.reference ? ` · ${p.reference}` : ""}`,
        by: p.adminName, icon: CreditCard, tone: "emerald",
      });
      for (const e of p.editHistory ?? []) {
        out.push({
          date: e.editedAt,
          label: `Paiement modifié · ${fmtF(e.oldAmount)} → ${fmtF(e.newAmount)}`,
          by: e.editedBy, icon: RefreshCw, tone: "amber",
        });
      }
    }

    // Ruptures, résolutions, overrides, livraisons partielles
    for (const art of articles ?? []) {
      const sb = art.stock_break;
      if (sb) {
        out.push({
          date: sb.created_at,
          label: `Rupture déclarée · ${art.product_name}`,
          sub: sb.reason,
          icon: AlertTriangle, tone: "red",
        });
        if (sb.resolved) {
          const lbl = STOCK_BREAK_ACTIONS.find(a => a.key === sb.action)?.label ?? sb.action;
          let tone: Event["tone"] = "violet";
          let label = `Décision : ${lbl} · ${art.product_name}`;
          if (sb.action === "refund") { tone = "amber"; label = `Remboursement demandé · ${art.product_name}`; }
          else if (sb.action === "credit") { tone = "amber"; label = `Crédit demandé · ${art.product_name}`; }
          else if (sb.action === "wait_restock") { tone = "teal"; }
          else if (sb.action === "replace") { tone = "violet"; }
          out.push({
            date: sb.created_at, label,
            sub: sb.replacement ? `→ ${sb.replacement.product_name} @ ${sb.replacement.new_unit_price.toLocaleString("fr-FR")} FCFA` : undefined,
            icon: sb.action === "replace" ? Repeat : CheckCircle, tone,
          });
        }
        for (const o of sb.override_history ?? []) {
          out.push({
            date: o.at,
            label: `Décision modifiée par Super Admin · ${art.product_name}`,
            sub: `${STOCK_BREAK_ACTIONS.find(a => a.key === o.from_action)?.label} → ${STOCK_BREAK_ACTIONS.find(a => a.key === o.to_action)?.label} · ${o.reason}`,
            by: o.by, icon: ShieldAlert, tone: "amber",
          });
        }
        // Settlement (exécution financière) — TOP-LEVEL sur l'article, séparé de stock_break.
        if (art.settlement) {
          const s = art.settlement;
          const lbl =
            s.type === "refund" ? `Remboursement validé · ${fmtF(s.amount)}`
            : s.type === "credit" ? `Avoir émis · ${fmtF(s.amount)}`
            : s.type === "complement" ? `Complément encaissé · ${fmtF(s.amount)}`
            : `Règlement · ${fmtF(s.amount)}`;
          const subParts: string[] = [art.product_name];
          if (s.method) subParts.push(`${PAYMENT_METHOD_LABELS[s.method] ?? s.method}`);
          if (s.cost_attribution) subParts.push(`charge: ${s.cost_attribution}`);
          if (s.reference) subParts.push(s.reference);
          if (s.note) subParts.push(s.note);
          out.push({
            date: s.processed_at, label: lbl, sub: subParts.join(" · "),
            by: s.processed_by, icon: CheckCircle, tone: "emerald",
          });
        }
        // Reprise après réappro (wait_restock)
        if (sb.action === "wait_restock" && sb.resumed_at) {
          const start = new Date(sb.created_at).getTime();
          const end = new Date(sb.resumed_at).getTime();
          const days = Math.max(0, Math.floor((end - start) / 86400000));
          out.push({
            date: sb.resumed_at,
            label: `Stock revenu — flux repris · ${art.product_name}`,
            sub: `Attente : ${days} j${days > 1 ? "" : ""}`,
            by: sb.resumed_by, icon: RefreshCw, tone: "teal",
          });
        }
      }
      // Livraison partielle (état courant — pas d'historique)
      const delivered = art.delivered_qty ?? 0;
      if (delivered > 0 && delivered < art.quantity) {
        const last = (art.status_history ?? []).slice(-1)[0];
        out.push({
          date: last?.at ?? order.updated_at ?? order.order_created_at ?? new Date().toISOString(),
          label: `Livraison partielle · ${art.product_name}`,
          sub: `${delivered}/${art.quantity} livré`,
          by: last?.by, icon: PackageCheck, tone: "teal",
        });
      }
    }

    return out
      .filter(e => !!e.date)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [order, payments, audit, articles]);

  if (events.length === 0) {
    return <div className="text-xs text-gray-400 py-3 text-center italic">Aucun événement</div>;
  }

  return (
    <div className="space-y-0">
      {events.map((e, i) => {
        const d = new Date(e.date);
        const Icon = e.icon;
        const t = TONES[e.tone];
        return (
          <div key={i} className="flex gap-3 py-1.5">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full ${t.bg} flex items-center justify-center ${t.text}`}>
                <Icon className="h-4 w-4" />
              </div>
              {i < events.length - 1 && <div className="w-0.5 flex-1 bg-gray-200 my-1" />}
            </div>
            <div className="flex-1 pb-2 min-w-0">
              <div className="text-[13px] font-medium leading-tight">{e.label}</div>
              {e.sub && <div className="text-[11px] text-gray-500 mt-0.5 break-words">{e.sub}</div>}
              <div className="text-[10px] text-gray-400 mt-0.5">
                {d.toLocaleDateString("fr-FR")} · {d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                {e.by && ` · ${e.by}`}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
