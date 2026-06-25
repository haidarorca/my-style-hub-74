// ═══════════════════════════════════════════════════════════════
// RETURN MANAGEMENT (COAV) — Fonctions serveur
// KawZone ERP — Système de gestion des retours
// ═══════════════════════════════════════════════════════════════
// Dépendances tables : return_shipments, inspection_reports,
//   destruction_records, supplier_returns, v_case_balances
// ═══════════════════════════════════════════════════════════════

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertPermission } from "./admin-auth.core";

// ──────────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────────

export type LegType =
  | "client_to_kawzone"
  | "kawzone_to_supplier"
  | "kawzone_to_stock"
  | "kawzone_to_destruction"
  | "kawzone_to_client";

export type ShipmentStatus =
  | "pending"
  | "label_generated"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "failed"
  | "returned_to_sender";

export type ReceivedCondition =
  | "not_received"
  | "perfect"
  | "good"
  | "damaged"
  | "destroyed"
  | "incomplete";

export type InspectionCondition =
  | "new_sealed"
  | "new_opened"
  | "like_new"
  | "good"
  | "fair"
  | "damaged_functional"
  | "damaged_unfunctional"
  | "incomplete"
  | "wrong_product"
  | "counterfeit";

export type PackagingCondition =
  | "original_intact"
  | "original_damaged"
  | "original_missing"
  | "replacement";

export type Disposition =
  | "restock_as_new"
  | "restock_as_used"
  | "send_to_repair"
  | "return_to_supplier"
  | "destroy"
  | "donate"
  | "pending_decision";

export type DestructionMethod =
  | "recycling"
  | "landfill"
  | "incineration"
  | "donation"
  | "resale_destruction"
  | "other";

export type SupplierResponse =
  | "pending"
  | "accepted_full"
  | "accepted_partial"
  | "refused"
  | "no_response"
  | "counter_offer"
  | "requested_more_info";

export type RequestMethod =
  | "email"
  | "platform_api"
  | "phone"
  | "agent"
  | "wechat";

