import { CheckCircle2, Circle, ChevronRight, Home, Truck, Layers } from "lucide-react";
import { getNextStep, getImportStepIndex, IMPORT_STEPS } from "@/cockpit/lib/workflow";
import type { NextStep } from "@/cockpit/lib/workflow";
import type { OrderArticle } from "@/cockpit/lib/article-states";

/* ═══════════════════════════════════════════════════════════════
   WORKFLOW CONTROL PANEL — Centre de contrôle du circuit
   ═══════════════════════════════════════════════════════════════ */

interface FlowStep {
  key: string;
  label: string;
  description: string;
  color: string;
  bgColor: string;
}

/** Circuit LOCAL complet */
const LOCAL_STEPS: FlowStep[] = [
  { key: "new", label: "Nouvelle", description: "Commande reçue", color: "text-purple-700", bgColor: "bg-purple-100" },
  { key: "contacted", label: "Confirmée", description: "Client contacté", color: "text-blue-700", bgColor: "bg-blue-100" },
  { key: "confirmed", label: "Préparation", description: "Préparation en cours", color: "text-orange-700", bgColor: "bg-orange-100" },
  { key: "preparing", label: "Prête", description: "Prête à livrer", color: "text-cyan-700", bgColor: "bg-cyan-100" },
  { key: "ready", label: "Expédiée", description: "En cours de livraison", color: "text-indigo-700", bgColor: "bg-indigo-100" },
  { key: "shipped", label: "Livrée", description: "Commande livrée", color: "text-emerald-700", bgColor: "bg-emerald-100" },
];

/** Circuit IMPORT complet */
const IMPORT_STEPS_V2: FlowStep[] = [
  { key: "new", label: "Nouvelle", description: "Commande reçue", color: "text-purple-700", bgColor: "bg-purple-100" },
  { key: "confirmed", label: "Confirmée", description: "Commande validée", color: "text-emerald-700", bgColor: "bg-emerald-100" },
  { key: "ordered_supplier", label: "Fournisseur", description: "Commandée chez le fournisseur", color: "text-cyan-700", bgColor: "bg-cyan-100" },
  { key: "received_warehouse", label: "Réception", description: "Reçue à l'entrepôt", color: "text-teal-700", bgColor: "bg-teal-100" },
  { key: "awaiting_weighing", label: "Pesée", description: "En attente de pesée", color: "text-orange-700", bgColor: "bg-orange-100" },
  { key: "fees_calculated", label: "Frais", description: "Frais calculés", color: "text-pink-700", bgColor: "bg-pink-100" },
  { key: "payment_fees", label: "Paiement", description: "Attente paiement client", color: "text-amber-700", bgColor: "bg-amber-100" },
  { key: "ready_delivery", label: "Prête", description: "Prête à expédier", color: "text-indigo-700", bgColor: "bg-indigo-100" },
  { key: "shipped", label: "Expédiée", description: "En cours de livraison", color: "text-blue-700", bgColor: "bg-blue-100" },
  { key: "delivered", label: "Livrée", description: "Commande livrée", color: "text-emerald-700", bgColor: "bg-emerald-100" },
];

interface Props {
  status: string;
  isImport: boolean;
  isLocal: boolean;
  isMixte: boolean;
  articles?: OrderArticle[];
  onStatusChange: (status: string) => void;
}

/** Détermine si une étape est complétée, active ou future */
function getStepState(stepKey: string, currentStatus: string, isImportFlow: boolean): "done" | "active" | "future" {
  const allSteps = isImportFlow ? IMPORT_STEPS_V2.map(s => s.key) : LOCAL_STEPS.map(s => s.key);
  const currentIdx = allSteps.indexOf(currentStatus);
  const stepIdx = allSteps.indexOf(stepKey);

  if (currentIdx === -1) {
    // Statut inconnu — tout est future sauf si le statut correspond
    return stepKey === currentStatus ? "active" : "future";
  }
  if (stepIdx < currentIdx) return "done";
  if (stepIdx === currentIdx) return "active";
  return "future";
}

/** Récupère l'action disponible pour l'étape actuelle */
function getActiveAction(currentStatus: string, isImportFlow: boolean): NextStep | null {
  return getNextStep(currentStatus, isImportFlow);
}

