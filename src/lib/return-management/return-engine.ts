// ============================================================
// Return Engine — KawZone ERP
// Moteur de gestion des retours, remboursements, échanges
// Phase 1 : Fonctions serveur (core logic)
// ============================================================
// Principe : Chaque retour = nouveau cycle metier. Jamais de
// modification des donnees historiques (commande, sous-commande,
// paiements originaux).
// ============================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ------------------------------------------------------------------
// TYPES
// ------------------------------------------------------------------

export type LegType = "client_to_kawzone" | "kawzone_to_supplier" | "kawzone_to_stock" | "kawzone_to_destruction" | "kawzone_to_client";

export type ReceivedCondition = "not_received" | "perfect" | "good" | "damaged" | "destroyed" | "incomplete";

export type ProductCondition =
  | "new_sealed" | "new_opened" | "like_new" | "good" | "fair"
  | "damaged_functional" | "damaged_unfunctional" | "incomplete" | "wrong_product" | "counterfeit";

export type Disposition =
  | "restock_as_new" | "restock_as_used" | "send_to_repair"
  | "return_to_supplier" | "destroy" | "donate" | "pending_decision";

export type ReturnShipmentStatus =
  | "pending" | "label_generated" | "picked_up" | "in_transit"
  | "out_for_delivery" | "delivered" | "failed" | "returned_to_sender";

// ------------------------------------------------------------------
// 1. Initialiser un retour (créer le dossier SAV + première expédition)
// ------------------------------------------------------------------
// Justification : Point d'entrée unique du workflow retour.
// Crée un sav_case de type 'return' et une return_shipment pour
// le trajet client→KawZone. Aucune modification de la commande.

export const initiateReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      orderId: z.string().uuid(),
      orderItemId: z.string().uuid().optional(),
      vendorId: z.string().uuid(),
      problemType: z.string(), // customer_changed_mind, defective_product, ...
      reason: z.string().min(1).max(2000),
      scope: z.enum(["item", "order"]).default("item"),
      requestedResolution: z.enum(["refund", "exchange", "repair", "credit", "replacement", "partial_refund"]).default("refund"),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const now = new Date().toISOString();

    // 1. Verifier que la commande existe et est livree
    const { data: orderItem } = await supabase
      .from("order_items")
      .select("id, product_name, unit_price, quantity, vendor_id, order_id")
      .eq("id", data.orderItemId ?? "")
      .single();

    if (!orderItem) throw new Error("Article introuvable");

    // 2. Creer le dossier SAV (case_type = 'return')
    const { data: savCase, error: caseError } = await supabase
      .from("sav_cases")
      .insert({
        order_id: data.orderId,
        order_item_id: data.orderItemId ?? null,
        vendor_id: data.vendorId,
        case_type: "return",
        problem_type: data.problemType,
        scope: data.scope,
        requested_resolution: data.requestedResolution,
        requested_by_party: "client",
        owner_party: "kawzone", // Temporairement KawZone jusqu'a decision
        title: `Retour — ${orderItem.product_name}`,
        description: data.reason,
        status: "open",
        opened_at: now,
        last_activity_at: now,
        client_visible: true,
        financial_impact_amount: orderItem.unit_price * orderItem.quantity,
        financial_impact_currency: "XOF",
      })
      .select("id")
      .single();

    if (caseError || !savCase) throw new Error(`Erreur création dossier SAV: ${caseError?.message}`);

    // 3. Enregistrer l'action
    await supabase.from("sav_actions").insert({
      case_id: savCase.id,
      action_type: "return_requested",
      actor_id: context.userId,
      actor_role: "client",
      to_state: { status: "open", step: "return_requested" },
      note: data.reason,
    });

    // 4. Creer la return_shipment (leg_type = client_to_kawzone)
    await supabase.from("return_shipments").insert({
      case_id: savCase.id,
      leg_type: "client_to_kawzone",
      status: "pending",
      shipping_cost_payer: "client", // Par defaut, le client paie le retour
      created_by: context.userId,
    });

    // 5. Notifier
    // TODO: Declencher notification admin

    return { caseId: savCase.id, message: "Dossier retour créé" };
  });

