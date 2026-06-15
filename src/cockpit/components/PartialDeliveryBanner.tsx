import { PackageCheck, Clock } from "lucide-react";
import { getPartialDeliveryStatus } from "@/cockpit/lib/article-states";
import type { OrderArticle } from "@/cockpit/lib/article-states";

/* ═══════════════════════════════════════════════════════════════
   PartialDeliveryBanner — résumé visible sans ouvrir les détails
   ═══════════════════════════════════════════════════════════════ */

interface Props {
  articles: OrderArticle[] | undefined;
}

export function PartialDeliveryBanner({ articles }: Props) {
  const s = getPartialDeliveryStatus(articles);
  if (!s.active) return null;
  return (
    <div className="border-2 border-teal-300 bg-teal-50 rounded-xl p-3 flex items-start gap-3">
      <div className="shrink-0 h-10 w-10 rounded-full bg-teal-500 text-white grid place-items-center">
        <PackageCheck className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-teal-900">Livraison partielle en cours</div>
        <div className="text-[12px] text-teal-800 mt-0.5">
          ✅ {s.deliveredCount} article{s.deliveredCount > 1 ? "s" : ""} livré{s.deliveredCount > 1 ? "s" : ""}
          {" · "}
          ⏳ {s.pendingCount} en attente
          {s.waitingRestock > 0 && (
            <span className="ml-1 inline-flex items-center gap-1 text-amber-800">
              <Clock className="h-3 w-3" /> dont {s.waitingRestock} en réappro
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
