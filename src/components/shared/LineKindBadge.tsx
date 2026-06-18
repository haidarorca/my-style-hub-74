// ═══════════════════════════════════════════════════════════════
// LineKindBadge — Badge visuel partagé Cart / Cockpit / Drawer.
// Distingue LOCAL · Import poids déclaré · Import poids inconnu.
// ═══════════════════════════════════════════════════════════════

import { Store, PackageCheck, Scale } from "lucide-react";
import { LINE_KIND_BADGE, LINE_KIND_LABELS, LINE_KIND_SHORT, type LineKind } from "@/lib/line-kind";

interface Props {
  kind: LineKind;
  compact?: boolean;
}

export function LineKindBadge({ kind, compact = false }: Props) {
  const Icon = kind === "LOCAL" ? Store : kind === "IMPORT_KNOWN_WEIGHT" ? PackageCheck : Scale;
  const size = compact ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1";
  const iconSize = compact ? "h-3 w-3" : "h-3.5 w-3.5";
  const label = compact ? LINE_KIND_SHORT[kind] : LINE_KIND_LABELS[kind];
  return (
    <span
      title={LINE_KIND_LABELS[kind]}
      className={`${size} font-semibold rounded border inline-flex items-center gap-1 ${LINE_KIND_BADGE[kind]}`}
    >
      <Icon className={iconSize} />
      {label}
    </span>
  );
}
