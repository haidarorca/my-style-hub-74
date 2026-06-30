// ═══════════════════════════════════════════════════════════════
// /admin/returns/$caseId — Espace de décision
//
// Objectif : permettre de décider en quelques secondes.
//   1. Où en est le produit ? (cycle de vie compact)
//   2. Quelle est la situation financière ? (payé / reste / frais)
//   3. Quelle décision ? (calcul + validation)
//   4. Notes & contexte (replié par défaut)
// ═══════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getReturnCase,
  addCaseFee,
  removeCaseFee,
  updateCaseNotes,
  decideReturnCase,
  closeReturnCase,
  cancelReturnCase,
  type ReturnDecision,
} from "@/lib/returns.functions";
import {
  ArrowLeft,
  Banknote,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  History,
  Lock,
  Package,
  Plus,
  Trash2,
  Undo2,
  XCircle,
  User,
  AlertCircle,
  Plane,
  Store,
  Check,
  Minus,
  Truck,
  Warehouse,
  Home,
  Star,
} from "lucide-react";
import { ProductDetailDrawer } from "@/cockpit/components/ProductDetailDrawer";
import { WorkflowCircuit } from "@/cockpit/components/WorkflowCircuit";
import { readOrderItemLineKind, subOrderKey, type LineKind } from "@/lib/line-kind";
import type { OrderArticle, ArticleStatus } from "@/cockpit/lib/article-states";

export const Route = createFileRoute("/admin/returns/$caseId")({
  component: ReturnCaseDetailPage,
});

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : `${Number(n).toLocaleString("fr-FR")} FCFA`;

const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—";

// ─────────────────────────────────────────────────────────
// Modèles de frais (templates locaux + presets par défaut)
// ─────────────────────────────────────────────────────────
const DEFAULT_FEE_TEMPLATES = [
  "Transport aller",
  "Transport retour",
  "Emballage",
  "Main d'œuvre",
  "Frais administratifs",
  "Autres",
];
const FEE_TPL_KEY = "kz_return_fee_templates_v1";
function loadFeeTemplates(): string[] {
  if (typeof window === "undefined") return DEFAULT_FEE_TEMPLATES;
  try {
    const raw = window.localStorage.getItem(FEE_TPL_KEY);
    if (!raw) return DEFAULT_FEE_TEMPLATES;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return DEFAULT_FEE_TEMPLATES;
    return arr;
  } catch {
    return DEFAULT_FEE_TEMPLATES;
  }
}
function saveFeeTemplates(list: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FEE_TPL_KEY, JSON.stringify(list.slice(0, 30)));
  } catch {
    /* noop */
  }
}

// ─────────────────────────────────────────────────────────
// Workflow stepper compact
// ─────────────────────────────────────────────────────────
const STEPS = [
  { key: "new", label: "Nouvelle" },
  { key: "analysis", label: "Analyse" },
  { key: "decision", label: "Décision" },
  { key: "refund", label: "Remboursement" },
  { key: "closed", label: "Clôturé" },
] as const;

function currentStep(status: string, decision: string | null, refundFinal: number | null) {
  if (status === "closed") return 4;
  if (status === "cancelled") return 4;
  if (status === "decided") return refundFinal && refundFinal > 0 ? 3 : 2;
  if (decision) return 2;
  if (status === "open") return 1;
  return 0;
}

