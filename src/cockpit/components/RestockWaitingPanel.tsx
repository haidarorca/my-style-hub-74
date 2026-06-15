import { Clock, RefreshCw, AlertTriangle, Package, Store } from "lucide-react";
import {
  isWaitingRestock, getRestockWaitDays, getRestockAlertLevel,
  getResumeTargetStatus,
  ARTICLE_STATUS_LABELS, LOCAL_STATUS_LABELS, IMPORT_STATUS_LABELS,
} from "@/cockpit/lib/article-states";
import type { OrderArticle, RestockAlertLevel } from "@/cockpit/lib/article-states";

/* ═══════════════════════════════════════════════════════════════
   RestockWaitingPanel — sous-processus "en attente de réappro"
   Articles sortis temporairement du workflow principal.
   ═══════════════════════════════════════════════════════════════ */

interface Props {
  articles: OrderArticle[] | undefined;
  orderStatus?: string;
  onResumeRestock?: (productId: string) => void;
}

const LEVEL: Record<RestockAlertLevel, { badge: string; border: string; bg: string; label: string }> = {
  ok:       { badge: "bg-slate-200 text-slate-700",     border: "border-slate-300", bg: "bg-slate-50",    label: "" },
  orange:   { badge: "bg-orange-200 text-orange-800",   border: "border-orange-400",bg: "bg-orange-50",   label: "Alerte 7 jours" },
  red:      { badge: "bg-red-200 text-red-800",         border: "border-red-400",   bg: "bg-red-50",      label: "Alerte 14 jours" },
  critical: { badge: "bg-red-700 text-white",           border: "border-red-700",   bg: "bg-red-100",     label: "Critique 30+ jours" },
};

function formatTarget(art: OrderArticle): string {
  const t = getResumeTargetStatus(art);
  const map = art.is_import ? IMPORT_STATUS_LABELS : LOCAL_STATUS_LABELS;
  return map[t] ?? ARTICLE_STATUS_LABELS[t];
}

export function RestockWaitingPanel({ articles, orderStatus, onResumeRestock }: Props) {
  const waiting = (articles ?? []).filter(isWaitingRestock);
  if (waiting.length === 0) return null;

  const locked = orderStatus === "delivered" || orderStatus === "cancelled";

  return (
    <div className="border-2 border-slate-300 bg-slate-50 rounded-xl overflow-hidden">
      <div className="px-3 py-2 bg-slate-700 text-white flex items-center gap-2">
        <Clock className="h-4 w-4" />
        <div className="flex-1">
          <div className="text-xs font-bold uppercase tracking-wide">
            Articles en attente de réapprovisionnement
          </div>
          <div className="text-[10px] text-slate-200">
            {waiting.length} article{waiting.length > 1 ? "s" : ""} hors du workflow normal · n'empêche pas d'expédier les autres
          </div>
        </div>
      </div>

      <div className="divide-y divide-slate-200">
        {waiting.map(art => {
          const sb = art.stock_break!;
          const days = getRestockWaitDays(art);
          const level = getRestockAlertLevel(days);
          const L = LEVEL[level];
          const startDate = new Date(sb.created_at);
          return (
            <div key={art.product_id} className={`p-3 ${L.bg}`}>
              <div className="flex items-start gap-2.5">
                <div className="shrink-0 w-10 h-10 bg-white rounded-lg overflow-hidden border border-slate-200">
                  {art.product_image
                    ? <img src={art.product_image} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full grid place-items-center text-slate-300"><Package className="h-4 w-4" /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate">{art.product_name}</div>
                  {art.variant_label && <div className="text-[10px] text-slate-500">{art.variant_label}</div>}
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="text-[10px] text-slate-600">x{art.quantity}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${L.badge}`}>
                      {days === 0 ? "Aujourd'hui" : `${days} j`}
                    </span>
                    {level !== "ok" && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${L.badge} inline-flex items-center gap-0.5`}>
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {L.label}
                      </span>
                    )}
                  </div>

                  <div className="mt-1.5 space-y-0.5 text-[10px] text-slate-600">
                    <div>Depuis le {startDate.toLocaleDateString("fr-FR")} · Motif : <span className="italic">{sb.reason}</span></div>
                    {art.vendor_name && (
                      <div className="inline-flex items-center gap-1">
                        <Store className="h-2.5 w-2.5" />
                        {art.is_import ? "Fournisseur" : "Vendeur"} : <strong>{art.vendor_name}</strong>
                      </div>
                    )}
                    <div className="text-slate-500">
                      Reprise prévue au statut : <strong>{formatTarget(art)}</strong>
                      {sb.last_valid_status && sb.last_valid_status === getResumeTargetStatus(art) && (
                        <span className="text-emerald-700"> (mémorisé)</span>
                      )}
                    </div>
                  </div>

                  {onResumeRestock && !locked && (
                    <button
                      onClick={() => onResumeRestock(art.product_id)}
                      className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 text-white text-[11px] font-bold hover:bg-teal-700 min-h-[36px]"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Stock revenu — reprendre le flux
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
