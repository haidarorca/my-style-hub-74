import { useEffect, useState } from "react";
import { CheckCircle2, Circle, ChevronRight, ChevronDown, Home, Truck } from "lucide-react";
import { getNextStep } from "@/cockpit/lib/workflow";
import type { NextStep } from "@/cockpit/lib/workflow";
import type { OrderArticle } from "@/cockpit/lib/article-states";

/* ═══════════════════════════════════════════════════════════════
   WorkflowControlPanel v4 — Option B (accordéon compact)
   - Replié par défaut : ~140px ; affiche l'étape courante + action
   - Tap "Voir toutes les étapes" : déplie la timeline complète
   - Mémoire d'ouverture par commande dans localStorage
   - Le concept MIXTE a disparu : chaque sub_order a son propre
     workflow. Pour une commande multi-boutiques, le drawer ne
     rend PAS ce composant globalement — il sera rendu par sub_order.
   ═══════════════════════════════════════════════════════════════ */

interface FlowStep {
  key: string; label: string; description: string;
}

const LOCAL_STEPS: FlowStep[] = [
  { key: "new", label: "À confirmer", description: "Commande reçue" },
  { key: "confirmed", label: "Confirmée", description: "Commande confirmée" },
  { key: "preparing", label: "Préparation", description: "En préparation" },
  { key: "ready", label: "Prête", description: "Prête à expédier" },
  { key: "shipped", label: "Expédiée", description: "En cours de livraison" },
  { key: "delivered", label: "Livrée", description: "Commande livrée" },
];

const IMPORT_STEPS_V2: FlowStep[] = [
  { key: "new", label: "Nouvelle", description: "Commande reçue" },
  { key: "confirmed", label: "Confirmée", description: "Commande validée" },
  { key: "ordered_supplier", label: "Fournisseur", description: "Commandée chez le fournisseur" },
  { key: "received_warehouse", label: "Réception", description: "Reçue à l'entrepôt" },
  { key: "awaiting_weighing", label: "Pesée", description: "En attente de pesée" },
  { key: "fees_calculated", label: "Frais", description: "Frais calculés" },
  { key: "payment_fees", label: "Paiement", description: "Attente paiement client" },
  { key: "ready_delivery", label: "Prête", description: "Prête à expédier" },
  { key: "shipped", label: "Expédiée", description: "En cours de livraison" },
  { key: "delivered", label: "Livrée", description: "Commande livrée" },
];

// Circuit B — poids déclaré : vérification interne, pas de paiement client supplémentaire.
const IMPORT_STEPS_DECLARED: FlowStep[] = [
  { key: "new", label: "Nouvelle", description: "Commande reçue" },
  { key: "confirmed", label: "Confirmée", description: "Commande validée" },
  { key: "ordered_supplier", label: "Fournisseur", description: "Commandée chez le fournisseur" },
  { key: "received_warehouse", label: "Vérif. interne", description: "Reçue — poids vérifié par l'agent" },
  { key: "ready_delivery", label: "Prête", description: "Prête à expédier" },
  { key: "shipped", label: "Expédiée", description: "En cours de livraison" },
  { key: "delivered", label: "Livrée", description: "Commande livrée" },
];

interface Props {
  orderId?: string;
  status: string;
  isImport: boolean;
  isLocal: boolean;
  articles?: OrderArticle[];
  onStatusChange: (status: string) => void;
}

function getStepState(stepKey: string, currentStatus: string, allKeys: string[]): "done" | "active" | "future" {
  const curIdx = allKeys.indexOf(currentStatus);
  const stepIdx = allKeys.indexOf(stepKey);
  if (curIdx === -1) return stepKey === currentStatus ? "active" : "future";
  if (stepIdx < curIdx) return "done";
  if (stepIdx === curIdx) return "active";
  return "future";
}