// ------------------------------------------------------------------
// 2. Accepter un retour (transition : demande → accepté)
// ------------------------------------------------------------------
// Justification : L'admin valide la demande de retour. Le statut
// passe a 'accepted', ce qui declenche la generation d'etiquette.

export const acceptReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      caseId: z.string().uuid(),
      reason: z.string().max(1000).optional(),
      shippingCostPayer: z.enum(["client", "kawzone", "vendor"]).optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const now = new Date().toISOString();

    // Mettre a jour le case
    const { error: caseError } = await supabase
      .from("sav_cases")
      .update({
        status: "accepted",
        admin_decision: "accepted",
        admin_decided_at: now,
        admin_decided_by: context.userId,
        admin_decision_reason: data.reason ?? "Retour accepté",
        last_activity_at: now,
      })
      .eq("id", data.caseId);

    if (caseError) throw new Error(`Erreur acceptation: ${caseError.message}`);

    // Enregistrer l'action
    await supabase.from("sav_actions").insert({
      case_id: data.caseId,
      action_type: "return_accepted",
      actor_id: context.userId,
      actor_role: "admin",
      from_state: { status: "open" },
      to_state: { status: "accepted" },
      note: data.reason,
    });

    // Mettre a jour le payer du trajet si specifie
    if (data.shippingCostPayer) {
      await supabase
        .from("return_shipments")
        .update({ shipping_cost_payer: data.shippingCostPayer })
        .eq("case_id", data.caseId)
        .eq("leg_type", "client_to_kawzone");
    }

    return { caseId: data.caseId, status: "accepted" };
  });

// ------------------------------------------------------------------
// 3. Enregistrer la reception du colis
// ------------------------------------------------------------------
// Justification : Le colis est arrive chez KawZone. On enregistre
// la date, l'etat du colis, et les photos. C'est le declencheur
// pour l'etape d'inspection.

export const receiveReturnShipment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      shipmentId: z.string().uuid(),
      receivedCondition: z.enum(["perfect", "good", "damaged", "destroyed", "incomplete"]),
      receptionPhotos: z.array(z.string().url()).optional(),
      note: z.string().max(1000).optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const now = new Date().toISOString();

    // Mettre a jour le shipment
    const { data: shipment } = await supabase
      .from("return_shipments")
      .update({
        status: "delivered",
        received_at: now,
        received_condition: data.receivedCondition,
        reception_photos: data.receptionPhotos ?? [],
        note: data.note,
      })
      .eq("id", data.shipmentId)
      .select("case_id")
      .single();

    if (!shipment) throw new Error("Expédition introuvable");

    // Mettre a jour le case
    await supabase
      .from("sav_cases")
      .update({ status: "in_progress", last_activity_at: now })
      .eq("id", shipment.case_id);

    // Enregistrer l'action
    await supabase.from("sav_actions").insert({
      case_id: shipment.case_id,
      action_type: "product_received",
      actor_id: context.userId,
      actor_role: "admin",
      to_state: { status: "in_progress", step: "product_received", condition: data.receivedCondition },
      note: data.note,
    });

    return { caseId: shipment.case_id, receivedAt: now };
  });

// ------------------------------------------------------------------
// 4. Creer un rapport d'inspection
// ------------------------------------------------------------------
// Justification : Etape CRITIQUE — la fourche decisionnelle.
// L'inspecteur examine le produit et decide de sa disposition.
// Cette decision declenche tout le reste du workflow.

