import { useState } from "react";
import {
  Package, ChevronRight, AlertTriangle, CheckCircle2,
  CircleDot, Ban, ArrowDownToLine, ShieldAlert, RefreshCw,
} from "lucide-react";
import {
  ARTICLE_STATUS_COLORS, getOrderMixType, STOCK_BREAK_ACTIONS,
  canSignalBreak, canChangeArticleStatus, canPartialDeliver, canOverrideDecision,
  isArticleLocked, isOrderLocked, getDecisionBadge,
  getArticleStatusLabel, getNextArticleSteps, getArticleBusinessState,
  BUSINESS_STATE_LABELS, BUSINESS_STATE_COLORS,
  isWaitingRestock,
  IMPORT_STATUS_LABELS, LOCAL_STATUS_LABELS, ARTICLE_STATUS_LABELS,
} from "@/cockpit/lib/article-states";
import type { OrderArticle, ArticleStatus } from "@/cockpit/lib/article-states";
import { StockBreakDialog, type StockBreakSubmit } from "./StockBreakDialog";
import { DecisionOverrideDialog } from "./DecisionOverrideDialog";
import { useAuth } from "@/hooks/use-auth";

const STATUS_ICONS: Partial<Record<ArticleStatus, React.ElementType>> = {
  delivered: CheckCircle2,
  no_stock: Ban,
  ordered: ArrowDownToLine,
  ready: CheckCircle2,
};

interface Props {
  articles: OrderArticle[];
  onStockBreak?: (productId: string, data: StockBreakSubmit) => void;
  onStatusChange?: (productId: string, status: ArticleStatus) => void;
  onPartialDeliver?: (productId: string, qty: number) => void;
  /** Modification d'une décision déjà résolue (Super Admin uniquement). */
  onOverrideDecision?: (productId: string, data: StockBreakSubmit, overrideReason: string) => void;
  paidAmount?: number;
  orderStatus?: string;
}

