// ═══════════════════════════════════════════════════════════════
// /admin/returns/$caseId — Détail d'un dossier
//
// Disposition 2 colonnes :
//   ← ACTION    : articles concernés, frais, décision, clôture
//   → CONTEXTE  : commande complète (lecture seule)
//
// Aucun stock, aucune messagerie, aucune logique cachée.
// L'admin saisit le montant final. Le système calcule un conseillé.
// ═══════════════════════════════════════════════════════════════

import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getReturnCase,
  addCaseItem,
  removeCaseItem,
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
  Calculator,
  CheckCircle2,
  Lock,
  Package,
  Plus,
  Trash2,
  Undo2,
  XCircle,
} from "lucide-react";

export const Route = createFileRoute("/admin/returns/$caseId")({
  component: ReturnCaseDetailPage,
});

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return `${Number(n).toLocaleString("fr-FR")} FCFA`;
}

function ReturnCaseDetailPage() {
  const { caseId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const getFn = useServerFn(getReturnCase);
  const addItemFn = useServerFn(addCaseItem);
  const removeItemFn = useServerFn(removeCaseItem);
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
  const [feeAmount, setFeeAmount] = useState<string>("");
  const [decision, setDecision] = useState<ReturnDecision>("accepted");
  const [finalAmount, setFinalAmount] = useState<string>("");
  const [refundMethod, setRefundMethod] = useState("");
  const [notes, setNotes] = useState<string | null>(null);

  if (isLoading || !data) {
    return <div className="p-6 text-slate-500">Chargement…</div>;
  }

  const c = data.case;
  const items = data.items;
  const fees = data.fees;
  const order = data.order;
  const orderItems = data.order_items;

  const itemsTotal = items.reduce((s, it) => s + Number(it.quantity) * Number(it.unit_price_xof), 0);
  const feesTotal = fees.reduce((s, f) => s + Number(f.amount_xof), 0);
  const suggested = Math.max(0, itemsTotal - feesTotal);

  const isLocked = c.status === "closed" || c.status === "cancelled";

  const reload = () => qc.invalidateQueries({ queryKey: ["return-case", caseId] });

  // Articles disponibles à ajouter (pas encore dans le dossier)
  const usedItemIds = new Set(items.map((i) => i.order_item_id));
  const availableItems = (orderItems ?? []).filter((oi) => !usedItemIds.has(oi.id));

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-4">
      {/* En-tête */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link
            to="/admin/returns"
            className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" /> Centre Retours
          </Link>
          <h1 className="text-xl font-bold flex items-center gap-2">
            {c.kind === "return" ? (
              <Undo2 className="w-5 h-5 text-blue-600" />
            ) : (
              <XCircle className="w-5 h-5 text-rose-600" />
            )}
            <span className="font-mono">{c.code}</span>
            <StatusBadge status={c.status} />
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {!isLocked && (
            <>
              {c.status === "decided" && (
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
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ═══════ COLONNE ACTION ═══════ */}
        <div className="lg:col-span-2 space-y-4">
          {/* Articles concernés */}
          <section className="bg-white border rounded-xl">
            <header className="px-4 py-3 border-b flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2">
                <Package className="w-4 h-4" /> Articles concernés
              </h2>
              <span className="text-sm text-slate-500">{items.length} article(s)</span>
            </header>
            <div className="divide-y">
              {items.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-slate-500">
                  Aucun article dans ce dossier.
                </div>
              )}
              {items.map((it) => {
                const oi = it.order_item as any;
                return (
                  <div key={it.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <div className="font-medium text-sm">
                        {oi?.product_name ?? "Article"}
                      </div>
                      <div className="text-xs text-slate-500">
                        Qté {it.quantity} × {fmt(it.unit_price_xof)} ={" "}
                        <span className="font-semibold">
                          {fmt(it.quantity * it.unit_price_xof)}
                        </span>
                      </div>
                    </div>
                    {!isLocked && (
                      <button
                        onClick={async () => {
                          await removeItemFn({ data: { id: it.id } });
                          reload();
                        }}
                        className="text-rose-500 hover:bg-rose-50 p-1.5 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {!isLocked && availableItems.length > 0 && (
              <div className="px-4 py-3 border-t bg-slate-50">
                <div className="text-xs font-semibold text-slate-600 mb-2">
                  Ajouter un article de la commande :
                </div>
                <div className="space-y-1">
                  {availableItems.map((oi) => (
                    <button
                      key={oi.id}
                      onClick={async () => {
                        await addItemFn({
                          data: {
                            case_id: c.id,
                            order_item_id: oi.id,
                            quantity: oi.quantity,
                            unit_price_xof: oi.unit_price,
                          },
                        });
                        reload();
                      }}
                      className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-white border border-transparent hover:border-slate-200 flex items-center justify-between"
                    >
                      <span>
                        <Plus className="w-3 h-3 inline mr-1 text-emerald-600" />
                        {oi.product_name} — Qté {oi.quantity}
                      </span>
                      <span className="text-slate-500">{fmt(oi.unit_price)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Frais */}
          <section className="bg-white border rounded-xl">
            <header className="px-4 py-3 border-b">
              <h2 className="font-semibold flex items-center gap-2">
                <Calculator className="w-4 h-4" /> Frais liés au dossier
              </h2>
            </header>
            <div className="divide-y">
              {fees.length === 0 && (
                <div className="px-4 py-4 text-center text-sm text-slate-500">
                  Aucun frais saisi.
                </div>
              )}
              {fees.map((f) => (
                <div key={f.id} className="px-4 py-2 flex items-center justify-between gap-2">
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
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {!isLocked && (
              <div className="px-4 py-3 border-t bg-slate-50 flex flex-wrap items-center gap-2">
                <input
                  value={feeLabel}
                  onChange={(e) => setFeeLabel(e.target.value)}
                  placeholder="Libellé (ex. Livraison retour)"
                  className="flex-1 min-w-[180px] px-2 py-1.5 border rounded text-sm"
                />
                <input
                  value={feeAmount}
                  onChange={(e) => setFeeAmount(e.target.value)}
                  type="number"
                  min={0}
                  placeholder="Montant FCFA"
                  className="w-36 px-2 py-1.5 border rounded text-sm"
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
                  className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm font-semibold inline-flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" /> Ajouter
                </button>
              </div>
            )}
          </section>

          {/* Calcul + décision */}
          <section className="bg-white border rounded-xl p-4 space-y-3">
            <h2 className="font-semibold">Calcul & décision finale</h2>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="bg-slate-50 rounded p-2 text-center">
                <div className="text-xs text-slate-500">Total articles</div>
                <div className="font-bold">{fmt(itemsTotal)}</div>
              </div>
              <div className="bg-slate-50 rounded p-2 text-center">
                <div className="text-xs text-slate-500">Total frais</div>
                <div className="font-bold">− {fmt(feesTotal)}</div>
              </div>
              <div className="bg-emerald-50 rounded p-2 text-center border border-emerald-200">
                <div className="text-xs text-emerald-700">Conseillé</div>
                <div className="font-bold text-emerald-800">{fmt(suggested)}</div>
              </div>
            </div>

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
                  value={finalAmount}
                  onChange={(e) => setFinalAmount(e.target.value)}
                  placeholder={`Montant final (conseillé : ${suggested})`}
                  className="px-2 py-2 border rounded text-sm"
                />
                <input
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value)}
                  placeholder="Méthode (Wave, Cash, PayZ…)"
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
                <div className="bg-slate-50 rounded p-2">
                  <div className="text-xs text-slate-500">Décision</div>
                  <div className="font-semibold">
                    {c.decision === "accepted" && "Accepté"}
                    {c.decision === "partial" && "Partiel"}
                    {c.decision === "refused" && "Refusé"}
                    {!c.decision && "—"}
                  </div>
                </div>
                <div className="bg-slate-50 rounded p-2">
                  <div className="text-xs text-slate-500">Montant final</div>
                  <div className="font-semibold">{fmt(c.refund_final_xof)}</div>
                </div>
                {c.refund_method && (
                  <div className="bg-slate-50 rounded p-2 col-span-2">
                    <div className="text-xs text-slate-500">Méthode</div>
                    <div className="font-semibold">{c.refund_method}</div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Notes internes */}
          <section className="bg-white border rounded-xl p-4 space-y-2">
            <h2 className="font-semibold">Notes internes</h2>
            <textarea
              value={notes ?? c.internal_notes ?? ""}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              disabled={isLocked}
              className="w-full px-3 py-2 border rounded text-sm"
              placeholder="Trace des échanges WhatsApp, contexte, décisions, etc."
            />
            {!isLocked && (
              <div className="flex justify-end">
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
        </div>

        {/* ═══════ COLONNE CONTEXTE (lecture seule) ═══════ */}
        <aside className="space-y-4">
          <div className="bg-white border rounded-xl p-4">
            <h3 className="font-semibold mb-2 text-sm uppercase text-slate-500">
              Commande d'origine
            </h3>
            {order ? (
              <div className="space-y-1 text-sm">
                <div className="font-mono text-xs text-slate-500">{order.id}</div>
                <div>
                  <span className="text-slate-500">Client :</span>{" "}
                  <span className="font-medium">{order.customer_name ?? "—"}</span>
                </div>
                <div>
                  <span className="text-slate-500">Téléphone :</span>{" "}
                  {order.customer_phone ?? "—"}
                </div>
                <div>
                  <span className="text-slate-500">Adresse :</span>{" "}
                  {order.address ?? "—"}
                </div>
                <div>
                  <span className="text-slate-500">Total commande :</span>{" "}
                  <span className="font-bold">{fmt(order.total)}</span>
                </div>
                <div>
                  <span className="text-slate-500">Statut :</span>{" "}
                  <span className="font-medium">{order.status}</span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">Commande introuvable.</div>
            )}
          </div>

          <div className="bg-white border rounded-xl p-4">
            <h3 className="font-semibold mb-2 text-sm uppercase text-slate-500">
              Tous les articles de la commande
            </h3>
            <ul className="space-y-2 text-sm">
              {(orderItems ?? []).map((oi) => {
                const inCase = usedItemIds.has(oi.id);
                return (
                  <li
                    key={oi.id}
                    className={`p-2 rounded border ${
                      inCase
                        ? "bg-amber-50 border-amber-200"
                        : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div className="font-medium">{oi.product_name}</div>
                    <div className="text-xs text-slate-500 flex justify-between">
                      <span>Qté {oi.quantity} × {fmt(oi.unit_price)}</span>
                      {inCase && (
                        <span className="text-amber-700 font-semibold">
                          Dans ce dossier
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
      </div>
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
