import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";

export type CustomerTier = "new" | "regular" | "vip" | "blocked";

export type CustomerSnapshot = {
  phone: string;
  name: string;
  total_remaining: number;
  total_spent: number;
  order_count: number;
  tier: CustomerTier;
  credit_limit?: number;
  credit_used?: number;
  avg_payment_days?: number;
  risk_score?: "low" | "medium" | "high";
};

export type PaymentEntry = {
  amount: number;
  method: string;
  reference: string;
  date: string;
};

export type WorkflowRow = LogisticsOrderRow & {
  customer?: CustomerSnapshot;
  payment_history?: PaymentEntry[];
};

export type WorkflowFilterKey =
  | "actions"
  | "all"
  | "to_weigh"
  | "waiting_client"
  | "to_ship"
  | "payment"
  | "urgent";

export type WorkflowStep = {
  key: string;
  label: string;
};

export type PaymentBadgeVariant =
  | "confirmed"
  | "paid"
  | "partial"
  | "pending"
  | "waived"
  | "refunded";

export type OrderTypeBadge = "local" | "import" | "mixed";
