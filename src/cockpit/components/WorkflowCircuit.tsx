// ═══════════════════════════════════════════════════════════════
// WorkflowCircuit — Stepper horizontal du circuit métier.
// Pure présentation : on lit le statut + le type (LOCAL / IMPORT
// poids connu / IMPORT poids inconnu) et on affiche les étapes
// avec mise en évidence forte de l'étape active.
// ═══════════════════════════════════════════════════════════════

import { Check } from "lucide-react";

type StepDef = { key: string; label: string };

const LOCAL_FLOW_STEPS: StepDef[] = [
  { key: "new", label: "Nouvelle" },
  { key: "confirmed", label: "Confirmée" },
  { key: "preparing", label: "Préparation" },
  { key: "ready", label: "Prête" },
  { key: "shipped", label: "Expédiée" },
  { key: "delivered", label: "Livrée" },
];

const IMPORT_KNOWN_STEPS: StepDef[] = [
  { key: "new", label: "Nouvelle" },
  { key: "confirmed", label: "Confirmée" },
  { key: "ordered_supplier", label: "Commandée" },
  { key: "received_warehouse", label: "Reçue ent." },
  { key: "ready_delivery", label: "Prête" },
  { key: "shipped", label: "Expédiée" },
  { key: "delivered", label: "Livrée" },
];

const IMPORT_UNKNOWN_STEPS: StepDef[] = [
  { key: "new", label: "Nouvelle" },
  { key: "confirmed", label: "Confirmée" },
  { key: "ordered_supplier", label: "Commandée" },
  { key: "received_warehouse", label: "Reçue ent." },
  { key: "awaiting_weighing", label: "Pesée" },
  { key: "fees_calculated", label: "Frais" },
  { key: "payment_fees", label: "Validée" },
  { key: "ready_delivery", label: "Prête" },
  { key: "shipped", label: "Expédiée" },
  { key: "delivered", label: "Livrée" },
];

interface Props {
  status: string;
  isImport: boolean;
  lineKind?: string | null;
}

export function WorkflowCircuit({ status, isImport, lineKind }: Props) {
  const steps = !isImport
    ? LOCAL_FLOW_STEPS
    : lineKind === "IMPORT_KNOWN_WEIGHT"
      ? IMPORT_KNOWN_STEPS
      : IMPORT_UNKNOWN_STEPS;

  const activeIdx = Math.max(
    0,
    steps.findIndex((s) => s.key === status),
  );
  const isCancelled = status === "cancelled";

  const title = !isImport
    ? "Circuit LOCAL"
    : lineKind === "IMPORT_KNOWN_WEIGHT"
      ? "Circuit IMPORT — Poids connu"
      : "Circuit IMPORT — Poids inconnu";

  return (
    <div className="rounded-lg border bg-white p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase font-bold tracking-wide text-gray-500">{title}</div>
        <div className="text-[10px] text-gray-400">{steps.length} étapes</div>
      </div>
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex items-center gap-0 min-w-max">
          {steps.map((s, i) => {
            const done = !isCancelled && i < activeIdx;
            const active = !isCancelled && i === activeIdx;
            const dotClass = active
              ? "bg-emerald-600 text-white ring-4 ring-emerald-200"
              : done
                ? "bg-emerald-500 text-white"
                : "bg-gray-100 text-gray-400 border border-gray-200";
            const labelClass = active
              ? "text-emerald-700 font-bold"
              : done
                ? "text-gray-700"
                : "text-gray-400";
            return (
              <div key={s.key} className="flex items-center">
                <div className="flex flex-col items-center gap-1 w-[58px]">
                  <div
                    className={`h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${dotClass}`}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <div className={`text-[9px] text-center leading-tight ${labelClass}`}>
                    {s.label}
                  </div>
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={`h-0.5 w-3 -mt-4 ${i < activeIdx ? "bg-emerald-500" : "bg-gray-200"}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
