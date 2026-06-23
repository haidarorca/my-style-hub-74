// ═══════════════════════════════════════════════════════════════
// SubOrderActionBar — Barre d'actions contextuelles selon le statut.
//
// 100 % présentation. Chaque action déclenche soit :
//   - un changement d'onglet (props.onOpenTab)
//   - un callback déjà câblé dans OrderDrawer (advance, cancel, viewItems)
//
// Aucun appel direct au backend ici.
// ═══════════════════════════════════════════════════════════════

import { getSubOrderActions, type SubOrderAction, type SubOrderActionTab } from "@/cockpit/lib/sub-order-actions";

interface Props {
  status: string;
  lineKind?: string | null;
  onOpenTab: (tab: SubOrderActionTab) => void;
  onAdvance?: () => void;
  onCancel?: () => void;
  onViewItems?: () => void;
  canAdvance?: boolean;
  canCancel?: boolean;
}

function toneClass(tone?: SubOrderAction["tone"]) {
  switch (tone) {
    case "primary": return "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100";
    case "danger":  return "border-red-200 bg-red-50 text-red-700 hover:bg-red-100";
    case "warning": return "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100";
    case "success": return "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100";
    default:        return "border-gray-200 bg-white text-gray-700 hover:bg-gray-50";
  }
}

export function SubOrderActionBar({
  status, lineKind, onOpenTab, onAdvance, onCancel, onViewItems,
  canAdvance = true, canCancel = true,
}: Props) {
  const actions = getSubOrderActions(status, lineKind);

  const handle = (a: SubOrderAction) => {
    if (a.fire === "advance") return onAdvance?.();
    if (a.fire === "cancel") return onCancel?.();
    if (a.fire === "viewItems") return onViewItems?.();
    if (a.tab) return onOpenTab(a.tab);
  };

  const isDisabled = (a: SubOrderAction) =>
    (a.fire === "advance" && !canAdvance) ||
    (a.fire === "cancel" && !canCancel);

  return (
    <div>
      <div className="text-[10px] uppercase font-semibold text-gray-500 mb-1.5 tracking-wide">Actions disponibles</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {actions.map((a) => {
          const Icon = a.icon;
          const disabled = isDisabled(a);
          return (
            <button
              key={a.id}
              disabled={disabled}
              onClick={() => handle(a)}
              className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${toneClass(a.tone)}`}
            >
              <Icon className="h-4 w-4" />
              <span className="text-center leading-tight">{a.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
