import { Badge } from "@/components/ui/badge";
import type { SavCaseType, SavStatus, SavAdminDecision, SavVendorRecommendation } from "@/lib/sav-workflow.functions";

export const CASE_TYPE_LABEL: Record<SavCaseType, string> = {
  cancellation: "Annulation",
  return: "Retour",
  exchange: "Échange",
  warranty: "Garantie",
  dispute: "Litige",
  refund: "Remboursement",
  credit_note: "Avoir",
  admin_exception: "Exception admin",
  other: "Autre",
};

export const STATUS_LABEL: Record<SavStatus, string> = {
  open: "Ouvert", in_progress: "En cours", waiting: "En attente",
  resolved: "Résolu", closed: "Clôturé", draft: "Brouillon",
  in_review: "En examen", vendor_responded: "Vendeur répondu",
  in_arbitration: "Arbitrage", accepted: "Accepté", refused: "Refusé",
  partially_accepted: "Partiellement accepté", in_execution: "En exécution",
  waiting_client: "Attente client", waiting_vendor: "Attente vendeur",
  escalated: "Escaladé", reopened: "Réouvert",
};

const STATUS_TONE: Record<SavStatus, string> = {
  open: "bg-blue-100 text-blue-800",
  in_progress: "bg-amber-100 text-amber-800",
  waiting: "bg-slate-100 text-slate-700",
  resolved: "bg-emerald-100 text-emerald-800",
  closed: "bg-slate-200 text-slate-600",
  draft: "bg-slate-100 text-slate-600",
  in_review: "bg-indigo-100 text-indigo-800",
  vendor_responded: "bg-cyan-100 text-cyan-800",
  in_arbitration: "bg-orange-100 text-orange-800",
  accepted: "bg-emerald-100 text-emerald-800",
  refused: "bg-red-100 text-red-800",
  partially_accepted: "bg-lime-100 text-lime-800",
  in_execution: "bg-violet-100 text-violet-800",
  waiting_client: "bg-amber-100 text-amber-800",
  waiting_vendor: "bg-amber-100 text-amber-800",
  escalated: "bg-red-100 text-red-800",
  reopened: "bg-orange-100 text-orange-800",
};

export function CaseStatusBadge({ status }: { status: SavStatus }) {
  return <Badge variant="outline" className={STATUS_TONE[status] ?? ""}>{STATUS_LABEL[status] ?? status}</Badge>;
}

export function CaseTypeBadge({ type }: { type: SavCaseType }) {
  return <Badge variant="secondary">{CASE_TYPE_LABEL[type] ?? type}</Badge>;
}

export function VendorRecoBadge({ reco }: { reco: SavVendorRecommendation }) {
  const tone = reco === "accept" || reco === "propose_refund" || reco === "propose_exchange" ? "bg-emerald-100 text-emerald-800"
    : reco === "refuse" ? "bg-red-100 text-red-800"
    : "bg-slate-100 text-slate-700";
  const label = reco === "accept" ? "Vendeur : Accepte"
    : reco === "refuse" ? "Vendeur : Refuse"
    : reco === "propose_refund" ? "Vendeur : Propose remboursement"
    : reco === "propose_exchange" ? "Vendeur : Propose échange"
    : reco === "propose_other" ? "Vendeur : Autre proposition"
    : "Vendeur : En attente";
  return <Badge variant="outline" className={tone}>{label}</Badge>;
}

export function AdminDecisionBadge({ decision }: { decision: SavAdminDecision }) {
  const tone = decision === "accepted" ? "bg-emerald-100 text-emerald-800"
    : decision === "refused" ? "bg-red-100 text-red-800"
    : decision === "partially_accepted" ? "bg-lime-100 text-lime-800"
    : decision === "overridden" ? "bg-purple-100 text-purple-800"
    : decision === "escalated" ? "bg-orange-100 text-orange-800"
    : "bg-slate-100 text-slate-700";
  const label = decision === "accepted" ? "Admin : Accepté"
    : decision === "refused" ? "Admin : Refusé"
    : decision === "partially_accepted" ? "Admin : Partiel"
    : decision === "overridden" ? "Admin : Surchargé"
    : decision === "escalated" ? "Admin : Escaladé"
    : "Admin : En attente";
  return <Badge variant="outline" className={tone}>{label}</Badge>;
}

export function SlaBadge({ deadline }: { deadline: string | null }) {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - Date.now();
  const hours = Math.round(ms / 3600_000);
  if (hours < 0) return <Badge variant="destructive">SLA dépassé ({Math.abs(hours)}h)</Badge>;
  if (hours < 12) return <Badge className="bg-amber-100 text-amber-800">SLA {hours}h</Badge>;
  return <Badge variant="outline">SLA {Math.round(hours / 24)}j</Badge>;
}
