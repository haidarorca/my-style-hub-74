// ═══════════════════════════════════════════════════════════════
// SubOrderStatusBadge — Badge statut principal très visible.
// Présentation uniquement, aucune logique métier.
// ═══════════════════════════════════════════════════════════════

import { getStatusBadge } from "@/cockpit/lib/sub-order-actions";

interface Props {
  status: string;
  subLabel?: string | null;
}

export function SubOrderStatusBadge({ status, subLabel }: Props) {
  const b = getStatusBadge(status);
  return (
    <div className={`rounded-lg border-2 px-3 py-2.5 flex items-center gap-3 ${b.className}`}>
      <div className="text-2xl leading-none">{b.emoji}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase font-semibold opacity-70 tracking-wide">Statut métier</div>
        <div className="text-base font-bold leading-tight truncate">{b.label}</div>
        {subLabel && <div className="text-[11px] opacity-75 truncate">{subLabel}</div>}
      </div>
    </div>
  );
}
