// ═══════════════════════════════════════════════════════════════
// COCKPIT SHELL — Coquille unifiée des 4 zones
//
// Affiche une barre "Pulse système" persistante en haut de chaque
// zone (Cockpit, SAV, Finance, Archive) avec :
//   - Onglets de navigation entre les 4 zones
//   - KPIs cross-zones cliquables (chacun mène à la bonne zone)
//
// Objectif : que l'utilisateur perçoive un seul ERP, pas 4 écrans.
// ═══════════════════════════════════════════════════════════════

import { Link, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getSystemPulse } from "@/lib/cockpit-pulse.functions";
import {
  LayoutDashboard, AlertTriangle,
  Activity, Clock, TrendingUp, TrendingDown, CalendarCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

function fmt(n: number, currency = "XOF") {
  if (!n) return "0";
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${n.toLocaleString("fr-FR")} ${currency}`;
  }
}

type Tab = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
const TABS: Tab[] = [
  { to: "/admin/cockpit/daily", label: "Clôture du jour", icon: CalendarCheck },
  { to: "/admin/cockpit", label: "Cockpit", icon: LayoutDashboard, exact: true },
  { to: "/admin/returns", label: "Retours & Annulations", icon: AlertTriangle },
];


export function CockpitShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pulseFn = useServerFn(getSystemPulse);
  const { data: pulse } = useQuery({
    queryKey: ["system-pulse"],
    queryFn: () => pulseFn(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });


  return (
    <div className="min-h-screen bg-slate-50">
      {/* Barre Pulse système */}
      <div className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-4 py-2">
          {/* Onglets zones */}
          <div className="flex items-center gap-1 mb-2 overflow-x-auto">
            <div className="flex items-center gap-1.5 mr-3 text-sm font-semibold text-slate-700">
              <Activity className="w-4 h-4 text-blue-600" />
              <span>Kawzone ERP</span>
            </div>
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = t.exact
                ? pathname === t.to || pathname === `${t.to}/`
                : pathname.startsWith(t.to);
              return (
                <Link
                  key={t.to}
                  to={t.to as any}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
                    active
                      ? "bg-blue-600 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </Link>
              );
            })}
          </div>

          {/* KPI cross-zones */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <Link
              to="/admin/cockpit"
              className="flex items-center justify-between p-2 rounded border bg-slate-50 hover:bg-slate-100 transition"
            >
              <span className="text-slate-600">Commandes actives</span>
              <span className="font-bold text-slate-900">{pulse?.active_orders ?? "—"}</span>
            </Link>

            <Link
              to="/admin/cockpit/sav"
              className={cn(
                "flex items-center justify-between p-2 rounded border transition",
                (pulse?.sav_open ?? 0) > 0
                  ? "bg-amber-50 hover:bg-amber-100 border-amber-200"
                  : "bg-slate-50 hover:bg-slate-100"
              )}
            >
              <span className="text-slate-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                SAV ouverts
              </span>
              <span className="font-bold">
                {pulse?.sav_open ?? "—"}
                {(pulse?.sav_oldest_days ?? 0) > 0 && (
                  <span className="text-amber-700 ml-1">
                    <Clock className="w-3 h-3 inline" /> {pulse?.sav_oldest_days}j
                  </span>
                )}
              </span>
            </Link>

            <Link
              to="/admin/cockpit/daily"
              className="flex items-center justify-between p-2 rounded border bg-slate-50 hover:bg-slate-100 transition"
            >
              <span className="text-slate-600 flex items-center gap-1">
                {(pulse?.net_today ?? 0) >= 0 ? (
                  <TrendingUp className="w-3 h-3 text-emerald-600" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-red-600" />
                )}
                Net du jour
              </span>
              <span
                className={cn(
                  "font-bold",
                  (pulse?.net_today ?? 0) >= 0 ? "text-emerald-700" : "text-red-700"
                )}
              >
                {fmt(pulse?.net_today ?? 0)}
              </span>
            </Link>
          </div>
        </div>
      </div>

      {/* Contenu de la zone */}
      <div>{children}</div>
    </div>
  );
}
