// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   Timeline — Chronologie complete avec utilisateur
   ═══════════════════════════════════════════════════════════════ */

import { Clock, CheckCircle, CreditCard, Truck, Package, XCircle, UserCheck, AlertCircle } from "lucide-react";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";
import type { PaymentRecord, AuditEntry } from "@/cockpit/hooks/useRealOrders";

interface Props {
  order: LogisticsOrderRow;
  payments: PaymentRecord[];
  audit: AuditEntry[];
}

interface TimelineEvent {
  date: string;
  label: string;
  sublabel?: string;
  icon: any;
  color: string;
  bgColor: string;
}

export function Timeline({ order, payments, audit }: Props) {
  const events: TimelineEvent[] = [];

  // ── Creation ──
  if (order.order_created_at) {
    events.push({
      date: order.order_created_at,
      label: "Commande creee",
      sublabel: "Systeme",
      icon: Package,
      color: "text-gray-600",
      bgColor: "bg-gray-100",
    });
  }

  // ── Confirmation ──
  const confirmAudit = audit.find(a => a.action.toLowerCase().includes("confirme") || a.action.toLowerCase().includes("confirmation"));
  if (order.logistics_status === "confirmed" || confirmAudit) {
    events.push({
      date: confirmAudit?.timestamp ?? order.updated_at ?? order.order_created_at,
      label: "Commande confirmee",
      sublabel: confirmAudit?.adminName ?? "Admin",
      icon: CheckCircle,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    });
  }

  // ── Annulation ──
  const cancelAudit = audit.find(a => a.action.toLowerCase().includes("annule") || a.action.toLowerCase().includes("cancel"));
  if (order.logistics_status === "cancelled" || cancelAudit) {
    events.push({
      date: cancelAudit?.timestamp ?? order.updated_at ?? order.order_created_at,
      label: "Commande annulee",
      sublabel: cancelAudit?.adminName ?? "Admin",
      icon: XCircle,
      color: "text-red-600",
      bgColor: "bg-red-100",
    });
  }

  // ── Pesee ──
  const weighAudit = audit.find(a => a.action.toLowerCase().includes("pesee") || a.action.toLowerCase().includes("poids"));
  if (order.real_weight_kg || weighAudit) {
    events.push({
      date: weighAudit?.timestamp ?? order.updated_at ?? order.order_created_at,
      label: `Pesee: ${order.real_weight_kg ?? "?"} kg`,
      sublabel: weighAudit?.adminName ?? "Admin",
      icon: AlertCircle,
      color: "text-orange-600",
      bgColor: "bg-orange-100",
    });
  }

  // ── Fret calcule ──
  if (order.total_shipping_fees && order.total_shipping_fees > 0) {
    events.push({
      date: order.updated_at ?? order.order_created_at,
      label: "Fret calcule",
      sublabel: fmtF(order.total_shipping_fees),
      icon: CreditCard,
      color: "text-indigo-600",
      bgColor: "bg-indigo-100",
    });
  }

  // ── Paiements ──
  const sortedPayments = [...payments].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  sortedPayments.forEach((p, i) => {
    events.push({
      date: p.timestamp,
      label: `Paiement ${i + 1}: ${fmtF(p.amount)}`,
      sublabel: `${p.method}${p.reference ? " (Ref: " + p.reference + ")" : ""} — ${p.adminName}`,
      icon: CreditCard,
      color: "text-emerald-600",
      bgColor: "bg-emerald-100",
    });
  });

  // ── Expedition ──
  const shipAudit = audit.find(a => a.action.toLowerCase().includes("expedi"));
  if (order.logistics_status === "shipped" || order.shipped_at || shipAudit) {
    events.push({
      date: order.shipped_at ?? shipAudit?.timestamp ?? order.updated_at,
      label: "Commande expediee",
      sublabel: shipAudit?.adminName ?? order.tracking_number ?? "",
      icon: Truck,
      color: "text-indigo-600",
      bgColor: "bg-indigo-100",
    });
  }

  // ── Livraison ──
  const deliverAudit = audit.find(a => a.action.toLowerCase().includes("livre"));
  if (order.logistics_status === "delivered" || deliverAudit) {
    events.push({
      date: deliverAudit?.timestamp ?? order.updated_at,
      label: "Commande livree",
      sublabel: deliverAudit?.adminName ?? "",
      icon: CheckCircle,
      color: "text-emerald-600",
      bgColor: "bg-emerald-100",
    });
  }

  // ── Derniere action ──
  if (audit.length > 0) {
    const lastAudit = audit[0]; // deja trie par date decroissante
    // N'ajouter que si c'est un type d'action non couvert ci-dessus
    const isCovered = lastAudit.action.toLowerCase().includes("confirme") ||
      lastAudit.action.toLowerCase().includes("annule") ||
      lastAudit.action.toLowerCase().includes("expedi") ||
      lastAudit.action.toLowerCase().includes("livre") ||
      lastAudit.action.toLowerCase().includes("paiement") ||
      lastAudit.action.toLowerCase().includes("pesee");
    if (!isCovered) {
      events.push({
        date: lastAudit.timestamp,
        label: lastAudit.action,
        sublabel: lastAudit.adminName,
        icon: UserCheck,
        color: "text-amber-600",
        bgColor: "bg-amber-100",
      });
    }
  }

  // ── Trier par date ──
  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (events.length === 0) {
    return <div className="text-xs text-gray-400 py-2 text-center">Aucun evenement</div>;
  }

  return (
    <div className="space-y-0">
      {events.map((e, i) => {
        const date = new Date(e.date);
        const Icon = e.icon;
        return (
          <div key={i} className="flex gap-3 py-1.5">
            {/* Icone + ligne */}
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full ${e.bgColor} flex items-center justify-center ${e.color}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              {i < events.length - 1 && <div className="w-0.5 flex-1 bg-gray-200 my-1" />}
            </div>
            {/* Contenu */}
            <div className="flex-1 pb-2">
              <div className="text-sm font-medium">{e.label}</div>
              {e.sublabel && <div className="text-[11px] text-gray-500">{e.sublabel}</div>}
              <div className="text-[10px] text-gray-400">
                {date.toLocaleDateString("fr-FR")} — {date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function fmtF(n: number): string {
  return n.toLocaleString("fr-FR") + " FCFA";
}