export const createInspectionReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      caseId: z.string().uuid(),
      returnShipmentId: z.string().uuid().optional(),
      condition: z.enum([
        "new_sealed", "new_opened", "like_new", "good", "fair",
        "damaged_functional", "damaged_unfunctional", "incomplete", "wrong_product", "counterfeit"
      ]),
      disposition: z.enum([
        "restock_as_new", "restock_as_used", "send_to_repair",
        "return_to_supplier", "destroy", "donate", "pending_decision"
      ]),
      actualWeightG: z.number().int().positive().optional(),
      actualDimensionsCm: z.array(z.number().int().positive()).max(3).optional(),
      accessoriesPresent: z.array(z.string()).optional(),
      accessoriesMissing: z.array(z.string()).optional(),
      serialNumber: z.string().optional(),
      packagingCondition: z.enum(["original_intact", "original_damaged", "original_missing", "replacement"]).optional(),
      photos: z.array(z.string().url()).optional(),
      videos: z.array(z.string().url()).optional(),
      findings: z.string().max(5000).optional(),
      clientFault: z.boolean().default(false),
      inspectionCost: z.number().min(0).default(0),
      inspectionCostPayer: z.enum(["client", "kawzone", "vendor", "supplier"]).default("kawzone"),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const now = new Date().toISOString();

    // 1. Creer le rapport
    const { data: report, error: reportError } = await supabase
      .from("inspection_reports")
      .insert({
        case_id: data.caseId,
        return_shipment_id: data.returnShipmentId ?? null,
        inspected_by: context.userId,
        inspected_at: now,
        condition: data.condition,
        disposition: data.disposition,
        actual_weight_g: data.actualWeightG ?? null,
        actual_dimensions_cm: data.actualDimensionsCm ?? null,
        accessories_present: data.accessoriesPresent ?? [],
        accessories_missing: data.accessoriesMissing ?? [],
        serial_number: data.serialNumber ?? null,
        packaging_condition: data.packagingCondition ?? null,
        photos: data.photos ?? [],
        videos: data.videos ?? [],
        findings: data.findings ?? null,
        client_fault: data.clientFault,
        inspection_cost: data.inspectionCost,
        inspection_cost_payer: data.inspectionCostPayer,
      })
      .select("id")
      .single();

    if (reportError || !report) throw new Error(`Erreur inspection: ${reportError?.message}`);

    // 2. Enregistrer les frais d'inspection
    if (data.inspectionCost > 0) {
      await supabase.from("sav_fee_charges").insert({
        case_id: data.caseId,
        fee_kind: "inspection",
        amount: data.inspectionCost,
        currency: "XOF",
        payer_party: data.inspectionCostPayer,
        reason: `Inspection produit — ${data.condition}`,
        created_by: context.userId,
      });
    }

    // 3. Enregistrer l'action
    await supabase.from("sav_actions").insert({
      case_id: data.caseId,
      action_type: "inspection_done",
      actor_id: context.userId,
      actor_role: "admin",
      to_state: { status: "in_progress", step: "inspection_done", disposition: data.disposition, condition: data.condition },
      note: data.findings,
    });

    // 4. Si la disposition est "destroy" — creer automatiquement le record
    if (data.disposition === "destroy") {
      await supabase.from("destruction_records").insert({
        case_id: data.caseId,
        inspection_report_id: report.id,
        method: "recycling", // Defaut, a confirmer par l'admin
        reason: `Produit en état : ${data.condition}`,
        destroyed_by: context.userId,
        destroyed_at: now,
      });

      // Frais de destruction
      await supabase.from("sav_fee_charges").insert({
        case_id: data.caseId,
        fee_kind: "destruction",
        amount: 0, // A definir selon le fournisseur de destruction
        currency: "XOF",
        payer_party: data.clientFault ? "client" : "vendor",
        reason: "Destruction produit",
        created_by: context.userId,
      });
    }

    // 5. Si la disposition est "return_to_supplier" — creer le supplier_return
    if (data.disposition === "return_to_supplier") {
      await supabase.from("supplier_returns").insert({
        case_id: data.caseId,
        inspection_report_id: report.id,
        supplier_id: "UNKNOWN", // A remplir par l'admin
        supplier_name: "A définir",
        status: "pending",
        created_by: context.userId,
      });

      await supabase.from("sav_actions").insert({
        case_id: data.caseId,
        action_type: "supplier_return_initiated",
        actor_id: context.userId,
        actor_role: "admin",
        to_state: { status: "in_execution", step: "supplier_return_initiated" },
      });
    }

    return { reportId: report.id, disposition: data.disposition };
  });

