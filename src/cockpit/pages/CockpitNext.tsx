// ═══════════════════════════════════════════════════════════════
// CockpitNext — vue ACTIONS du Cockpit (lecture seule).
//
// Question unique posée par l'écran :
//   « Si j'arrive le matin, qu'est-ce que je fais en premier ? »
//
// Hiérarchie visuelle :
//   1. À FAIRE MAINTENANT — la commande la plus prioritaire, nommée.
//   2. LIGNE DU FEU — 4 tuiles filtrables (Bloqué · Argent · Prêt · Souffrance).
//   3. SUR MON BUREAU — décisions admin, triées par ancienneté.
//   4. PRÊT À AVANCER — peut partir aujourd'hui.
//   5. EN ATTENTE EXTERNE — fournisseur / réappro.
//   6. LISTE filtrée.
//
// Source : aggregateOrder() (batch ≤ 60). Aucune action métier ici —
// les clics renvoient vers l'ancien Cockpit (lien retour conservé).
// ═══════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Flame, Wallet, PackageCheck, Clock, Target, ArrowRight,
  ShoppingCart, RotateCcw, ArrowLeft, Zap, CheckCircle2,
} from "lucide-react";
import { useRealOrders } from "@/cockpit/hooks/useRealOrders";
import { useOrderAggregatesBatch, type OrderWithAggregate } from "@/cockpit/hooks/useOrderAggregatesBatch";
import { getOrderNumber } from "@/cockpit/lib/orderNumbers";
import { fmtF } from "@/cockpit/lib/workflow";
import { NEXT_ACTION_LABELS, type AggregateNextAction } from "@/cockpit/lib/order-aggregate";

// ─── Staleness (proxy basé sur order_created_at) ───
type Staleness = "fresh" | "watch" | "stale" | "critical";
function staleness(o: OrderWithAggregate): { level: Staleness; days: number } {
  const created = o.order.order_created_at;
  if (!created) return { level: "fresh", days: 0 };
  const days = Math.floor((Date.now() - new Date(created).getTime()) / 86_400_000);
  const level: Staleness =
    days >= 14 ? "critical" : days >= 7 ? "stale" : days >= 3 ? "watch" : "fresh";
  return { level, days };
}
const STALE_PILL: Record<Staleness, string> = {
  fresh: "bg-gray-100 text-gray-600",
  watch: "bg-amber-100 text-amber-800",
  stale: "bg-orange-200 text-orange-900",
  critical: "bg-red-600 text-white",
};
const STALE_LABEL: Record<Staleness, string> = {
  fresh: "récente", watch: "à surveiller", stale: "ancienne", critical: "critique",
};

// ─── Priorité globale : sert à élire « ce que je fais en premier » ───
// Plus le score est haut, plus c'est urgent. La staleness pondère.
const ACTION_PRIORITY: Record<AggregateNextAction, number> = {
  resolve_break: 100,
  settle_money: 80,
  ship: 60,
  prepare_shipment: 50,
  receive_warehouse: 30,
  order_supplier: 20,
  wait_restock: 5,
  review: 1,
  done: 0,
};

function isActionable(a: AggregateNextAction): boolean {
  return a !== "done" && a !== "review" && a !== "wait_restock";
}

type Filter = "all" | "blocked" | "money" | "ready" | "stale";