/* ─── Timeline visuelle d'un circuit ─── */
function CircuitTimeline({
  steps,
  currentStatus,
  isImportFlow,
  onStatusChange,
  activeAction,
  title,
  icon: Icon,
  headerColor,
}: {
  steps: FlowStep[];
  currentStatus: string;
  isImportFlow: boolean;
  onStatusChange: (s: string) => void;
  activeAction: NextStep | null;
  title: string;
  icon: React.ElementType;
  headerColor: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className={`px-3 py-2 ${headerColor} flex items-center gap-2`}>
        <Icon className="h-4 w-4" />
        <span className="text-xs font-bold">{title}</span>
        <span className="text-[10px] opacity-70 ml-auto">{steps.length} étapes</span>
      </div>

      {/* Timeline */}
      <div className="p-3 space-y-1">
        {steps.map((step, idx) => {
          const state = getStepState(step.key, currentStatus, isImportFlow);
          const isLast = idx === steps.length - 1;

          return (
            <div key={step.key} className="flex items-start gap-2">
              {/* Ligne verticale + icône */}
              <div className="flex flex-col items-center shrink-0">
                {state === "done" && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                {state === "active" && (
                  <div className="h-5 w-5 rounded-full bg-orange-500 border-2 border-white shadow flex items-center justify-center">
                    <div className="h-2 w-2 rounded-full bg-white" />
                  </div>
                )}
                {state === "future" && <Circle className="h-5 w-5 text-gray-300" />}
                {!isLast && <div className={`w-0.5 h-6 ${state === "done" ? "bg-emerald-300" : "bg-gray-200"}`} />}
              </div>

              {/* Contenu */}
              <div className={`flex-1 pb-3 ${state === "future" ? "opacity-50" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold ${state === "active" ? "text-orange-700" : state === "done" ? "text-emerald-700" : "text-gray-600"}`}>
                    {step.label}
                  </span>
                  {state === "done" && <span className="text-[9px] text-emerald-600 font-medium">Terminé</span>}
                  {state === "active" && <span className="text-[9px] text-orange-600 font-bold">EN COURS</span>}
                </div>
                <p className="text-[10px] text-gray-500">{step.description}</p>

                {/* Bouton d'action sur l'étape active */}
                {state === "active" && activeAction && (
                  <button
                    onClick={() => onStatusChange(activeAction.status)}
                    className={`mt-1.5 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white ${activeAction.color} hover:opacity-90 active:scale-[0.98] transition-all shadow-sm`}
                  >
                    {activeAction.actionLabel}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══ Composant principal ═══ */
export function WorkflowControlPanel({ status, isImport, isLocal, isMixte, articles, onStatusChange }: Props) {
  const s = status ?? "new";

  // ─── Commande MIXTE : les deux circuits ───
  if (isMixte && articles) {
    const localArticles = articles.filter(a => a.is_local);
    const importArticles = articles.filter(a => a.is_import);

    return (
      <div className="space-y-3">
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl p-3 border border-orange-200">
          <h3 className="text-sm font-bold text-orange-800 flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Commande MIXTE — Deux circuits
          </h3>
          <p className="text-[10px] text-orange-600 mt-1">
            {localArticles.length} article{localArticles.length > 1 ? "s" : ""} local
            {" + "}
            {importArticles.length} article{importArticles.length > 1 ? "s" : ""} import
          </p>
        </div>

        {/* Circuit LOCAL (pour articles locaux) */}
        {localArticles.length > 0 && (
          <CircuitTimeline
            steps={LOCAL_STEPS}
            currentStatus={s}
            isImportFlow={false}
            onStatusChange={onStatusChange}
            activeAction={getActiveAction(s, false)}
            title={`Circuit LOCAL (${localArticles.length})`}
            icon={Home}
            headerColor="bg-emerald-100 text-emerald-700"
          />
        )}

        {/* Circuit IMPORT (pour articles imports) */}
        {importArticles.length > 0 && (
          <CircuitTimeline
            steps={IMPORT_STEPS_V2}
            currentStatus={s}
            isImportFlow={true}
            onStatusChange={onStatusChange}
            activeAction={getActiveAction(s, true)}
            title={`Circuit IMPORT (${importArticles.length})`}
            icon={Truck}
            headerColor="bg-indigo-100 text-indigo-700"
          />
        )}
      </div>
    );
  }

  // ─── Commande 100% LOCAL ───
  if (isLocal) {
    return (
      <CircuitTimeline
        steps={LOCAL_STEPS}
        currentStatus={s}
        isImportFlow={false}
        onStatusChange={onStatusChange}
        activeAction={getActiveAction(s, false)}
        title="Circuit LOCAL"
        icon={Home}
        headerColor="bg-emerald-100 text-emerald-700"
      />
    );
  }

  // ─── Commande 100% IMPORT (ou fallback) ───
  return (
    <CircuitTimeline
      steps={IMPORT_STEPS_V2}
      currentStatus={s}
      isImportFlow={true}
      onStatusChange={onStatusChange}
      activeAction={getActiveAction(s, true)}
      title="Circuit IMPORT"
      icon={Truck}
      headerColor="bg-indigo-100 text-indigo-700"
    />
  );
}