export function ArticlesPanel({
  articles, onStockBreak, onStatusChange, onPartialDeliver, onOverrideDecision,
  paidAmount = 0, orderStatus,
}: Props) {
  const { isSuperAdmin, profile } = useAuth();
  const adminName = profile?.full_name ?? profile?.email ?? "Super Admin";

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stockBreakProduct, setStockBreakProduct] = useState<OrderArticle | null>(null);
  const [overrideProduct, setOverrideProduct] = useState<OrderArticle | null>(null);
  const [overrideDraft, setOverrideDraft] = useState<StockBreakSubmit | null>(null);
  const [overrideStep, setOverrideStep] = useState<"choose" | "confirm">("choose");
  const [partialQty, setPartialQty] = useState<Record<string, string>>({});

  if (!articles || articles.length === 0) return null;

  const sortedArticles = [...articles].sort((a, b) => {
    if (a.is_local && !b.is_local) return -1;
    if (!a.is_local && b.is_local) return 1;
    return 0;
  });

  const mixType = getOrderMixType(articles);
  const hasBreak = articles.some(a => a.stock_break && !a.stock_break.resolved);
  const deliveredCount = articles.reduce((s, a) => s + (a.delivered_qty ?? 0), 0);
  const totalQty = articles.reduce((s, a) => s + a.quantity, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Articles ({articles.length})
        </h4>
        <div className="flex items-center gap-2">
          {mixType === "mixte" && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-100 to-emerald-100 text-indigo-700 border border-indigo-200">
              MIXTE
            </span>
          )}
          {hasBreak && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-600 text-white flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Rupture
            </span>
          )}
          {deliveredCount > 0 && deliveredCount < totalQty && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">
              {deliveredCount}/{totalQty} livré
            </span>
          )}
        </div>
      </div>

      {sortedArticles.map((art) => {
        const isExpanded = expandedId === art.product_id;
        const StatusIcon = STATUS_ICONS[art.status] ?? CircleDot;
        const isBreakUnresolved = art.stock_break && !art.stock_break.resolved;
        const isDelivered = (art.delivered_qty ?? 0) >= art.quantity;
        const partialDelivered = (art.delivered_qty ?? 0) > 0 && (art.delivered_qty ?? 0) < art.quantity;
        const decisionBadge = getDecisionBadge(art);
        const locked = isArticleLocked(art, orderStatus);
        const showSignal = canSignalBreak(art, orderStatus);
        const showStatusChange = canChangeArticleStatus(art, orderStatus);
        const showPartial = canPartialDeliver(art, orderStatus);
        const showOverride = canOverrideDecision(art, orderStatus, isSuperAdmin);

        return (
          <div
            key={art.product_id}
            className={`rounded-xl border transition-all ${
              isBreakUnresolved ? "border-red-300 bg-red-50/40" :
              isDelivered ? "border-emerald-200 bg-emerald-50/30" :
              "border-gray-200 bg-white"
            }`}
          >
            <button
              onClick={() => setExpandedId(isExpanded ? null : art.product_id)}
              className="w-full flex items-start gap-2.5 p-2.5 text-left"
            >
              <div className="shrink-0 w-12 h-12 bg-gray-100 rounded-lg overflow-hidden">
                {art.product_image ? (
                  <img src={art.product_image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <Package className="h-5 w-5" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold truncate">{art.product_name}</div>
                {art.variant_label && (
                  <div className="text-[10px] text-gray-400">{art.variant_label}</div>
                )}
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                    art.is_import ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700"
                  }`}>
                    {art.is_import ? `IMP ${art.origin_country_flag ?? ""} ${art.origin_country ?? ""}`.trim() : "LOC"}
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${ARTICLE_STATUS_COLORS[art.status]}`}>
                    {getArticleStatusLabel(art)}
                  </span>
                  <span className="text-[10px] text-gray-500">x{art.quantity}</span>
                  {/* Badge ÉTAT MÉTIER (toujours visible, statique) */}
                  {(() => {
                    const bs = getArticleBusinessState(art);
                    if (bs === "active" || bs === "delivered") return null;
                    return (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${BUSINESS_STATE_COLORS[bs]}`}>
                        {BUSINESS_STATE_LABELS[bs]}
                      </span>
                    );
                  })()}
                  {/* Badge décision détaillé (delta financier replace) */}
                  {decisionBadge && art.stock_break?.action === "replace" && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${decisionBadge.className}`}>
                      {decisionBadge.label}
                    </span>
                  )}
                </div>
              </div>

              <ChevronRight className={`h-4 w-4 text-gray-300 shrink-0 mt-2 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
            </button>

            {isExpanded && (
              <div className="px-2.5 pb-2.5 space-y-2 border-t border-gray-100 pt-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-500">Prix unitaire</span>
                  <span className="font-medium">{art.unit_price.toLocaleString("fr-FR")} FCFA</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-500">Total ligne</span>
                  <span className="font-bold">{art.line_total.toLocaleString("fr-FR")} FCFA</span>
                </div>

                {partialDelivered && (
                  <div className="bg-teal-50 border border-teal-200 rounded-lg p-2 text-[10px] text-teal-700">
                    Livré partiellement : {art.delivered_qty}/{art.quantity}
                  </div>
                )}

                {art.stock_break && (
                  <div className={`rounded-lg p-2.5 text-[11px] space-y-1 ${
                    art.stock_break.resolved ? "bg-gray-50 border border-gray-200" : "bg-red-50 border border-red-200"
                  }`}>
                    <div className={`font-semibold flex items-center gap-1 ${art.stock_break.resolved ? "text-gray-700" : "text-red-700"}`}>
                      <Ban className="h-3 w-3" />
                      {art.stock_break.resolved ? "Décision validée" : "Rupture en cours"}
                    </div>
                    <div className="text-gray-600">{art.stock_break.reason}</div>
                    <div className="text-gray-500">
                      Action : {STOCK_BREAK_ACTIONS.find(a => a.key === art.stock_break!.action)?.label}
                    </div>
                    {art.stock_break.replacement && (
                      <div className="text-violet-700">
                        → {art.stock_break.replacement.product_name} @ {art.stock_break.replacement.new_unit_price.toLocaleString("fr-FR")} FCFA
                      </div>
                    )}
                    {art.stock_break.override_history && art.stock_break.override_history.length > 0 && (
                      <div className="pt-1 border-t border-gray-200 text-[10px] text-amber-700">
                        {art.stock_break.override_history.length} modification(s) Super Admin
                      </div>
                    )}
                  </div>
                )}

                {/* ── Actions selon la matrice v3 (verrous stricts par type LOCAL/IMPORT) ── */}
                {locked ? (
                  <div className="text-[10px] text-gray-400 italic pt-1">
                    {isOrderLocked(orderStatus)
                      ? orderStatus === "delivered" ? "Commande livrée — aucune action possible" : "Commande annulée — aucune action possible"
                      : `Article ${getArticleStatusLabel(art).toLowerCase()} — aucune action possible`}
                  </div>
                ) : (
                  <div className="space-y-2 pt-1">
                    {/* RUPTURE OUVERTE — verrou exclusif : aucune action normale */}
                    {isBreakUnresolved ? (
                      <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3 space-y-2">
                        <div className="text-[11px] font-bold text-red-800 flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Rupture en cours — résolution obligatoire
                        </div>
                        <div className="text-[10px] text-red-700">
                          Toutes les actions normales sont gelées tant que la rupture n'est pas résolue.
                        </div>
                        {onStockBreak && (
                          <button
                            onClick={() => setStockBreakProduct(art)}
                            className="w-full px-3 py-2.5 rounded-lg bg-red-600 text-white text-[12px] font-bold hover:bg-red-700 min-h-[40px]"
                          >
                            Résoudre la rupture
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        {showSignal && onStockBreak && (
                          <button
                            onClick={() => setStockBreakProduct(art)}
                            className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-red-200 text-[12px] font-medium text-red-600 hover:bg-red-50 transition-colors min-h-[40px]"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Signaler rupture de stock
                          </button>
                        )}

                        {/* Reprise après réappro (wait_restock résolu) */}
                        {canResumeFromRestock(art, orderStatus) && onStatusChange && (
                          <button
                            onClick={() => onStatusChange(art.product_id, getResumeTargetStatus(art))}
                            className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-teal-600 text-white text-[12px] font-bold hover:bg-teal-700 min-h-[40px]"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Stock revenu — reprendre le flux
                          </button>
                        )}

                        {showPartial && onPartialDeliver && (
                          <div className="flex items-center gap-2">
                            <input
                              type="number" inputMode="numeric" min={1}
                              max={art.quantity - (art.delivered_qty ?? 0)}
                              value={partialQty[art.product_id] ?? ""}
                              onChange={e => setPartialQty(p => ({ ...p, [art.product_id]: e.target.value }))}
                              placeholder="Qty"
                              className="w-20 h-10 text-sm border rounded-lg px-2 text-center"
                            />
                            <button
                              onClick={() => {
                                const qty = parseInt(partialQty[art.product_id] ?? "0", 10);
                                if (qty > 0) { onPartialDeliver(art.product_id, qty); setPartialQty(p => ({ ...p, [art.product_id]: "" })); }
                              }}
                              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-teal-600 text-white text-[12px] font-semibold hover:bg-teal-700 min-h-[40px]"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Livrer {partialQty[art.product_id] || (art.quantity - (art.delivered_qty ?? 0))} / {art.quantity}
                            </button>
                          </div>
                        )}

                        {/* Prochaine étape — filtrée STRICTEMENT par type LOCAL/IMPORT */}
                        {showStatusChange && onStatusChange && (() => {
                          const next = getNextArticleSteps(art);
                          if (next.length === 0) return null;
                          const labelMap = art.is_import ? IMPORT_STATUS_LABELS : LOCAL_STATUS_LABELS;
                          return (
                            <div>
                              <div className="text-[9px] text-gray-400 mb-1.5">
                                Prochaine étape ({art.is_import ? "IMPORT" : "LOCAL"}) :
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {next.map(st => (
                                  <button key={st}
                                    onClick={() => onStatusChange(art.product_id, st)}
                                    className={`text-[11px] px-3 py-2 rounded-full font-semibold ${ARTICLE_STATUS_COLORS[st]} hover:opacity-80 min-h-[36px]`}>
                                    {labelMap[st] ?? ARTICLE_STATUS_LABELS[st]}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    )}

                    {/* Bouton Super Admin — toujours disponible si décision résolue */}
                    {showOverride && onOverrideDecision && (
                      <button
                        onClick={() => { setOverrideProduct(art); setOverrideStep("choose"); setOverrideDraft(null); }}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border-2 border-amber-300 text-[12px] font-bold text-amber-700 hover:bg-amber-50 min-h-[40px]"
                      >
                        <ShieldAlert className="h-3.5 w-3.5" />
                        Modifier la décision (Super Admin)
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Dialog rupture standard */}
      {stockBreakProduct && (
        <StockBreakDialog
          open={!!stockBreakProduct}
          productName={stockBreakProduct.product_name}
          variantLabel={stockBreakProduct.variant_label}
          unitPrice={stockBreakProduct.unit_price}
          quantity={stockBreakProduct.quantity}
          paidAmount={paidAmount}
          onClose={() => setStockBreakProduct(null)}
          onConfirm={(data) => {
            onStockBreak?.(stockBreakProduct.product_id, data);
            setStockBreakProduct(null);
          }}
        />
      )}

      {/* Override Super Admin : étape 1 = nouveau choix, étape 2 = confirmation */}
      {overrideProduct && overrideStep === "choose" && (
        <StockBreakDialog
          open
          productName={overrideProduct.product_name}
          variantLabel={overrideProduct.variant_label}
          unitPrice={overrideProduct.unit_price}
          quantity={overrideProduct.quantity}
          paidAmount={paidAmount}
          initialReason={overrideProduct.stock_break?.reason}
          initialAction={overrideProduct.stock_break?.action}
          onClose={() => setOverrideProduct(null)}
          onConfirm={(data) => { setOverrideDraft(data); setOverrideStep("confirm"); }}
        />
      )}
      {overrideProduct && overrideStep === "confirm" && (
        <DecisionOverrideDialog
          open
          article={overrideProduct}
          newDecision={overrideDraft}
          adminName={adminName}
          onClose={() => { setOverrideProduct(null); setOverrideDraft(null); setOverrideStep("choose"); }}
          onConfirm={(overrideReason) => {
            if (overrideDraft) onOverrideDecision?.(overrideProduct.product_id, overrideDraft, overrideReason);
            setOverrideProduct(null); setOverrideDraft(null); setOverrideStep("choose");
          }}
        />
      )}
    </div>
  );
}