export default function CockpitNext() {
  const { orders, isLoading } = useRealOrders();
  const enriched = useOrderAggregatesBatch(orders);

  const [filter, setFilter] = useState<Filter>("all");

  // ─── Synthèse globale (ligne du feu) ─────────────────────────
  const fire = useMemo(() => {
    let blockedArticles = 0, blockedOrders = 0;
    let refundTotal = 0, extraTotal = 0, moneyOrders = 0;
    let readyOrders = 0, readyArticles = 0, readyValue = 0;
    let painCritical = 0, painStale = 0, oldest = 0;

    for (const e of enriched) {
      const agg = e.aggregate; if (!agg) continue;
      if (agg.counters.blocked > 0) {
        blockedArticles += agg.counters.blocked; blockedOrders++;
      }
      if (agg.pending_money.total_abs > 0) {
        refundTotal += agg.pending_money.refund;
        extraTotal += agg.pending_money.extra_payment;
        moneyOrders++;
      }
      if (agg.flags.can_ship_today) {
        readyOrders++;
        readyArticles += agg.counters.ready;
        for (const r of agg.by_bucket.ready) readyValue += r.article.line_total ?? 0;
      }
      // En souffrance : on ne compte QUE les commandes encore actives.
      // Une vieille commande livrée n'est pas une douleur opérationnelle.
      if (isActionable(agg.next_action)) {
        const s = staleness(e);
        if (s.level === "critical") painCritical++;
        else if (s.level === "stale") painStale++;
        if (s.days > oldest) oldest = s.days;
      }
    }
    return {
      blockedArticles, blockedOrders,
      refundTotal, extraTotal, moneyOrders,
      readyOrders, readyArticles, readyValue,
      painCritical, painStale, oldest,
    };
  }, [enriched]);

  // ─── ÉLECTION : la SEULE commande à attaquer en premier ──────
  const topPriority = useMemo(() => {
    let best: { e: OrderWithAggregate; score: number; days: number } | null = null;
    for (const e of enriched) {
      const a = e.aggregate; if (!a) continue;
      if (!isActionable(a.next_action)) continue;
      const s = staleness(e);
      // Score = priorité métier + bonus ancienneté (cap 30 jours).
      const score = ACTION_PRIORITY[a.next_action] + Math.min(s.days, 30);
      if (!best || score > best.score) best = { e, score, days: s.days };
    }
    return best;
  }, [enriched]);

  // ─── Catégorisation pour les 3 sections (triées par ancienneté) ──
  const sortByStaleDesc = (a: OrderWithAggregate, b: OrderWithAggregate) =>
    staleness(b).days - staleness(a).days;

  const onMyDesk = useMemo(() => enriched
    .filter(e => {
      const a = e.aggregate; if (!a) return false;
      return a.counters.blocked > 0 || a.counters.waiting_money > 0;
    })
    .sort(sortByStaleDesc), [enriched]);

  const readyToProgress = useMemo(() => enriched
    .filter(e => e.aggregate?.flags.can_ship_today)
    .sort(sortByStaleDesc), [enriched]);

  const waitingExternal = useMemo(() => enriched
    .filter(e => {
      const a = e.aggregate; if (!a) return false;
      if (a.counters.blocked > 0 || a.counters.waiting_money > 0) return false;
      return a.counters.waiting_supplier > 0 || a.counters.waiting_restock > 0;
    })
    .sort(sortByStaleDesc), [enriched]);

  // ─── Filtre liste ─────────────────────────────────────────────
  const filteredList = useMemo(() => enriched
    .filter(e => {
      const a = e.aggregate; if (!a) return filter === "all";
      if (filter === "all") return true;
      if (filter === "blocked") return a.counters.blocked > 0;
      if (filter === "money") return a.pending_money.total_abs > 0;
      if (filter === "ready") return a.flags.can_ship_today;
      if (filter === "stale") {
        if (!isActionable(a.next_action)) return false;
        const s = staleness(e); return s.level === "critical" || s.level === "stale";
      }
      return true;
    })
    .sort(sortByStaleDesc), [enriched, filter]);

  const moneyNet = fire.extraTotal - fire.refundTotal;
  const allClear = !isLoading
    && fire.blockedArticles === 0
    && fire.moneyOrders === 0
    && fire.painCritical === 0
    && !topPriority;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* En-tête */}
      <header className="sticky top-0 z-10 bg-white border-b px-3 py-2.5 flex items-center gap-2">
        <Link to="/admin/cockpit" className="text-gray-500 hover:text-gray-800">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-sm font-bold">Cockpit · vue actions</h1>
          <p className="text-[10px] text-gray-500">
            {enriched.length} commande(s) · cliquer une commande → ancien Cockpit
          </p>
        </div>
        <Link to="/admin/cockpit" className="text-[10px] text-indigo-600 underline">
          ancienne vue
        </Link>
      </header>

      <main className="p-3 space-y-4">
        {/* ─── À FAIRE MAINTENANT (héros) ─────────────────────── */}
        {topPriority && (
          <TopPriority item={topPriority.e} days={topPriority.days} />
        )}

        {allClear && (
          <section className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
            <div>
              <h2 className="text-sm font-bold text-emerald-900">Aucune action urgente</h2>
              <p className="text-[11px] text-emerald-700">
                Rien ne bloque, aucun règlement en attente, rien de critique. Bonne journée.
              </p>
            </div>
          </section>
        )}

        {/* ─── LIGNE DU FEU ─────────────────────────────────────── */}
        <section className="grid grid-cols-2 gap-2">
          <FireTile
            tone="red" icon={Flame} label="Bloqué"
            primary={fire.blockedArticles === 0 ? "0" : `${fire.blockedArticles} article${fire.blockedArticles > 1 ? "s" : ""}`}
            secondary={fire.blockedOrders === 0 ? "tout est traité" : `${fire.blockedOrders} commande${fire.blockedOrders > 1 ? "s" : ""}`}
            active={filter === "blocked"}
            onClick={() => setFilter(filter === "blocked" ? "all" : "blocked")}
          />
          <FireTile
            tone="amber" icon={Wallet} label="Argent à régler"
            primary={fire.moneyOrders === 0 ? "—" : (moneyNet === 0 ? "à équilibrer" : (moneyNet > 0 ? `+ ${fmtF(moneyNet)}` : `− ${fmtF(-moneyNet)}`))}
            secondary={fire.moneyOrders === 0
              ? "aucun règlement dû"
              : `${fmtF(fire.refundTotal)} à rembourser · ${fmtF(fire.extraTotal)} à encaisser`}
            active={filter === "money"}
            onClick={() => setFilter(filter === "money" ? "all" : "money")}
          />
          <FireTile
            tone="emerald" icon={PackageCheck} label="Peut partir aujourd'hui"
            primary={`${fire.readyOrders} commande${fire.readyOrders > 1 ? "s" : ""}`}
            secondary={fire.readyOrders === 0 ? "rien de prêt" : `${fire.readyArticles} art. · ${fmtF(fire.readyValue)}`}
            active={filter === "ready"}
            onClick={() => setFilter(filter === "ready" ? "all" : "ready")}
          />
          <FireTile
            tone="orange" icon={Clock} label="En souffrance"
            primary={fire.painCritical === 0 ? (fire.painStale === 0 ? "0" : `${fire.painStale} ancienne${fire.painStale > 1 ? "s" : ""}`) : `${fire.painCritical} critique${fire.painCritical > 1 ? "s" : ""}`}
            secondary={fire.oldest > 0
              ? `+ ${fire.painStale} à surveiller · vieille de ${fire.oldest}j`
              : "rien en retard"}
            active={filter === "stale"}
            onClick={() => setFilter(filter === "stale" ? "all" : "stale")}
          />
        </section>

        {/* ─── SUR MON BUREAU ──────────────────────────────────── */}
        <Section
          title="Sur mon bureau"
          subtitle="ce qui attend ma décision (triée par ancienneté)"
          icon={Target} items={onMyDesk}
          empty="Aucune décision à prendre — bravo."
          renderLabel={(e) => {
            const a = e.aggregate!;
            if (a.counters.blocked > 0) return `Rupture · ${a.counters.blocked} art. · ${a.next_action_driver?.product_name ?? ""}`;
            if (a.counters.waiting_money > 0) return `Règlement · ${fmtF(a.pending_money.total_abs)}`;
            return NEXT_ACTION_LABELS[a.next_action];
          }}
          accent="indigo"
        />

        {/* ─── PRÊT À AVANCER ──────────────────────────────────── */}
        <Section
          title="Prêt à avancer"
          subtitle="rien ne bloque, prêt à expédier"
          icon={ArrowRight} items={readyToProgress}
          empty="Aucune commande n'est encore prête à partir."
          renderLabel={(e) => {
            const a = e.aggregate!;
            const val = a.by_bucket.ready.reduce((s, r) => s + (r.article.line_total ?? 0), 0);
            return `${a.counters.ready} art. · ${fmtF(val)}`;
          }}
          accent="emerald"
        />

        {/* ─── EN ATTENTE EXTERNE ──────────────────────────────── */}
        <Section
          title="En attente externe"
          subtitle="fournisseur, réappro — pas d'action de ma part"
          icon={ShoppingCart} items={waitingExternal}
          empty="Aucune attente externe en cours."
          renderLabel={(e) => {
            const a = e.aggregate!;
            const parts: string[] = [];
            if (a.counters.waiting_supplier > 0) parts.push(`${a.counters.waiting_supplier} fournisseur`);
            if (a.counters.waiting_restock > 0) parts.push(`${a.counters.waiting_restock} réappro`);
            return parts.join(" · ");
          }}
          accent="slate"
        />

        {/* ─── LISTE FILTRÉE ───────────────────────────────────── */}
        <section className="bg-white rounded-xl border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">Liste ({filteredList.length})</h2>
            {filter !== "all" && (
              <button
                onClick={() => setFilter("all")}
                className="text-[10px] text-indigo-600 underline flex items-center gap-1"
              >
                <RotateCcw className="h-3 w-3" /> Réinitialiser filtre
              </button>
            )}
          </div>
          {isLoading && enriched.length === 0 ? (
            <p className="text-[11px] text-gray-400 italic py-4 text-center">Chargement…</p>
          ) : filteredList.length === 0 ? (
            <p className="text-[11px] text-gray-400 italic py-4 text-center">Aucune commande dans ce filtre.</p>
          ) : (
            <ul className="divide-y">
              {filteredList.map((e) => <OrderRow key={e.order.order_id} item={e} />)}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

// ─── Sous-composants ────────────────────────────────────────────

function TopPriority({ item, days }: { item: OrderWithAggregate; days: number }) {
  const a = item.aggregate!;
  const action = NEXT_ACTION_LABELS[a.next_action];
  const driver = a.next_action_driver?.product_name;
  const num = getOrderNumber(item.order.order_id ?? "");
  const cust = item.order.customer_name ?? "—";
  return (
    <Link
      to="/admin/cockpit"
      className="block bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-xl p-3.5 shadow-md active:scale-[0.99] transition-transform"
    >
      <div className="flex items-center gap-1.5 mb-2 opacity-90">
        <Zap className="h-3.5 w-3.5" />
        <span className="text-[10px] font-bold uppercase tracking-wider">À faire maintenant</span>
        {days >= 7 && (
          <span className="ml-auto bg-white/20 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
            {days}j d'attente
          </span>
        )}
      </div>
      <div className="text-base font-bold leading-tight">{action}</div>
      <div className="text-[12px] mt-1 opacity-95">
        {num} · {cust}
      </div>
      <div className="text-[10px] mt-1 opacity-80 italic">
        {a.next_action_why}
        {driver ? ` — déclencheur : ${driver}` : ""}
      </div>
    </Link>
  );
}

function FireTile({
  tone, icon: Icon, label, primary, secondary, active, onClick,
}: {
  tone: "red" | "amber" | "emerald" | "orange";
  icon: React.ElementType; label: string;
  primary: string; secondary: string;
  active: boolean; onClick: () => void;
}) {
  const toneClass = {
    red: "bg-red-50 border-red-200 text-red-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
    orange: "bg-orange-50 border-orange-200 text-orange-800",
  }[tone];
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl border-2 p-3 transition-all active:scale-95 ${toneClass} ${active ? "ring-2 ring-offset-1 ring-current" : ""}`}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[10px] font-bold uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-base font-bold leading-tight">{primary}</div>
      <div className="text-[10px] opacity-80 mt-0.5 leading-tight">{secondary}</div>
    </button>
  );
}

function Section({
  title, subtitle, icon: Icon, items, empty, renderLabel, accent,
}: {
  title: string; subtitle: string; icon: React.ElementType;
  items: OrderWithAggregate[]; empty: string;
  renderLabel: (e: OrderWithAggregate) => string;
  accent: "indigo" | "emerald" | "slate";
}) {
  const accentClass = {
    indigo: "bg-indigo-50 border-indigo-200 text-indigo-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    slate: "bg-slate-100 border-slate-200 text-slate-700",
  }[accent];

  return (
    <section className="bg-white rounded-xl border p-3 space-y-2">
      <div className="flex items-start gap-2">
        <div className={`shrink-0 h-7 w-7 rounded-md grid place-items-center border ${accentClass}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-bold">{title} <span className="text-gray-400 font-normal">({items.length})</span></h2>
          <p className="text-[10px] text-gray-500">{subtitle}</p>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] text-gray-400 italic py-2 text-center">{empty}</p>
      ) : (
        <ul className="divide-y">
          {items.slice(0, 8).map(e => (
            <li key={e.order.order_id}>
              <Link
                to="/admin/cockpit"
                className="py-2 flex items-start gap-2 hover:bg-gray-50 -mx-1 px-1 rounded"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-bold text-gray-800">
                    {getOrderNumber(e.order.order_id ?? "")} · {e.order.customer_name ?? "—"}
                  </div>
                  <div className="text-[10px] text-gray-500 truncate">{renderLabel(e)}</div>
                </div>
                <StalenessPill item={e} />
              </Link>
            </li>
          ))}
          {items.length > 8 && (
            <li className="pt-2 text-[10px] text-gray-400 text-center italic">
              + {items.length - 8} autre(s)…
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function OrderRow({ item }: { item: OrderWithAggregate }) {
  const a = item.aggregate;
  return (
    <li>
      <Link to="/admin/cockpit" className="py-2 flex items-start gap-2 hover:bg-gray-50 -mx-1 px-1 rounded">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold text-gray-800">
            {getOrderNumber(item.order.order_id ?? "")} · {item.order.customer_name ?? "—"}
          </div>
          <div className="text-[10px] text-gray-500 truncate">
            {a
              ? `${NEXT_ACTION_LABELS[a.next_action]} — ${a.next_action_reason}`
              : (item.isLoading ? "chargement de l'agrégateur…" : "—")}
          </div>
        </div>
        <StalenessPill item={item} />
      </Link>
    </li>
  );
}

function StalenessPill({ item }: { item: OrderWithAggregate }) {
  const s = staleness(item);
  return (
    <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${STALE_PILL[s.level]}`}>
      {s.days > 0 ? `${s.days}j` : "0j"}{s.level !== "fresh" ? ` · ${STALE_LABEL[s.level]}` : ""}
    </span>
  );
}