function WorkflowStepper({
  status,
  decision,
  refundFinal,
}: { status: string; decision: string | null; refundFinal: number | null }) {
  const active = currentStep(status, decision, refundFinal);
  const cancelled = status === "cancelled";
  return (
    <div className="flex items-center gap-1 overflow-x-auto py-1">
      {STEPS.map((s, i) => {
        const done = i < active;
        const isCurrent = i === active && !cancelled;
        return (
          <div key={s.key} className="flex items-center gap-1 shrink-0">
            <div
              className={`px-2 py-1 rounded-full text-[11px] font-medium border ${
                cancelled
                  ? "bg-slate-100 text-slate-400 border-slate-200"
                  : isCurrent
                    ? "bg-blue-600 text-white border-blue-600"
                    : done
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-slate-50 text-slate-500 border-slate-200"
              }`}
            >
              {s.label}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-3 h-px ${done ? "bg-emerald-300" : "bg-slate-200"}`} />
            )}
          </div>
        );
      })}
      {cancelled && <span className="ml-2 text-xs text-rose-600 font-medium shrink-0">• Annulé</span>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const meta: Record<string, { label: string; cls: string }> = {
    open: { label: "En analyse", cls: "bg-amber-100 text-amber-800 border-amber-200" },
    decided: { label: "Décidé", cls: "bg-blue-100 text-blue-800 border-blue-200" },
    closed: { label: "Clôturé", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    cancelled: { label: "Annulé", cls: "bg-slate-100 text-slate-700 border-slate-200" },
  };
  const m = meta[status];
  if (!m) return null;
  return <span className={`text-xs px-2 py-0.5 rounded border ${m.cls}`}>{m.label}</span>;
}

// ─────────────────────────────────────────────────────────
// Cycle de vie article : dérivé du / des order_article_states
// ─────────────────────────────────────────────────────────
type LifeFlag = "yes" | "no" | "unknown";

function deriveLifecycle(
  states: any[],
  orderStatus: string | null | undefined,
  isImport: boolean,
) {
  // Combine si plusieurs lignes (variantes) — on prend l'état le plus avancé
  const rank: Record<string, number> = {
    pending: 0,
    awaiting_restock: 0,
    ordered: 1,
    received: 2,
    available: 2,
    ready: 3,
    shipped: 4,
    delivered: 5,
    cancelled: -1,
  };
  let best = -2;
  for (const s of states) {
    const r = rank[s.status] ?? -2;
    if (r > best) best = r;
  }
  // Fallback sur orderStatus si pas d'état article
  if (best === -2 && orderStatus) {
    if (["delivered"].includes(orderStatus)) best = 5;
    else if (["shipped"].includes(orderStatus)) best = 4;
    else if (["ready"].includes(orderStatus)) best = 3;
    else if (["preparing", "confirmed"].includes(orderStatus)) best = 2;
  }

  const supplierConfirmed: LifeFlag = isImport
    ? best >= 1
      ? "yes"
      : best >= 0
        ? "no"
        : "unknown"
    : "yes"; // LOCAL : vendeur = fournisseur, validé dès la commande
  const supplierShipped: LifeFlag = isImport
    ? best >= 2
      ? "yes"
      : best >= 1
        ? "no"
        : "unknown"
    : best >= 4
      ? "yes"
      : best >= 3
        ? "no"
        : "unknown";
  const kawzoneReceived: LifeFlag = isImport
    ? best >= 2
      ? "yes"
      : "no"
    : "yes"; // LOCAL : pas applicable, l'article ne transite pas par KZ
  const clientShipped: LifeFlag = best >= 4 ? "yes" : best >= 3 ? "no" : "unknown";
  const clientReceived: LifeFlag = best >= 5 ? "yes" : best >= 4 ? "no" : "unknown";

  return { supplierConfirmed, supplierShipped, kawzoneReceived, clientShipped, clientReceived };
}

function LifeDot({ flag }: { flag: LifeFlag }) {
  if (flag === "yes")
    return (
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100 text-emerald-700">
        <Check className="w-3 h-3" />
      </span>
    );
  if (flag === "no")
    return (
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-rose-100 text-rose-700">
        <Minus className="w-3 h-3" />
      </span>
    );
  return (
    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-100 text-slate-400 text-[10px]">
      ?
    </span>
  );
}

// ─────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────
function ReturnCaseDetailPage() {
  const { caseId } = Route.useParams();
  const qc = useQueryClient();

  const getFn = useServerFn(getReturnCase);
  const addFeeFn = useServerFn(addCaseFee);
  const removeFeeFn = useServerFn(removeCaseFee);
  const updateNotesFn = useServerFn(updateCaseNotes);
  const decideFn = useServerFn(decideReturnCase);
  const closeFn = useServerFn(closeReturnCase);
  const cancelFn = useServerFn(cancelReturnCase);

  const { data, isLoading } = useQuery({
    queryKey: ["return-case", caseId],
    queryFn: () => getFn({ data: { id: caseId } }),
  });

  const [feeLabel, setFeeLabel] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [decision, setDecision] = useState<ReturnDecision>("accepted");
  const [finalAmount, setFinalAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState("");
  const [notes, setNotes] = useState<string | null>(null);
  const [showContext, setShowContext] = useState(false);
  const [feeTemplates, setFeeTemplates] = useState<string[]>(() => loadFeeTemplates());
  const [detailArticle, setDetailArticle] = useState<OrderArticle | null>(null);

  const reload = () => qc.invalidateQueries({ queryKey: ["return-case", caseId] });

  const orderEvents = data?.order_events ?? [];
  const statusHistory = data?.status_history ?? [];

  type Tl = { id: string; at: string; label: string; detail?: string };
  const orderTimeline: Tl[] = useMemo(() => {
    const a: Tl[] = orderEvents.map((e: any) => ({
      id: `e-${e.id}`,
      at: e.created_at,
      label: e.event_type,
      detail: e.reason ?? undefined,
    }));
    const b: Tl[] = statusHistory.map((h: any) => ({
      id: `h-${h.id}`,
      at: h.created_at,
      label: `${h.from_status ?? "—"} → ${h.to_status}`,
      detail: "Statut commande",
    }));
    return [...a, ...b].sort((x, y) => +new Date(y.at) - +new Date(x.at));
  }, [orderEvents, statusHistory]);

  if (isLoading || !data) {
    return <div className="p-6 text-slate-500">Chargement…</div>;
  }

  const c = data.case;
  const items = data.items;
  const fees = data.fees;
  const order = data.order;
  const orderItems = data.order_items;
  const payments = data.payments;
  const articleStates = (data as any).article_states ?? [];
  const subOrderStates = (data as any).sub_order_states ?? [];
  const totalPaid = Number(data.payment_summary?.total_paid ?? 0);
  const orderTotal = Number(order?.total ?? 0);
  const remainingToPay = Math.max(0, orderTotal - totalPaid);
  const actions = data.actions;

  const feesTotal = fees.reduce((s, f) => s + Number(f.amount_xof), 0);
  const itemsTotal = items.reduce(
    (s, it) => s + Number(it.quantity) * Number(it.unit_price_xof),
    0,
  );
  const suggested = Math.max(0, totalPaid - feesTotal);

  const isLocked = c.status === "closed" || c.status === "cancelled";
  const usedItemIds = new Set(items.map((i) => i.order_item_id));

  // ── Détecter LOCAL vs IMPORT à partir du premier article concerné ──
  const firstCaseItemFull = orderItems.find((oi: any) => usedItemIds.has(oi.id));
  const shopType = (firstCaseItemFull as any)?.shop_type_snapshot as string | undefined;
  const isImport =
    shopType === "import" ||
    shopType === "international" ||
    ((firstCaseItemFull as any)?.product_origin_country_id_snapshot &&
      (firstCaseItemFull as any)?.shop_country_id_snapshot &&
      (firstCaseItemFull as any).product_origin_country_id_snapshot !==
        (firstCaseItemFull as any).shop_country_id_snapshot);
  const life = deriveLifecycle(articleStates, order?.status, !!isImport);

  // ── Templates de frais : déjà utilisés vs disponibles ──
  const usedLabels = new Set(fees.map((f) => f.label));
  const availableTemplates = feeTemplates.filter((t) => !usedLabels.has(t));

  const applyTemplate = (label: string) => {
    setFeeLabel(label);
    // focus the amount input via DOM
    setTimeout(() => {
      const el = document.getElementById("fee-amount-input") as HTMLInputElement | null;
      el?.focus();
    }, 50);
  };

  const handleAddFee = async () => {
    const amt = Number(feeAmount);
    const label = feeLabel.trim();
    if (!label || !Number.isFinite(amt) || amt < 0) return;
    await addFeeFn({ data: { case_id: c.id, label, amount_xof: amt } });
    // mémorise le libellé pour la prochaine fois
    if (!feeTemplates.includes(label)) {
      const next = [...feeTemplates, label];
      setFeeTemplates(next);
      saveFeeTemplates(next);
    }
    setFeeLabel("");
    setFeeAmount("");
    reload();
  };

  return (
    <div className="max-w-[1200px] mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">
      {/* ═══════ EN-TÊTE ═══════ */}
      <div className="space-y-3">
        <Link
          to="/admin/returns"
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" /> Centre Retours & Annulations
        </Link>

        <div className="bg-white border rounded-xl p-3 sm:p-4 space-y-3">
          <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              {c.kind === "return" ? (
                <Undo2 className="w-5 h-5 text-blue-600" />
              ) : (
                <XCircle className="w-5 h-5 text-rose-600" />
              )}
              <span className="font-mono font-bold text-base sm:text-lg">{c.code}</span>
              <StatusBadge status={c.status} />
              <span className="text-xs text-slate-500">Ouvert {fmtDate(c.created_at)}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {!isLocked && c.status === "decided" && (
                <button
                  onClick={async () => {
                    await closeFn({ data: { id: c.id } });
                    reload();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold inline-flex items-center gap-1"
                >
                  <Lock className="w-4 h-4" /> Clôturer
                </button>
              )}
              {!isLocked && (
                <button
                  onClick={async () => {
                    if (!confirm("Annuler ce dossier ?")) return;
                    await cancelFn({ data: { id: c.id } });
                    reload();
                  }}
                  className="px-3 py-1.5 rounded-lg border text-slate-600 text-sm hover:bg-slate-50"
                >
                  Annuler le dossier
                </button>
              )}
            </div>
          </div>
          <WorkflowStepper status={c.status} decision={c.decision} refundFinal={c.refund_final_xof} />
        </div>
      </div>

      {/* ═══════ 1. OÙ EN EST LE PRODUIT ? ═══════ */}
      <section className="bg-white border rounded-xl p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-600" />
            Où en est le produit ?
          </h2>
          <span
            className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded border ${
              isImport
                ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                : "bg-emerald-50 text-emerald-700 border-emerald-200"
            }`}
          >
            {isImport ? <Plane className="w-3 h-3" /> : <Store className="w-3 h-3" />}
            {isImport ? "IMPORT" : "LOCAL"}
          </span>
        </div>

        {/* Articles du dossier — un bloc par article cliquable, avec
            circuit logistique réel issu de sub_order_states. */}
        {items.length > 0 && (
          <div className="mb-3 space-y-3">
            {items.map((it) => {
              const oi: any = (it as any).order_item;
              const fullOi: any = orderItems.find((o: any) => o.id === it.order_item_id);
              const lineKind: LineKind = fullOi
                ? readOrderItemLineKind(fullOi, {
                    destinationCountryId: fullOi.shop_country_id_snapshot,
                    vendorSourceCountryId: fullOi.product_origin_country_id_snapshot,
                    productWeightKg: null,
                  })
                : "LOCAL";
              const subKey = subOrderKey(fullOi?.vendor_id, lineKind);
              const subStatus =
                (subOrderStates as any[]).find((s) => s.sub_order_key === subKey)?.status ?? "new";
              const itemIsImport = lineKind !== "LOCAL";

              return (
                <div key={it.id} className="rounded-lg border border-slate-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      if (!fullOi) return;
                      const astate = (articleStates as any[]).find(
                        (s) =>
                          s.product_id === fullOi.product_id &&
                          (fullOi.variant_id ? s.variant_id === fullOi.variant_id : !s.variant_id),
                      );
                      const synthetic: OrderArticle = {
                        product_id: fullOi.product_id,
                        product_name: fullOi.product_name ?? oi?.product_name ?? "Article",
                        product_image: fullOi.product_image_url ?? null,
                        variant_id: fullOi.variant_id ?? null,
                        variant_label: null,
                        size: fullOi.size ?? null,
                        color: fullOi.color ?? null,
                        quantity: fullOi.quantity ?? it.quantity,
                        unit_price: Number(fullOi.unit_price ?? it.unit_price_xof),
                        line_total:
                          Number(fullOi.unit_price ?? it.unit_price_xof) *
                          Number(fullOi.quantity ?? it.quantity),
                        is_import: itemIsImport,
                        is_local: !itemIsImport,
                        vendor_id: fullOi.vendor_id ?? null,
                        vendor_name: fullOi.shop_name_snapshot ?? null,
                        shop_type_label: fullOi.shop_type_snapshot ?? null,
                        line_kind: lineKind,
                        sub_order_key: subKey,
                        is_admin_shop: fullOi.is_admin_shop_snapshot ?? undefined,
                        commission_rate: fullOi.commission_rate ?? null,
                        commission_amount: fullOi.commission_amount ?? null,
                        status: (astate?.status as ArticleStatus) ?? "pending",
                        delivered_qty: astate?.delivered_qty ?? 0,
                        stock_break: astate?.stock_break ?? undefined,
                        updated_at: astate?.updated_at,
                      };
                      setDetailArticle(synthetic);
                    }}
                    className="w-full text-left p-2.5 bg-slate-50 hover:bg-slate-100 transition flex items-center gap-2.5"
                    title="Voir le détail produit"
                  >
                    <div className="shrink-0 w-12 h-12 bg-white rounded-lg overflow-hidden border">
                      {fullOi?.product_image_url ? (
                        <img
                          src={fullOi.product_image_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                          <Package className="w-5 h-5" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {oi?.product_name ?? "Article"}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                        <span>Qté {it.quantity} × {fmt(it.unit_price_xof)}</span>
                        {(fullOi?.size || fullOi?.color) && (
                          <span className="text-slate-400">
                            · {[fullOi.size, fullOi.color].filter(Boolean).join(" / ")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold">
                        {fmt(it.quantity * it.unit_price_xof)}
                      </div>
                      <div className="text-[10px] text-blue-600">Voir détails →</div>
                    </div>
                  </button>

                  {/* Circuit logistique réel — relié à la sous-commande de cet article. */}
                  <div className="p-2 bg-white">
                    <WorkflowCircuit
                      status={subStatus}
                      isImport={itemIsImport}
                      lineKind={lineKind}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Checkpoints du cycle de vie */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {isImport && (
            <Checkpoint
              icon={<ClipboardList className="w-3.5 h-3.5" />}
              label="Fournisseur a confirmé"
              flag={life.supplierConfirmed}
            />
          )}
          <Checkpoint
            icon={<Truck className="w-3.5 h-3.5" />}
            label={isImport ? "Fournisseur a expédié" : "Vendeur a expédié"}
            flag={life.supplierShipped}
          />
          {isImport && (
            <Checkpoint
              icon={<Warehouse className="w-3.5 h-3.5" />}
              label="KawZone a reçu"
              flag={life.kawzoneReceived}
            />
          )}
          <Checkpoint
            icon={<Truck className="w-3.5 h-3.5" />}
            label="Expédié au client"
            flag={life.clientShipped}
          />
          <Checkpoint
            icon={<Home className="w-3.5 h-3.5" />}
            label="Client a reçu"
            flag={life.clientReceived}
          />
        </div>
      </section>

      {/* ═══════ 2. SITUATION FINANCIÈRE ═══════ */}
      <section className="bg-white border rounded-xl p-3 sm:p-4">
        <h2 className="font-semibold text-sm flex items-center gap-2 mb-3">
          <Banknote className="w-4 h-4 text-emerald-600" />
          Situation financière
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="Total commande" value={fmt(orderTotal)} />
          <Stat label="Client a payé" value={fmt(totalPaid)} />
          <Stat
            label="Reste à payer"
            value={fmt(remainingToPay)}
            highlight={remainingToPay > 0}
            tone={remainingToPay > 0 ? "warn" : "ok"}
          />
          <Stat label="Articles du dossier" value={fmt(itemsTotal)} />
        </div>
        {payments.length > 0 && (
          <details className="mt-3 group">
            <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700 flex items-center gap-1">
              <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
              Voir les {payments.length} paiement{payments.length > 1 ? "s" : ""}
            </summary>
            <ul className="divide-y text-sm mt-2 border rounded">
              {payments.map((p: any) => (
                <li key={p.id} className="py-1.5 px-2 flex justify-between items-center">
                  <div>
                    <span className="font-semibold">{fmt(p.amount)}</span>
                    <span className="text-xs text-slate-500 ml-2">{p.method ?? "—"}</span>
                  </div>
                  <span className="text-xs text-slate-400">{fmtDate(p.created_at)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* ═══════ 3. FRAIS (avec modèles rapides) ═══════ */}
      <section className="bg-white border rounded-xl p-3 sm:p-4">
        <h2 className="font-semibold text-sm flex items-center gap-2 mb-3">
          <Calculator className="w-4 h-4 text-amber-600" />
          Frais liés au dossier
          {feesTotal > 0 && (
            <span className="ml-auto text-xs font-semibold text-slate-700">
              Total : {fmt(feesTotal)}
            </span>
          )}
        </h2>

        {/* Frais déjà saisis */}
        {fees.length > 0 && (
          <ul className="divide-y mb-3 border rounded">
            {fees.map((f) => (
              <li key={f.id} className="py-1.5 px-2 flex items-center justify-between gap-2">
                <span className="text-sm">{f.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{fmt(f.amount_xof)}</span>
                  {!isLocked && (
                    <button
                      onClick={async () => {
                        await removeFeeFn({ data: { id: f.id } });
                        reload();
                      }}
                      className="text-rose-500 hover:bg-rose-50 p-1 rounded"
                      aria-label="Supprimer ce frais"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Modèles rapides (chips) */}
        {!isLocked && availableTemplates.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {availableTemplates.map((t) => (
              <button
                key={t}
                onClick={() => applyTemplate(t)}
                className={`text-xs px-2 py-1 rounded-full border inline-flex items-center gap-1 transition ${
                  feeLabel === t
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white border-slate-200 hover:bg-blue-50 hover:border-blue-300 text-slate-700"
                }`}
              >
                {DEFAULT_FEE_TEMPLATES.includes(t) ? null : <Star className="w-3 h-3" />}
                {t}
              </button>
            ))}
          </div>
        )}

        {/* Saisie unifiée */}
        {!isLocked && (
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={feeLabel}
              onChange={(e) => setFeeLabel(e.target.value)}
              placeholder="Libellé du frais"
              className="flex-1 px-2 py-1.5 border rounded text-sm"
            />
            <input
              id="fee-amount-input"
              value={feeAmount}
              onChange={(e) => setFeeAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddFee();
              }}
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="Montant FCFA"
              className="sm:w-36 px-2 py-1.5 border rounded text-sm"
            />
            <button
              onClick={handleAddFee}
              className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-1"
            >
              <Plus className="w-4 h-4" /> Ajouter
            </button>
          </div>
        )}
        {!isLocked && (
          <p className="text-[11px] text-slate-400 mt-2">
            Les libellés que tu utilises sont mémorisés et proposés en raccourci la prochaine fois.
          </p>
        )}
      </section>

      {/* ═══════ 4. CALCUL & DÉCISION ═══════ */}
      <section className="bg-white border-2 border-blue-300 rounded-xl p-3 sm:p-4 space-y-3 shadow-sm">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-blue-600" />
          Décision & remboursement
        </h2>

        <div className="grid grid-cols-3 gap-2 text-sm">
          <Stat label="Payé" value={fmt(totalPaid)} small />
          <Stat label="− Frais" value={fmt(feesTotal)} small />
          <Stat label="Conseillé" value={fmt(suggested)} small highlight tone="ok" />
        </div>
        <p className="text-[11px] text-slate-500">
          Formule : <strong>Payé par le client − Total des frais</strong>. Tu peux toujours écraser
          le montant final.
        </p>

        {c.status === "open" && !isLocked && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1">
            <select
              value={decision}
              onChange={(e) => setDecision(e.target.value as ReturnDecision)}
              className="px-2 py-2 border rounded text-sm"
            >
              <option value="accepted">Accepté intégralement</option>
              <option value="partial">Accepté partiellement</option>
              <option value="refused">Refusé</option>
            </select>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={finalAmount}
              onChange={(e) => setFinalAmount(e.target.value)}
              placeholder={`Final (conseillé ${suggested})`}
              className="px-2 py-2 border rounded text-sm"
            />
            <input
              value={refundMethod}
              onChange={(e) => setRefundMethod(e.target.value)}
              placeholder="Méthode (Wave, Cash…)"
              className="px-2 py-2 border rounded text-sm"
            />
            <button
              onClick={async () => {
                const amt = finalAmount === "" ? suggested : Number(finalAmount);
                if (!Number.isFinite(amt) || amt < 0) return;
                await decideFn({
                  data: {
                    id: c.id,
                    decision,
                    refund_final_xof: amt,
                    refund_method: refundMethod || null,
                  },
                });
                reload();
              }}
              className="md:col-span-3 px-3 py-2 rounded bg-blue-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-1"
            >
              <CheckCircle2 className="w-4 h-4" /> Valider la décision
            </button>
          </div>
        )}

        {c.status !== "open" && (
          <div className="pt-1 grid grid-cols-2 gap-2 text-sm">
            <Stat
              label="Décision"
              value={
                c.decision === "accepted"
                  ? "Accepté"
                  : c.decision === "partial"
                    ? "Partiel"
                    : c.decision === "refused"
                      ? "Refusé"
                      : "—"
              }
            />
            <Stat label="Montant final" value={fmt(c.refund_final_xof)} highlight tone="ok" />
            {c.refund_method && (
              <div className="col-span-2">
                <Stat label="Méthode" value={c.refund_method} />
              </div>
            )}
          </div>
        )}
      </section>

      {/* ═══════ NOTES INTERNES (toujours utile, gardé compact) ═══════ */}
      <section className="bg-white border rounded-xl p-3 sm:p-4">
        <h2 className="font-semibold text-sm flex items-center gap-2 mb-2">
          <ClipboardList className="w-4 h-4 text-slate-500" />
          Notes internes
        </h2>
        <textarea
          value={notes ?? c.internal_notes ?? ""}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          disabled={isLocked}
          className="w-full px-3 py-2 border rounded text-sm"
          placeholder="Trace des échanges WhatsApp, contexte, décisions…"
        />
        {!isLocked && (
          <div className="flex justify-end mt-2">
            <button
              onClick={async () => {
                await updateNotesFn({
                  data: { id: c.id, internal_notes: notes ?? c.internal_notes ?? "" },
                });
                reload();
              }}
              className="px-3 py-1.5 rounded bg-slate-800 text-white text-sm"
            >
              Enregistrer
            </button>
          </div>
        )}
      </section>

      {/* ═══════ CONTEXTE COMPLET (replié par défaut) ═══════ */}
      <section className="bg-white border rounded-xl">
        <button
          onClick={() => setShowContext((v) => !v)}
          className="w-full px-3 sm:px-4 py-2.5 flex items-center justify-between text-sm font-semibold hover:bg-slate-50 transition rounded-xl"
        >
          <span className="flex items-center gap-2">
            {showContext ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Contexte complet (commande, autres articles, historiques)
          </span>
          <span className="text-xs font-normal text-slate-400">
            {orderTimeline.length} év. · {actions.length} actions
          </span>
        </button>

        {showContext && (
          <div className="px-3 sm:px-4 pb-4 grid grid-cols-1 lg:grid-cols-2 gap-4 border-t pt-4">
            {/* Commande & client */}
            <SubSection icon={<User className="w-4 h-4" />} title="Commande & client">
              {order ? (
                <dl className="space-y-1 text-sm">
                  <Row
                    k="N° commande"
                    v={<span className="font-mono text-xs">{order.id.slice(0, 8)}…</span>}
                  />
                  <Row k="Client" v={order.customer_name ?? "—"} />
                  <Row k="Téléphone" v={order.customer_phone ?? "—"} />
                  <Row k="Adresse" v={order.address ?? "—"} />
                  <Row k="Statut" v={<span className="font-medium">{order.status}</span>} />
                  <Row k="Créée le" v={fmtDate(order.created_at)} />
                </dl>
              ) : (
                <div className="text-sm text-slate-500">Commande introuvable.</div>
              )}
            </SubSection>

            {/* Autres articles */}
            <SubSection icon={<Package className="w-4 h-4" />} title="Autres articles de la commande">
              {(orderItems ?? []).length === 0 ? (
                <Empty label="—" />
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {orderItems.map((oi: any) => {
                    const inCase = usedItemIds.has(oi.id);
                    return (
                      <li
                        key={oi.id}
                        className={`p-2 rounded border ${
                          inCase ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-200"
                        }`}
                      >
                        <div className="font-medium text-xs truncate">{oi.product_name}</div>
                        <div className="text-[11px] text-slate-500 flex justify-between">
                          <span>
                            Qté {oi.quantity} × {fmt(oi.unit_price)}
                          </span>
                          {inCase && (
                            <span className="text-amber-700 font-semibold">Dans ce dossier</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SubSection>

            {/* Historique commande */}
            <SubSection icon={<History className="w-4 h-4" />} title="Historique commande">
              {orderTimeline.length === 0 ? (
                <Empty label="Aucun événement" />
              ) : (
                <ul className="space-y-1.5 max-h-80 overflow-y-auto">
                  {orderTimeline.slice(0, 30).map((t) => (
                    <li key={t.id} className="text-xs border-l-2 border-slate-200 pl-2 py-1">
                      <div className="font-medium text-slate-800">{t.label}</div>
                      {t.detail && <div className="text-slate-500">{t.detail}</div>}
                      <div className="text-slate-400">{fmtDate(t.at)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </SubSection>

            {/* Historique dossier */}
            <SubSection icon={<History className="w-4 h-4" />} title="Historique du dossier">
              {actions.length === 0 ? (
                <Empty label="Aucune action" />
              ) : (
                <ul className="space-y-1.5 max-h-80 overflow-y-auto">
                  {actions.map((a: any) => (
                    <li
                      key={a.id}
                      className="text-xs border-l-2 border-slate-200 pl-2 py-1"
                    >
                      <div className="font-medium text-slate-800">{actionLabel(a.action)}</div>
                      {a.payload && (
                        <div className="text-slate-500 truncate">
                          {formatPayload(a.action, a.payload)}
                        </div>
                      )}
                      <div className="text-slate-400">
                        {a.actor_email ?? "système"} · {fmtDate(a.created_at)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SubSection>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Petits composants ────────────────────────────────
function Checkpoint({
  icon,
  label,
  flag,
}: { icon: React.ReactNode; label: string; flag: LifeFlag }) {
  const tone =
    flag === "yes"
      ? "bg-emerald-50 border-emerald-200"
      : flag === "no"
        ? "bg-rose-50 border-rose-200"
        : "bg-slate-50 border-slate-200";
  return (
    <div className={`rounded border p-2 flex items-center gap-2 ${tone}`}>
      <LifeDot flag={flag} />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-slate-500 flex items-center gap-1">{icon}</div>
        <div className="text-xs font-medium text-slate-800 truncate">{label}</div>
      </div>
    </div>
  );
}

function SubSection({
  icon,
  title,
  children,
}: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-lg">
      <header className="px-3 py-2 border-b bg-slate-50 rounded-t-lg">
        <h3 className="font-semibold text-xs flex items-center gap-2 text-slate-700">
          {icon} {title}
        </h3>
      </header>
      <div className="px-3 py-2">{children}</div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="py-3 text-center text-xs text-slate-400 flex flex-col items-center gap-1">
      <AlertCircle className="w-4 h-4" /> {label}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
  small,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
  small?: boolean;
  tone?: "ok" | "warn";
}) {
  const palette =
    highlight && tone === "ok"
      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
      : highlight && tone === "warn"
        ? "bg-rose-50 border-rose-200 text-rose-800"
        : tone === "warn"
          ? "bg-amber-50 border-amber-200 text-amber-800"
          : "bg-slate-50 border-slate-200 text-slate-800";
  return (
    <div className={`rounded p-2 text-center border ${palette}`}>
      <div className={`${small ? "text-[10px]" : "text-xs"} opacity-70`}>{label}</div>
      <div className={`font-bold ${small ? "text-xs" : "text-sm"}`}>{value}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-500 text-xs">{k}</dt>
      <dd className="text-right text-sm">{v}</dd>
    </div>
  );
}

function actionLabel(a: string): string {
  const map: Record<string, string> = {
    case_opened: "Dossier ouvert",
    status_changed: "Changement de statut",
    decision_recorded: "Décision enregistrée",
    notes_updated: "Notes mises à jour",
    item_added: "Article ajouté",
    item_removed: "Article retiré",
    fee_added: "Frais ajouté",
    fee_removed: "Frais retiré",
  };
  return map[a] ?? a;
}

function formatPayload(action: string, p: any): string {
  if (!p) return "";
  if (action === "status_changed") return `${p.from ?? "—"} → ${p.to ?? "—"}`;
  if (action === "decision_recorded")
    return `${p.decision ?? ""} — ${fmt(p.refund_final_xof)}${p.refund_method ? ` (${p.refund_method})` : ""}`;
  if (action === "fee_added" || action === "fee_removed")
    return `${p.label ?? ""} — ${fmt(p.amount_xof)}`;
  if (action === "item_added" || action === "item_removed")
    return `Qté ${p.quantity ?? "?"}${p.unit_price_xof ? ` × ${fmt(p.unit_price_xof)}` : ""}`;
  if (action === "case_opened")
    return `${p.kind ?? ""}${p.reason_note ? ` — ${p.reason_note}` : ""}`;
  return "";
}