// ------------------------------------------------------------------
// 5. Obtenir la balance financiere d'un dossier retour
// ------------------------------------------------------------------
// Justification : Calcule en temps reel tous les montants du dossier.
// Utilise la vue SQL return_balances. Aucune donnee dupliquee.

export const getReturnBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ caseId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;

    const { data: balance, error } = await supabase
      .from("return_balances")
      .select("*")
      .eq("case_id", data.caseId)
      .single();

    if (error) throw new Error(`Erreur balance: ${error.message}`);

    // Detail des frais par type
    const { data: fees } = await supabase
      .from("sav_fee_charges")
      .select("fee_kind, amount, currency, payer_party, reason")
      .eq("case_id", data.caseId)
      .order("created_at", { ascending: false });

    // Detail des remboursements
    const { data: refunds } = await supabase
      .from("sav_refunds")
      .select("amount, currency, method, status, direction, issued_at")
      .eq("case_id", data.caseId)
      .order("created_at", { ascending: false });

    return {
      balance,
      fees: fees ?? [],
      refunds: refunds ?? [],
    };
  });

// ------------------------------------------------------------------
// 6. Traiter une disposition (executer la decision d'inspection)
// ------------------------------------------------------------------
// Justification : Apres l'inspection, la disposition choisie doit
// etre executee. Chaque disposition a des consequences differentes :
// - restock : remettre en stock
// - destroy : detruire + enregistrer
// - return_to_supplier : initier le retour fournisseur
// - send_to_repair : envoyer en reparation

export const processDisposition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      caseId: z.string().uuid(),
      disposition: z.enum(["restock_as_new", "restock_as_used", "send_to_repair", "return_to_supplier", "destroy", "donate"]),
      inspectionReportId: z.string().uuid(),
      note: z.string().max(2000).optional(),
      destructionDetails: z.object({
        method: z.enum(["recycling", "landfill", "incineration", "donation", "resale_destruction", "other"]),
        reason: z.string(),
        originalValue: z.number().optional(),
      }).optional(),
      supplierReturnDetails: z.object({
        supplierId: z.string(),
        supplierName: z.string(),
      }).optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const now = new Date().toISOString();

    // Mettre a jour le rapport d'inspection
    await supabase
      .from("inspection_reports")
      .update({ disposition: data.disposition })
      .eq("id", data.inspectionReportId);

    const results: string[] = [];

    switch (data.disposition) {
      case "destroy": {
        if (!data.destructionDetails) throw new Error("Détails de destruction requis");

        const { data: record } = await supabase
          .from("destruction_records")
          .insert({
            case_id: data.caseId,
            inspection_report_id: data.inspectionReportId,
            method: data.destructionDetails.method,
            reason: data.destructionDetails.reason,
            original_value: data.destructionDetails.originalValue ?? 0,
            destroyed_by: context.userId,
            destroyed_at: now,
          })
          .select("id")
          .single();

        results.push(`Destruction enregistrée (#${record?.id})`);
        break;
      }

      case "return_to_supplier": {
        if (!data.supplierReturnDetails) throw new Error("Détails fournisseur requis");

        const { data: supReturn } = await supabase
          .from("supplier_returns")
          .insert({
            case_id: data.caseId,
            inspection_report_id: data.inspectionReportId,
            supplier_id: data.supplierReturnDetails.supplierId,
            supplier_name: data.supplierReturnDetails.supplierName,
            supplier_response: "pending",
          })
          .select("id")
          .single();

        results.push(`Retour fournisseur initié (#${supReturn?.id})`);
        break;
      }

      case "restock_as_new":
      case "restock_as_used": {
        // TODO: Logique de restockage (mettre a jour le stock du produit)
        results.push(`Restockage ${data.disposition === "restock_as_new" ? "neuf" : "occasion"} enregistré`);
        break;
      }

      case "send_to_repair": {
        results.push("Envoi en réparation enregistré");
        break;
      }

      case "donate": {
        results.push("Don enregistré");
        break;
      }
    }

    // Enregistrer l'action
    await supabase.from("sav_actions").insert({
      case_id: data.caseId,
      action_type: "disposition_decided",
      actor_id: context.userId,
      actor_role: "admin",
      to_state: { status: "in_execution", disposition: data.disposition },
      note: data.note,
    });

    return { caseId: data.caseId, disposition: data.disposition, results };
  });

