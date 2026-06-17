// ═══════════════════════════════════════════════════════════════
// TYPES COCKPIT — Définitions complètes du ERP Kawzone
// ═══════════════════════════════════════════════════════════════

/** Méthodes de paiement acceptées */
export type PaymentMethod = "wave" | "orange_money" | "cash" | "bank_transfer" | "other";

/** Type de remboursement lors d'une annulation */
export type RefundType = "refund" | "credit" | "no_refund" | "partial_refund";

/** Statuts du workflow LOCAL officiel
    new → confirmed → preparing → ready → shipped → delivered */
export type LocalStatus =
  | "new"
  | "confirmed"
  | "preparing"
  | "ready"
  | "shipped"
  | "delivered"
  | "cancelled";

/** Statuts du workflow IMPORT (11 étapes) */
export type ImportStatus =
  | "new"
  | "confirmed"
  | "ordered_supplier"
  | "received_warehouse"
  | "in_transit"
  | "arrived_senegal"
  | "awaiting_weighing"
  | "fees_calculated"
  | "payment_fees"
  | "ready_delivery"
  | "shipped"
  | "delivered"
  | "cancelled";

/** Tous les statuts possibles */
export type OrderStatus = LocalStatus | ImportStatus;

/** Enregistrement de paiement */
export interface PaymentRecord {
  id: string;
  orderId: string;
  amount: number;
  method: PaymentMethod;
  reference: string;
  adminName: string;
  timestamp: string;
  /** Historique des modifications */
  editHistory?: PaymentEdit[];
}

/** Modification d'un paiement (audit) */
export interface PaymentEdit {
  oldAmount: number;
  newAmount: number;
  oldMethod: string;
  newMethod: string;
  editedBy: string;
  editedAt: string;
}

/** Entrée d'audit */
export interface AuditEntry {
  id: string;
  orderId: string;
  action: string;
  adminName: string;
  timestamp: string;
  details?: string;
}

/** Informations de pesée */
export interface WeighingRecord {
  id: string;
  orderId: string;
  realWeightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  volumetricWeightKg: number;
  chargeableWeightKg: number;
  freightRatePerKg: number;
  estimatedFreight: number;
  finalFreight: number;
  weighedBy: string;
  timestamp: string;
}

/** Informations d'annulation */
export interface CancellationRecord {
  orderId: string;
  reason: string;
  refundType: RefundType;
  paidAmount: number;
  cancelledBy: string;
  cancelledAt: string;
}

/** Filtre KPI actif */
export type KpiFilter =
  | "all"
  | "new"
  | "payment_pending"
  | "to_weigh"
  | "ready"
  | "shipped"
  | "debt"
  | null;

/** Vue archive active */
export type ArchiveFilter = "delivered" | "cancelled" | "refunded" | "all";

/** Données de statut pour un order */
export interface OrderStatusData {
  status: string;
  updatedAt: string;
  updatedBy: string;
}