export interface ReturnShipment {
  id: string;
  case_id: string;
  leg_type: LegType;
  carrier_name: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  from_address: string | null;
  to_address: string | null;
  shipped_at: string | null;
  expected_at: string | null;
  received_at: string | null;
  received_condition: ReceivedCondition;
  reception_photos: string[];
  shipping_cost: number;
  shipping_cost_currency: string;
  status: ShipmentStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface InspectionReport {
  id: string;
  case_id: string;
  return_shipment_id: string | null;
  inspected_by: string;
  inspected_at: string;
  condition: InspectionCondition;
  actual_weight_g: number | null;
  actual_dimensions_cm: number[] | null;
  accessories_present: string[];
  accessories_missing: string[];
  serial_number: string | null;
  packaging_condition: PackagingCondition | null;
  disposition: Disposition;
  photos: string[];
  videos: string[];
  findings: string | null;
  recommended_action: string | null;
  client_fault: boolean;
  inspection_cost: number;
  inspection_cost_currency: string;
  inspection_cost_payer: string;
  created_at: string;
  updated_at: string;
}

export interface DestructionRecord {
  id: string;
  case_id: string;
  inspection_report_id: string | null;
  method: DestructionMethod;
  destroyed_by: string | null;
  witnessed_by: string | null;
  destroyed_at: string;
  photos: string[];
  certificate_url: string | null;
  original_value: number | null;
  original_currency: string;
  reason: string;
  created_at: string;
  created_by: string | null;
}

export interface SupplierReturn {
  id: string;
  case_id: string;
  inspection_report_id: string | null;
  supplier_id: string;
  supplier_name: string | null;
  requested_at: string | null;
  request_method: RequestMethod | null;
  request_reference: string | null;
  items_returned: any;
  supplier_response: SupplierResponse;
  supplier_response_at: string | null;
  supplier_response_note: string | null;
  credit_amount: number;
  credit_currency: string;
  credit_received_at: string | null;
  credit_applied_to_case: boolean;
  return_shipment_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface CaseBalance {
  case_id: string;
  order_id: string | null;
  order_item_id: string | null;
  case_type: string | null;
  case_status: string | null;
  owner_party: string | null;
  problem_type: string | null;
  vendor_id: string | null;
  total_paid: number;
  unit_price: number | null;
  original_quantity: number | null;
  total_fees: number;
  fees_breakdown: Record<string, any>;
  total_refunded: number;
  total_credit_notes: number;
  total_supplier_credit: number;
  total_lost: number;
  total_remaining: number;
  net_position: number;
  balance_status: string;
  case_opened_at: string | null;
  case_closed_at: string | null;
  updated_at: string | null;
}

// ═══════════════════════════════════════════════════════════════
// SCHEMAS ZOD
// ═══════════════════════════════════════════════════════════════

const LegTypeEnum = z.enum([
  "client_to_kawzone",
  "kawzone_to_supplier",
  "kawzone_to_stock",
  "kawzone_to_destruction",
  "kawzone_to_client",
]);

const ShipmentStatusEnum = z.enum([
  "pending",
  "label_generated",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "failed",
  "returned_to_sender",
]);

const ReceivedConditionEnum = z.enum([
  "not_received",
  "perfect",
  "good",
  "damaged",
  "destroyed",
  "incomplete",
]);

const InspectionConditionEnum = z.enum([
  "new_sealed",
  "new_opened",
  "like_new",
  "good",
  "fair",
  "damaged_functional",
  "damaged_unfunctional",
  "incomplete",
  "wrong_product",
  "counterfeit",
]);

const PackagingConditionEnum = z.enum([
  "original_intact",
  "original_damaged",
  "original_missing",
  "replacement",
]);

const DispositionEnum = z.enum([
  "restock_as_new",
  "restock_as_used",
  "send_to_repair",
  "return_to_supplier",
  "destroy",
  "donate",
  "pending_decision",
]);

const DestructionMethodEnum = z.enum([
  "recycling",
  "landfill",
  "incineration",
  "donation",
  "resale_destruction",
  "other",
]);

const SupplierResponseEnum = z.enum([
  "pending",
  "accepted_full",
  "accepted_partial",
  "refused",
  "no_response",
  "counter_offer",
  "requested_more_info",
]);

const RequestMethodEnum = z.enum([
  "email",
  "platform_api",
  "phone",
  "agent",
  "wechat",
]);

// ═══════════════════════════════════════════════════════════════
// 1. RETURN SHIPMENTS — CRUD
// ═══════════════════════════════════════════════════════════════

const CreateShipmentSchema = z.object({
  case_id: z.string().uuid(),
  leg_type: LegTypeEnum,
  carrier_name: z.string().max(200).nullable().default(null),
  tracking_number: z.string().max(200).nullable().default(null),
  tracking_url: z.string().max(500).nullable().default(null),
  from_address: z.string().max(500).nullable().default(null),
  to_address: z.string().max(500).nullable().default(null),
  expected_at: z.string().nullable().default(null),
  shipping_cost: z.number().min(0).default(0),
  shipping_cost_currency: z.string().max(3).default("XOF"),
  note: z.string().max(1000).nullable().default(null),
});

export const createReturnShipment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateShipmentSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "sav_view_all");
    const { data: row, error } = await (supabaseAdmin as any)
      .from("return_shipments")
      .insert({
        ...data,
        status: "pending",
        received_condition: "not_received",
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(`Erreur création trajet : ${error.message}`);
    return row as ReturnShipment;
  });

export const listReturnShipments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ case_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "sav_view_all");
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("return_shipments")
      .select("*")
      .eq("case_id", data.case_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`Erreur liste trajets : ${error.message}`);
    return rows as ReturnShipment[];
  });

export const updateShipmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      status: ShipmentStatusEnum,
      received_condition: ReceivedConditionEnum.optional(),
      reception_photos: z.array(z.string()).optional(),
      note: z.string().max(1000).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "sav_view_all");
    const update: Record<string, unknown> = { status: data.status };
    if (data.status === "delivered") update.received_at = new Date().toISOString();
    if (data.received_condition !== undefined) update.received_condition = data.received_condition;
    if (data.reception_photos !== undefined) update.reception_photos = data.reception_photos;
    if (data.note !== undefined) update.note = data.note;

    const { data: row, error } = await (supabaseAdmin as any)
      .from("return_shipments")
      .update(update)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(`Erreur maj statut : ${error.message}`);
    return row as ReturnShipment;
  });

export const deleteReturnShipment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "sav_view_all");
    const { error } = await (supabaseAdmin as any)
      .from("return_shipments")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(`Erreur suppression trajet : ${error.message}`);
    return { success: true };
  });

// ═══════════════════════════════════════════════════════════════
// 2. INSPECTION REPORTS — CRUD
// ═══════════════════════════════════════════════════════════════

const CreateInspectionSchema = z.object({
  case_id: z.string().uuid(),
  return_shipment_id: z.string().uuid().nullable().default(null),
  condition: InspectionConditionEnum,
  actual_weight_g: z.number().int().min(0).nullable().default(null),
  actual_dimensions_cm: z.array(z.number().int()).max(3).nullable().default(null),
  accessories_present: z.array(z.string()).default([]),
  accessories_missing: z.array(z.string()).default([]),
  serial_number: z.string().max(200).nullable().default(null),
  packaging_condition: PackagingConditionEnum.nullable().default(null),
  disposition: DispositionEnum,
  photos: z.array(z.string()).default([]),
  videos: z.array(z.string()).default([]),
  findings: z.string().max(5000).nullable().default(null),
  recommended_action: z.string().max(500).nullable().default(null),
  client_fault: z.boolean().default(false),
  inspection_cost: z.number().min(0).default(0),
  inspection_cost_currency: z.string().max(3).default("XOF"),
  inspection_cost_payer: z.string().max(20).default("kawzone"),
});