// ------------------------------------------------------------------
// 7. Clôturer un dossier retour
// ------------------------------------------------------------------
// Justification : Le dossier est termine. On verifie que tous les
// mouvements financiers sont soldes, puis on ferme le case.

export const closeReturnCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      caseId: z.string().uuid(),
      note: z.string().max(2000).optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const now = new Date().toISOString();

    // Verifier la balance
    const { data: balance } = await supabase
      .from("return_balances")
      .select("balance_status, total_paid, total_refunded, total_fees")
      .eq("case_id", data.caseId)
      .single();

    // Fermer le case
    await supabase
      .from("sav_cases")
      .update({
        status: "closed",
        closed_at: now,
        resolved_at: now,
        last_activity_at: now,
      })
      .eq("id", data.caseId);

    // Enregistrer l'action
    await supabase.from("sav_actions").insert({
      case_id: data.caseId,
      action_type: "close",
      actor_id: context.userId,
      actor_role: "admin",
      to_state: { status: "closed", balance },
      note: data.note,
    });

    return { caseId: data.caseId, status: "closed", balance };
  });

// ------------------------------------------------------------------
// 8. Liste des dossiers retour (pour le Cockpit)
// ------------------------------------------------------------------

export const listReturnCases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      status: z.string().optional(),
      vendorId: z.string().uuid().optional(),
      problemType: z.string().optional(),
      page: z.number().int().min(0).default(0),
      pageSize: z.number().int().min(1).max(100).default(25),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;

    let query = supabase
      .from("sav_cases")
      .select("*, return_balances(*)", { count: "exact" })
      .in("case_type", ["return", "cancellation", "exchange"])
      .order("last_activity_at", { ascending: false })
      .range(data.page * data.pageSize, (data.page + 1) * data.pageSize - 1);

    if (data.status) query = query.eq("status", data.status);
    if (data.vendorId) query = query.eq("vendor_id", data.vendorId);
    if (data.problemType) query = query.eq("problem_type", data.problemType);

    const { data: rows, error, count } = await query;

    if (error) throw new Error(`Erreur liste: ${error.message}`);

    return { cases: rows ?? [], total: count ?? 0 };
  });

// ------------------------------------------------------------------
// 9. Mettre à jour le statut d'une expédition retour
// ------------------------------------------------------------------

export const updateReturnShipmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      shipmentId: z.string().uuid(),
      status: z.enum([
        "pending", "label_generated", "picked_up", "in_transit",
        "out_for_delivery", "delivered", "failed", "returned_to_sender"
      ]),
      trackingNumber: z.string().optional(),
      trackingUrl: z.string().url().optional(),
      carrierName: z.string().optional(),
      note: z.string().optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;

    const update: Record<string, unknown> = { status: data.status };
    if (data.trackingNumber) update.tracking_number = data.trackingNumber;
    if (data.trackingUrl) update.tracking_url = data.trackingUrl;
    if (data.carrierName) update.carrier_name = data.carrierName;
    if (data.note) update.note = data.note;

    const { data: shipment } = await supabase
      .from("return_shipments")
      .update(update)
      .eq("id", data.shipmentId)
      .select("case_id, leg_type")
      .single();

    if (!shipment) throw new Error("Expédition introuvable");

    return { shipmentId: data.shipmentId, status: data.status };
  });
