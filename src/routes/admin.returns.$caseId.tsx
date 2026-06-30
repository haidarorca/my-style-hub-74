// ═══════════════════════════════════════════════════════════════
// /admin/returns/$caseId — Espace de travail du dossier
//
// Une seule page = toutes les informations pour décider.
// Le système affiche, calcule et trace. L'admin décide.
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
} from "lucide-react";

export const Route = createFileRoute("/admin/returns/$caseId")({
  component: ReturnCaseDetailPage,
});

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : `${Number(n).toLocaleString("fr-FR")} FCFA`;

const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—";

// ─────────────────────────────────────────────────────────
// Workflow stepper : dérivé du statut + décision
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

function WorkflowStepper({ status, decision, refundFinal }: {
  status: string; decision: string | null; refundFinal: number | null;
}) {
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
      {cancelled && (
        <span className="ml-2 text-xs text-rose-600 font-medium shrink-0">• Annulé</span>
      )}
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

  const reload = () => qc.invalidateQueries({ queryKey: ["return-case", caseId] });

  const orderEvents = data?.order_events ?? [];
  const statusHistory = data?.status_history ?? [];

  // Fusion timeline commande — déclaré AVANT tout early return pour respecter
  // les règles des hooks (ordre stable entre renders).
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
  const totalPaid = Number(data.payment_summary?.total_paid ?? 0);
  const orderTotal = Number(order?.total ?? 0);
  const remainingToPay = Math.max(0, orderTotal - totalPaid);
  const actions = data.actions;

  const feesTotal = fees.reduce((s, f) => s + Number(f.amount_xof), 0);
  const itemsTotal = items.reduce(
    (s, it) => s + Number(it.quantity) * Number(it.unit_price_xof),
    0,
  );
  // Conseillé = ce que le client a payé, moins les frais
  const suggested = Math.max(0, totalPaid - feesTotal);

  const isLocked = c.status === "closed" || c.status === "cancelled";
  const usedItemIds = new Set(items.map((i) => i.order_item_id));


  return (
    <div className="max-w-[1400px] mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">
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

      {/* ═══════ ZONE PRINCIPALE 2 COLONNES ═══════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ─── COLONNE GAUCHE (action) ─── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Article concerné */}
          <Section icon={<Package className="w-4 h-4" />} title={`Article${items.length > 1 ? "s" : ""} concerné${items.length > 1 ? "s" : ""}`} right={`${items.length}`}>
            {items.length === 0 ? (
              <Empty label="Aucun article dans ce dossier" />
            ) : (
              <ul className="divide-y">
                {items.map((it) => {
                  const oi = (it as any).order_item;
                  return (
                    <li key={it.id} className="py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">
                          {oi?.product_name ?? "Article"}
                        </div>
                        <div className="text-xs text-slate-500">
                          Qté {it.quantity} × {fmt(it.unit_price_xof)} ={" "}
                          <span className="font-semibold text-slate-700">
                            {fmt(it.quantity * it.unit_price_xof)}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {items.length > 0 && (
              <div className="mt-2 text-xs text-slate-500">
                Sous-total articles : <span className="font-semibold text-slate-700">{fmt(itemsTotal)}</span>
              </div>
            )}
          </Section>

          {/* Frais */}
          <Section icon={<Calculator className="w-4 h-4" />} title="Frais liés au dossier">
            {fees.length === 0 ? (
              <Empty label="Aucun frais saisi" />
            ) : (
              <ul className="divide-y">
                {fees.map((f) => (
                  <li key={f.id} className="py-2 flex items-center justify-between gap-2">
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
            {!isLocked && (
              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                <input
                  value={feeLabel}
                  onChange={(e) => setFeeLabel(e.target.value)}
                  placeholder="Libellé (ex. Transport retour)"
                  className="flex-1 px-2 py-1.5 border rounded text-sm"
                />
                <input
                  value={feeAmount}
                  onChange={(e) => setFeeAmount(e.target.value)}
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder="Montant FCFA"
                  className="sm:w-36 px-2 py-1.5 border rounded text-sm"
                />
                <button
                  onClick={async () => {
                    const amt = Number(feeAmount);
                    if (!feeLabel.trim() || !Number.isFinite(amt) || amt < 0) return;
                    await addFeeFn({
                      data: { case_id: c.id, label: feeLabel, amount_xof: amt },
                    });
                    setFeeLabel("");
                    setFeeAmount("");
                    reload();
                  }}
                  className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-1"
                >
                  <Plus className="w-4 h-4" /> Ajouter
                </button>
              </div>
            )}
            {fees.length > 0 && (
              <div className="mt-2 text-xs text-slate-500">
                Total frais : <span className="font-semibold text-slate-700">{fmt(feesTotal)}</span>
              </div>
            )}
          </Section>

          {/* Calcul & décision — la zone d'action principale */}
          <section className="bg-white border-2 border-blue-200 rounded-xl p-4 space-y-3 shadow-sm">
            <h2 className="font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-600" /> Calcul & décision
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
              <Stat label="Client a payé" value={fmt(totalPaid)} />
              <Stat label="Total frais" value={`− ${fmt(feesTotal)}`} />
              <Stat
                label="Conseillé à rembourser"
                value={fmt(suggested)}
                highlight
              />
            </div>
            <p className="text-[11px] text-slate-500">
              Formule : <strong>Payé par le client − Total des frais</strong>. Tu peux toujours
              écraser ce montant.
            </p>

            {c.status === "open" && !isLocked && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2">
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
              <div className="pt-2 grid grid-cols-2 gap-2 text-sm">
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
                <Stat label="Montant final" value={fmt(c.refund_final_xof)} />
                {c.refund_method && (
                  <div className="col-span-2">
                    <Stat label="Méthode" value={c.refund_method} />
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Notes internes */}
          <Section icon={<ClipboardList className="w-4 h-4" />} title="Notes internes">
            <textarea
              value={notes ?? c.internal_notes ?? ""}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
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
          </Section>

          {/* Historique du dossier */}
          <Section icon={<History className="w-4 h-4" />} title="Historique du dossier" right={`${actions.length}`}>
            {actions.length === 0 ? (
              <Empty label="Aucune action enregistrée" />
            ) : (
              <ul className="space-y-1.5 max-h-96 overflow-y-auto">
                {actions.map((a: any) => (
                  <li
                    key={a.id}
                    className="flex items-start gap-2 text-xs border-l-2 border-slate-200 pl-2 py-1"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-800">{actionLabel(a.action)}</div>
                      {a.payload && (
                        <div className="text-slate-500 truncate">{formatPayload(a.action, a.payload)}</div>
                      )}
                      <div className="text-slate-400">
                        {a.actor_email ?? "système"} · {fmtDate(a.created_at)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        {/* ─── COLONNE DROITE (contexte) ─── */}
        <aside className="space-y-4">
          {/* Commande & client */}
          <Section icon={<User className="w-4 h-4" />} title="Commande & client">
            {order ? (
              <dl className="space-y-1 text-sm">
                <Row k="N° commande" v={<span className="font-mono text-xs">{order.id.slice(0, 8)}…</span>} />
                <Row k="Client" v={order.customer_name ?? "—"} />
                <Row k="Téléphone" v={order.customer_phone ?? "—"} />
                <Row k="Adresse" v={order.address ?? "—"} />
                <Row k="Total commande" v={<span className="font-bold">{fmt(orderTotal)}</span>} />
                <Row k="Statut" v={<span className="font-medium">{order.status}</span>} />
                <Row k="Créée le" v={fmtDate(order.created_at)} />
              </dl>
            ) : (
              <div className="text-sm text-slate-500">Commande introuvable.</div>
            )}
          </Section>

          {/* Paiements client */}
          <Section icon={<Banknote className="w-4 h-4" />} title="Paiements client">
            <div className="grid grid-cols-3 gap-2 mb-3">
              <Stat label="Total cmd" value={fmt(orderTotal)} small />
              <Stat label="Payé" value={fmt(totalPaid)} small />
              <Stat
                label="Reste"
                value={fmt(remainingToPay)}
                small
                highlight={remainingToPay > 0}
              />
            </div>
            {payments.length === 0 ? (
              <Empty label="Aucun paiement enregistré" />
            ) : (
              <ul className="divide-y text-sm">
                {payments.map((p: any) => (
                  <li key={p.id} className="py-2">
                    <div className="flex justify-between">
                      <span className="font-semibold">{fmt(p.amount)}</span>
                      <span className="text-xs text-slate-500">{p.method ?? "—"}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {fmtDate(p.created_at)}
                      {p.admin_name ? ` · ${p.admin_name}` : ""}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Autres articles de la commande */}
          <Section icon={<Package className="w-4 h-4" />} title="Autres articles">
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
                        <span>Qté {oi.quantity} × {fmt(oi.unit_price)}</span>
                        {inCase && (
                          <span className="text-amber-700 font-semibold">Dans ce dossier</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {/* Historique de la commande */}
          <Section icon={<History className="w-4 h-4" />} title="Historique commande" right={`${orderTimeline.length}`}>
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
          </Section>
        </aside>
      </div>
    </div>
  );
}

// ─── Petits composants ────────────────────────────────
function Section({
  icon, title, right, children,
}: { icon: React.ReactNode; title: string; right?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border rounded-xl">
      <header className="px-3 sm:px-4 py-2.5 border-b flex items-center justify-between">
        <h2 className="font-semibold text-sm flex items-center gap-2">{icon} {title}</h2>
        {right && <span className="text-xs text-slate-500">{right}</span>}
      </header>
      <div className="px-3 sm:px-4 py-3">{children}</div>
    </section>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="py-4 text-center text-xs text-slate-400 flex flex-col items-center gap-1">
      <AlertCircle className="w-4 h-4" /> {label}
    </div>
  );
}

function Stat({ label, value, highlight, small }: {
  label: string; value: React.ReactNode; highlight?: boolean; small?: boolean;
}) {
  return (
    <div
      className={`rounded p-2 text-center border ${
        highlight
          ? "bg-emerald-50 border-emerald-200"
          : "bg-slate-50 border-slate-200"
      }`}
    >
      <div className={`${small ? "text-[10px]" : "text-xs"} ${highlight ? "text-emerald-700" : "text-slate-500"}`}>
        {label}
      </div>
      <div className={`font-bold ${small ? "text-xs" : "text-sm"} ${highlight ? "text-emerald-800" : "text-slate-800"}`}>
        {value}
      </div>
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