/* ─── Accordéon individuel (Option B) ─── */
function CircuitAccordion({
  storageKey, defaultOpen, steps, currentStatus, isImportFlow,
  title, icon: Icon, headerColor, headerBadge, action, onStatusChange,
}: {
  storageKey: string;
  defaultOpen: boolean;
  steps: FlowStep[];
  currentStatus: string;
  isImportFlow: boolean;
  title: string;
  icon: React.ElementType;
  headerColor: string;
  headerBadge?: string;
  action: NextStep | null;
  onStatusChange: (s: string) => void;
}) {
  const allKeys = steps.map(s => s.key);
  const curIdx = allKeys.indexOf(currentStatus);
  const activeStep = curIdx >= 0 ? steps[curIdx] : steps[0];
  const totalSteps = steps.length;
  const stepNumber = Math.max(1, curIdx + 1);
  const progressPct = Math.round((stepNumber / totalSteps) * 100);

  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return defaultOpen;
    const v = window.localStorage.getItem(storageKey);
    if (v === "1") return true;
    if (v === "0") return false;
    return defaultOpen;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, open ? "1" : "0");
  }, [open, storageKey]);

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
      {/* Header compact + état actuel */}
      <div className={`px-3 py-2 ${headerColor} flex items-center gap-2`}>
        <Icon className="h-4 w-4" />
        <span className="text-xs font-bold flex-1 truncate">{title}</span>
        <span className="text-[10px] opacity-90">{headerBadge ?? `Étape ${stepNumber}/${totalSteps}`}</span>
      </div>

      {/* Barre de progression */}
      <div className="h-1.5 bg-gray-100">
        <div className="h-full bg-orange-500 transition-all" style={{ width: `${progressPct}%` }} />
      </div>

      {/* Étape courante */}
      <div className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <div className="h-6 w-6 rounded-full bg-orange-500 border-2 border-white shadow grid place-items-center shrink-0">
            <div className="h-2 w-2 rounded-full bg-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-orange-700">{activeStep?.label}</span>
              <span className="text-[9px] font-bold text-orange-600 uppercase">En cours</span>
            </div>
            <p className="text-[11px] text-gray-500">{activeStep?.description}</p>
          </div>
        </div>

        {action && (
          <button
            onClick={() => onStatusChange(action.status)}
            className={`w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold text-white ${action.color} hover:opacity-90 active:scale-[0.98] transition-all shadow-sm min-h-[44px]`}
          >
            {action.actionLabel}
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 py-1.5"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          {open ? "Masquer les étapes" : "Voir toutes les étapes"}
        </button>

        {/* Timeline complète dépliable */}
        {open && (
          <div className="pt-2 border-t border-gray-100 space-y-1">
            {steps.map((step, idx) => {
              const state = getStepState(step.key, currentStatus, allKeys);
              const isLast = idx === steps.length - 1;
              return (
                <div key={step.key} className="flex items-start gap-2">
                  <div className="flex flex-col items-center shrink-0">
                    {state === "done" && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                    {state === "active" && (
                      <div className="h-4 w-4 rounded-full bg-orange-500 border-2 border-white shadow grid place-items-center">
                        <div className="h-1.5 w-1.5 rounded-full bg-white" />
                      </div>
                    )}
                    {state === "future" && <Circle className="h-4 w-4 text-gray-300" />}
                    {!isLast && <div className={`w-0.5 h-4 ${state === "done" ? "bg-emerald-300" : "bg-gray-200"}`} />}
                  </div>
                  <div className={`flex-1 pb-1.5 ${state === "future" ? "opacity-50" : ""}`}>
                    <div className={`text-[11px] font-semibold ${state === "active" ? "text-orange-700" : state === "done" ? "text-emerald-700" : "text-gray-600"}`}>
                      {step.label}
                    </div>
                    <p className="text-[10px] text-gray-500">{step.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function WorkflowControlPanel({ orderId, status, isImport, isLocal, onStatusChange }: Props) {
  const s = status ?? "new";
  const keyBase = `cockpit:circuit-open:${orderId ?? "_"}`;

  if (isLocal) {
    return (
      <CircuitAccordion
        storageKey={`${keyBase}:local`}
        defaultOpen={false}
        steps={LOCAL_STEPS}
        currentStatus={s}
        isImportFlow={false}
        title="Circuit LOCAL"
        icon={Home}
        headerColor="bg-emerald-100 text-emerald-700"
        action={getNextStep(s, false)}
        onStatusChange={onStatusChange}
      />
    );
  }

  return (
    <CircuitAccordion
      storageKey={`${keyBase}:import`}
      defaultOpen={false}
      steps={IMPORT_STEPS_V2}
      currentStatus={s}
      isImportFlow={true}
      title="Circuit IMPORT"
      icon={Truck}
      headerColor="bg-indigo-100 text-indigo-700"
      action={getNextStep(s, true)}
      onStatusChange={onStatusChange}
    />
  );
}