export const createInspectionReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateInspectionSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "sav_view_all");
    const { data: row, error } = await (supabaseAdmin as any)
      .from("inspection_reports")
      .insert({
        ...data,
        inspected_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(`Erreur création inspection : ${error.message}`);
    return row as InspectionReport;
  });

export const listInspectionReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ case_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "sav_view_all");
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("inspection_reports")
      .select("*, inspector:inspected_by(full_name)")
      .eq("case_id", data.case_id)
      .order("inspected_at", { ascending: true });
    if (error) throw new Error(`Erreur liste inspections : ${error.message}`);
    return rows as (InspectionReport & { inspector: { full_name: string } | null })[];
  });

export const updateInspectionReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      disposition: DispositionEnum.optional(),
      client_fault: z.boolean().optional(),
      inspection_cost: z.number().min(0).optional(),
      findings: z.string().max(5000).nullable().optional(),
      recommended_action: z.string().max(500).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "sav_view_all");
    const { id, ...update } = data;
    const { data: row, error } = await (supabaseAdmin as any)
      .from("inspection_reports")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(`Erreur maj inspection : ${error.message}`);
    return row as InspectionReport;
  });

// ═══════════════════════════════════════════════════════════════
// 3. DESTRUCTION RECORDS — CRUD
// ═══════════════════════════════════════════════════════════════

const CreateDestructionSchema = z.object({
  case_id: z.string().uuid(),
  inspection_report_id: z.string().uuid().nullable().default(null),
  method: DestructionMethodEnum,
  destroyed_by: z.string().uuid().nullable().default(null),
  witnessed_by: z.string().uuid().nullable().default(null),
  photos: z.array(z.string()).default([]),
  certificate_url: z.string().max(500).nullable().default(null),
  original_value: z.number().min(0).nullable().default(null),
  original_currency: z.string().max(3).default("XOF"),
  reason: z.string().min(1).max(2000),
});

export const createDestructionRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateDestructionSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "sav_view_all");
    const { data: row, error } = await (supabaseAdmin as any)
      .from("destruction_records")
      .insert({
        ...data,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(`Erreur création destruction : ${error.message}`);
    return row as DestructionRecord;
  });

export const listDestructionRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ case_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "sav_view_all");
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("destruction_records")
      .select("*")
      .eq("case_id", data.case_id)
      .order("destroyed_at", { ascending: true });
    if (error) throw new Error(`Erreur liste destructions : ${error.message}`);
    return rows as DestructionRecord[];
  });

// ═══════════════════════════════════════════════════════════════
// 4. SUPPLIER RETURNS — CRUD
// ═══════════════════════════════════════════════════════════════

const CreateSupplierReturnSchema = z.object({
  case_id: z.string().uuid(),
  inspection_report_id: z.string().uuid().nullable().default(null),
  supplier_id: z.string().min(1).max(200),
  supplier_name: z.string().max(300).nullable().default(null),
  request_method: RequestMethodEnum.nullable().default(null),
  request_reference: z.string().max(200).nullable().default(null),
  items_returned: z.any().default([]),
  return_shipment_id: z.string().uuid().nullable().default(null),
});

export const createSupplierReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateSupplierReturnSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "sav_view_all");
    const { data: row, error } = await (supabaseAdmin as any)
      .from("supplier_returns")
      .insert({
        ...data,
        supplier_response: "pending",
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(`Erreur création retour fournisseur : ${error.message}`);
    return row as SupplierReturn;
  });

export const listSupplierReturns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ case_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "sav_view_all");
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("supplier_returns")
      .select("*")
      .eq("case_id", data.case_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`Erreur liste retours fournisseur : ${error.message}`);
    return rows as SupplierReturn[];
  });

export const updateSupplierResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      supplier_response: SupplierResponseEnum,
      credit_amount: z.number().min(0).optional(),
      credit_currency: z.string().max(3).optional(),
      supplier_response_note: z.string().max(1000).nullable().optional(),
      credit_applied_to_case: z.boolean().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "sav_view_all");
    const { id, ...rest } = data;
    const update: Record<string, unknown> = { ...rest };
    if (rest.supplier_response) {
      update.supplier_response_at = new Date().toISOString();
    }
    if (rest.credit_amount !== undefined && rest.credit_amount > 0) {
      update.credit_received_at = new Date().toISOString();
    }

    const { data: row, error } = await (supabaseAdmin as any)
      .from("supplier_returns")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(`Erreur maj réponse fournisseur : ${error.message}`);
    return row as SupplierReturn;
  });

