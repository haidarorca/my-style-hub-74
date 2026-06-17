// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   TYPES ADMIN1 — Kawzone Workflow Center v4
   ═══════════════════════════════════════════════════════════════ */

export type OrderType = "local" | "import" | "mixed";
export type PackageType = "local" | "import";

export type OrderStatus =
  | "new"             // 1. À Confirmer
  | "confirmed"       // 2. En Attente d'Acompte
  | "deposit_paid"    // 3. À Traiter / En Transit
  | "processing"      //    (sous-état: local_stock / import_transit)
  | "warehouse_arrived"// 4. À Peser / Tarifer
  | "fees_calculated" // 5. En Attente de Solde
  | "ready_to_ship"   // 6. À Expédier / Livrer
  | "shipped"         // 7. En Cours de Livraison
  | "delivered"       // 8. Clôturé / Soldé
  | "cancelled";      // Annulée

export type PaymentMethod = "wave" | "orange_money" | "cash" | "bank_transfer" | "other";

export interface KawzoneOrder {
  id: string;
  order_number: string;       // #001, #002
  customer_name: string;
  customer_phone: string;
  customer_address?: string;
  status: OrderStatus;
  order_type: OrderType;
  total_product_amount: number;
  shipping_fees: number;
  total_due: number;
  total_paid: number;
  balance: number;
  created_at: string;
  updated_at: string;
  confirmed_at?: string;
  delivered_at?: string;
  cancelled_at?: string;
  admin_notes?: string;
}

export interface KawzonePackage {
  id: string;
  order_id: string;
  package_type: PackageType;
  status: OrderStatus;
  weight_kg?: number;
  volumetric_weight_kg?: number;
  freight_rate_per_kg: number;
  freight_cost: number;
  tracking_number?: string;
  carrier_name?: string;
  warehouse_arrived_at?: string;
  shipped_at?: string;
  delivered_at?: string;
}

export interface PaymentLog {
  id: string;
  order_id: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  recorded_by: string;
  recorded_at: string;
  notes?: string;
}

export interface StatusLog {
  id: string;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  changed_by: string;
  changed_at: string;
  notes?: string;
}

export interface OrderWithDetails extends KawzoneOrder {
  packages: KawzonePackage[];
  payments: PaymentLog[];
  status_history: StatusLog[];
}

/* ── KPI ── */
export interface KpiData {
  treasury_today: {
    total: number;
    wave: number;
    orange_money: number;
    cash: number;
    bank: number;
  };
  total_debt: number;
  to_confirm: number;
  to_weigh: number;
  blocked_alerts: number;
}

/* ── Tab config ── */
export interface TabConfig {
  key: string;
  label: string;
  count: number;
  statuses: OrderStatus[];
  action_label: string;
  color: string;
  bg: string;
  border: string;
}
