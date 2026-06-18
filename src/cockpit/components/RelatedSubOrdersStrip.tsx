// ═══════════════════════════════════════════════════════════════
// RelatedSubOrdersStrip — Chips de navigation entre sous-commandes
// sœurs d'une même commande mère. Indexé par sub_order_key.
// ═══════════════════════════════════════════════════════════════

import { Store, ArrowRight, Package } from "lucide-react";
import { LINE_KIND_SHORT, type LineKind } from "@/lib/line-kind";

interface Sibling {
  sub_order_key: string;
  vendor_id: string;
  vendor_name: string;
  line_kind: LineKind;
  index: number;
  total: number;
  label: string;
}

interface Props {
  siblings: Sibling[];
  currentKey: string;
  onSelect: (subOrderKey: string) => void;
}

export function RelatedSubOrdersStrip({ siblings, currentKey, onSelect }: Props) {
  if (siblings.length <= 1) return null;
  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2.5 space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-900 uppercase tracking-wide">
        <ArrowRight className="h-3 w-3" />
        Sous-commandes liées ({siblings.length})
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {siblings.map(s => {
          const active = s.sub_order_key === currentKey;
          return (
            <button
              key={s.sub_order_key}
              onClick={() => !active && onSelect(s.sub_order_key)}
              disabled={active}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border transition-all ${
                active
                  ? "bg-indigo-600 text-white border-indigo-600 cursor-default"
                  : "bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-100"
              }`}
              title={`${s.vendor_name} · ${LINE_KIND_SHORT[s.line_kind]}`}
            >
              <Store className="h-2.5 w-2.5" />
              <span className="font-mono font-bold">{s.index}/{s.total}</span>
              <span className="truncate max-w-[100px]">{s.vendor_name}</span>
              <span className="inline-flex items-center gap-0.5 opacity-80">
                <Package className="h-2.5 w-2.5" />
                {LINE_KIND_SHORT[s.line_kind]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
