// ═══════════════════════════════════════════════════════════════
// CurrentStepBlock — Affiche l'étape actuelle + l'action attendue.
// Pure présentation, lit `status` + `nextStep`.
// ═══════════════════════════════════════════════════════════════

import { ArrowRight } from "lucide-react";
import { getStatusLabel } from "@/cockpit/lib/workflow";
import type { NextStep } from "@/cockpit/lib/workflow";

interface Props {
  status: string;
  nextStep: NextStep | null;
}

export function CurrentStepBlock({ status, nextStep }: Props) {
  const stepLabel = getStatusLabel(status);
  const expected = nextStep?.actionLabel ?? "Aucune action en attente";
  return (
    <div className="rounded-lg border-l-4 border-emerald-500 bg-emerald-50/60 p-3 space-y-1.5">
      <div className="text-[10px] uppercase font-bold text-emerald-700 tracking-wide">
        Étape actuelle
      </div>
      <div className="text-base font-bold text-gray-900 leading-tight">{stepLabel}</div>
      <div className="flex items-center gap-1.5 pt-1 text-sm text-emerald-800">
        <ArrowRight className="h-3.5 w-3.5" />
        <span className="font-semibold">Action attendue :</span>
        <span>{expected}</span>
      </div>
    </div>
  );
}
