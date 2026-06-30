// ═══════════════════════════════════════════════════════════════
// CLÔTURE DU JOUR — Le tableau de bord du soir
// 1 écran, 10 réponses. Le reste de l'ERP sert à creuser.
// ═══════════════════════════════════════════════════════════════

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getDailyClose } from "@/lib/daily-close.functions";
import { payAllOutstandingForVendor } from "@/lib/commission-payments.functions";
import {
  TrendingUp, TrendingDown, ArrowDownCircle, ArrowUpCircle,
  Wallet, Users, AlertTriangle, ShieldAlert, Lock, Calendar, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFormatDisplay } from "@/hooks/use-currencies";

export default function DailyClose() {
  const fmt = useFormatDisplay();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const fn = useServerFn(getDailyClose);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["daily-close", date],
    queryFn: () => fn({ data: { date } }),
    staleTime: 30_000,
  });
  const payFn = useServerFn(payAllOutstandingForVendor);
  const payMut = useMutation({
    mutationFn: (vendor_id: string) => payFn({ data: { vendor_id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["daily-close"] }),
  });

  return (
    <div className="max-w-[1400px] mx-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clôture du jour</h1>
          <p className="text-sm text-slate-600">
            Tout ce qu'il faut savoir pour fermer la journée — périmètre Kawzone.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white border rounded-lg px-3 py-1.5">
          <Calendar className="w-4 h-4 text-slate-500" />
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="text-sm bg-transparent outline-none"
          />
        </div>
      </div>

      {isLoading && <div className="text-slate-500">Chargement…</div>}

      {data && (
        <>
          {/* Bandeau 4 chiffres clés */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi
              label="Chiffre d'affaires"
              value={fmt(data.revenue_today)}
              hint={`${data.orders_today} commande${data.orders_today > 1 ? "s" : ""}`}
              icon={TrendingUp}
              tone="blue"
            />
            <Kpi
              label="Encaissé"
              value={fmt(data.cash_in_today)}
              icon={ArrowDownCircle}
              tone="emerald"
            />
            <Kpi
              label="Sorties"
              value={fmt(data.cash_out_today)}
              icon={ArrowUpCircle}
              tone="red"
            />
            <Kpi
              label="Bénéfice estimé"
              value={fmt(data.estimated_profit_today)}
              icon={data.estimated_profit_today >= 0 ? TrendingUp : TrendingDown}
              tone={data.estimated_profit_today >= 0 ? "emerald" : "red"}
            />
          </div>

          {/* Engagements ouverts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <Card
              title="Remboursements à effectuer"
              total={fmt(data.refunds_due_total)}
              count={data.refunds_due.length}
              tone="orange"
              icon={Wallet}
              link="/admin/cockpit/daily"
            >
              {data.refunds_due.length === 0 ? (
                <Empty text="Aucun remboursement en attente." />
              ) : (
                <ul className="divide-y">
                  {data.refunds_due.slice(0, 8).map((r) => (
                    <li key={r.order_id} className="py-2 flex items-center justify-between text-sm">
                      <span className="truncate">{r.client_name ?? "Client"}</span>
                      <span className="font-semibold text-orange-700 whitespace-nowrap ml-2">
                        {fmt(r.amount_to_refund + r.amount_to_credit)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card
              title="Vendeurs à payer"
              total={fmt(data.vendors_to_pay_total)}
              count={data.vendors_to_pay.length}
              tone="blue"
              icon={Users}
              link="/admin/cockpit/daily"
            >
              {data.vendors_to_pay.length === 0 ? (
                <Empty text="Aucun vendeur en attente de paiement." />
              ) : (
                <ul className="divide-y">
                  {data.vendors_to_pay.slice(0, 8).map((v) => (
                    <li key={v.vendor_id} className="py-2 flex items-center justify-between text-sm gap-2">
                      <span className="truncate flex-1">
                        {v.vendor_name ?? v.vendor_id.slice(0, 8)}
                        <span className="text-xs text-slate-500 ml-1">· {v.orders_count}</span>
                      </span>
                      <span className="font-semibold text-blue-700 whitespace-nowrap">
                        {fmt(v.amount)}
                      </span>
                      <button
                        type="button"
                        disabled={payMut.isPending}
                        onClick={(e) => { e.preventDefault(); payMut.mutate(v.vendor_id); }}
                        className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 flex items-center gap-1"
                        title="Marquer toutes les commissions de ce vendeur comme payées"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Payer
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card
              title="Clients qui doivent"
              total={fmt(data.clients_owe_total)}
              count={data.clients_owe.length}
              tone="purple"
              icon={Users}
              link="/admin/cockpit/daily"
              totalLabel="Compléments attendus (remplacement)"
            >
              {data.clients_owe.length === 0 ? (
                <Empty text="Aucun complément en attente." />
              ) : (
                <ul className="divide-y">
                  {data.clients_owe.slice(0, 6).map((c) => (
                    <li key={c.order_id} className="py-2 flex items-center justify-between text-sm gap-2">
                      <span className="truncate">{c.client_name ?? "Client"}</span>
                      <span className="font-semibold text-purple-700 whitespace-nowrap ml-2">
                        {fmt(c.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* SAV + risques + bloqués */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <Card
              title="SAV ouverts"
              total={fmt(data.sav_open_total_impact)}
              count={data.sav_open_count}
              tone="amber"
              icon={AlertTriangle}
              link="/admin/returns"
              totalLabel="Impact financier total"
            >
              <p className="text-xs text-slate-500 mt-1">
                Voir le détail dans le Centre Retours & Annulations.
              </p>
            </Card>

            <Card
              title="Dossiers bloqués"
              total={`${data.blocked_cases.length}`}
              count={data.blocked_cases.length}
              tone="red"
              icon={Lock}
              link="/admin/returns"
              totalLabel="Nécessitent une action"
            >
              {data.blocked_cases.length === 0 ? (
                <Empty text="Aucun dossier bloqué." />
              ) : (
                <ul className="divide-y">
                  {data.blocked_cases.slice(0, 6).map((b) => (
                    <li key={b.id} className="py-2 flex items-center justify-between text-sm gap-2">
                      <span className="truncate">{b.title}</span>
                      <span className="text-xs text-red-700 whitespace-nowrap">
                        {b.age_days}j · {fmt(b.impact_amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card
              title="Risques financiers"
              total={`${data.financial_risks.length}`}
              count={data.financial_risks.length}
              tone="red"
              icon={ShieldAlert}
              link="/admin/returns"
              totalLabel="À surveiller"
            >
              {data.financial_risks.length === 0 ? (
                <Empty text="Aucun risque identifié." />
              ) : (
                <ul className="divide-y">
                  {data.financial_risks.slice(0, 6).map((r) => (
                    <li key={r.id} className="py-2 flex items-start justify-between text-sm gap-2">
                      <div className="truncate">
                        <div className="truncate">{r.title}</div>
                        <div className="text-xs text-slate-500">
                          {r.owner_party} · {r.age_days}j
                          {r.reason === "amount" ? " · montant élevé" : " · dossier ancien"}
                        </div>
                      </div>
                      <span className="text-xs text-red-700 font-semibold whitespace-nowrap">
                        {fmt(r.impact_amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="text-xs text-slate-400 text-right">
            Généré le {new Date(data.generated_at).toLocaleString("fr-FR")}
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({
  label, value, hint, icon: Icon, tone,
}: { label: string; value: string; hint?: string; icon: any; tone: "blue" | "emerald" | "red" | "amber" }) {
  const toneMap = {
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    red: "bg-red-50 text-red-700 border-red-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
  } as const;
  return (
    <div className={cn("p-4 rounded-lg border bg-white")}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
        <span className={cn("p-1.5 rounded", toneMap[tone])}>
          <Icon className="w-4 h-4" />
        </span>
      </div>
      <div className="text-xl font-bold text-slate-900">{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}

function Card({
  title, total, totalLabel, count, tone, icon: Icon, link, children,
}: {
  title: string; total: string; totalLabel?: string; count: number;
  tone: "blue" | "orange" | "amber" | "red" | "purple"; icon: any; link: string;
  children: React.ReactNode;
}) {
  const toneMap = {
    blue: "border-blue-200 bg-blue-50/30",
    orange: "border-orange-200 bg-orange-50/30",
    amber: "border-amber-200 bg-amber-50/30",
    red: "border-red-200 bg-red-50/30",
    purple: "border-purple-200 bg-purple-50/30",
  } as const;
  return (
    <div className={cn("rounded-lg border bg-white", toneMap[tone])}>
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-slate-700" />
          <h3 className="font-semibold text-slate-900 text-sm">{title}</h3>
        </div>
        <Link to={link as any} className="text-xs text-blue-600 hover:underline">
          Ouvrir →
        </Link>
      </div>
      <div className="p-3">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-lg font-bold text-slate-900">{total}</span>
          <span className="text-xs text-slate-500">
            {totalLabel ?? `${count} dossier${count > 1 ? "s" : ""}`}
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-sm text-slate-400 italic py-2">{text}</div>;
}