// ═══════════════════════════════════════════════════════════════
// 5. V_CASE_BALANCES — READ ONLY
// ═══════════════════════════════════════════════════════════════

export const getCaseBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ case_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "sav_view_all");
    const { data: row, error } = await (supabaseAdmin as any)
      .from("v_case_balances")
      .select("*")
      .eq("case_id", data.case_id)
      .single();
    if (error && error.code !== "PGRST116") throw new Error(`Erreur balance : ${error.message}`);
    return (row ?? null) as CaseBalance | null;
  });

export const listCaseBalances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(25),
      balance_status: z.string().nullable().default(null),
      vendor_id: z.string().nullable().default(null),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "sav_view_all");
    let q = (supabaseAdmin as any)
      .from("v_case_balances")
      .select("*", { count: "exact" })
      .order("case_opened_at", { ascending: false })
      .range((data.page - 1) * data.pageSize, data.page * data.pageSize - 1);

    if (data.balance_status) q = q.eq("balance_status", data.balance_status);
    if (data.vendor_id) q = q.eq("vendor_id", data.vendor_id);

    const { data: rows, error, count } = await q;
    if (error) throw new Error(`Erreur liste balances : ${error.message}`);
    return { rows: rows as CaseBalance[], total: count ?? 0 };
  });

// ═══════════════════════════════════════════════════════════════
// 6. WORKFLOW — Fonctions métier
// ═══════════════════════════════════════════════════════════════

/**
 * Récupère la timeline complète d'un dossier retour :
 * - Trajets logistiques
 * - Inspections
 * - Destructions
 * - Retours fournisseur
 * - Balance financière
 */
export const getReturnCaseTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ case_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "sav_view_all");

    const caseId = data.case_id;
    const sb = supabaseAdmin as any;

    // Parallel queries
    const [
      { data: shipments },
      { data: inspections },
      { data: destructions },
      { data: supplierRets },
      { data: balance },
    ] = await Promise.all([
      sb.from("return_shipments").select("*").eq("case_id", caseId).order("created_at", { ascending: true }),
      sb.from("inspection_reports").select("*, inspector:inspected_by(full_name)").eq("case_id", caseId).order("inspected_at", { ascending: true }),
      sb.from("destruction_records").select("*").eq("case_id", caseId).order("destroyed_at", { ascending: true }),
      sb.from("supplier_returns").select("*").eq("case_id", caseId).order("created_at", { ascending: true }),
      sb.from("v_case_balances").select("*").eq("case_id", caseId).single(),
    ]);

    return {
      shipments: (shipments ?? []) as ReturnShipment[],
      inspections: (inspections ?? []) as (InspectionReport & { inspector: { full_name: string } | null })[],
      destructions: (destructions ?? []) as DestructionRecord[],
      supplierReturns: (supplierRets ?? []) as SupplierReturn[],
      balance: (balance ?? null) as CaseBalance | null,
    };
  });

/**
 * KPIs COAV pour le Cockpit
 */
export const getReturnKPIs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      period: z.enum(["7d", "30d", "90d", "1y"]).default("30d"),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "sav_view_all");

    const daysMap = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 };
    const days = daysMap[data.period];
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const sb = supabaseAdmin as any;

    // Count cases opened in period
    const { count: casesOpened, error: e1 } = await sb
      .from("sav_cases")
      .select("*", { count: "exact", head: true })
      .gte("created_at", since)
      .in("case_type", ["return", "exchange", "warranty"]);

    // Count shipments received
    const { count: shipmentsReceived, error: e2 } = await sb
      .from("return_shipments")
      .select("*", { count: "exact", head: true })
      .gte("received_at", since)
      .not("received_at", "is", null);

    // Count inspections done
    const { count: inspectionsDone, error: e3 } = await sb
      .from("inspection_reports")
      .select("*", { count: "exact", head: true })
      .gte("inspected_at", since);

    // Sum net losses from view
    const { data: losses, error: e4 } = await sb
      .from("v_case_balances")
      .select("net_position")
      .lt("net_position", 0)
      .gte("case_opened_at", since);

    if (e1 || e2 || e3 || e4) {
      throw new Error(`Erreur KPIs : ${e1?.message || e2?.message || e3?.message || e4?.message}`);
    }

    const totalLoss = (losses ?? []).reduce((sum: number, r: { net_position: number }) => sum + Math.abs(r.net_position), 0);

    return {
      casesOpened: casesOpened ?? 0,
      shipmentsReceived: shipmentsReceived ?? 0,
      inspectionsDone: inspectionsDone ?? 0,
      totalLoss: Math.round(totalLoss * 100) / 100,
      period: data.period,
      since,
    };
  });
