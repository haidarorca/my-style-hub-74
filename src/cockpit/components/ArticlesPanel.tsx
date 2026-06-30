import { useMemo, useState } from "react";
import {
  Package, ChevronRight, AlertTriangle, CheckCircle2,
  CircleDot, Ban, ArrowDownToLine, ShieldAlert, CheckSquare, Square,
} from "lucide-react";
import {
  ARTICLE_STATUS_COLORS, STOCK_BREAK_ACTIONS,
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
import { ProductDetailDrawer } from "./ProductDetailDrawer";
import { ReturnArticleAction } from "./OpenReturnCaseButton";
import { BulkReturnBar } from "./BulkReturnBar";
import { useAuth } from "@/hooks/use-auth";

const STATUS_ICONS: Partial<Record<ArticleStatus, React.ElementType>> = {
  delivered: CheckCircle2,
  no_stock: Ban,
  ordered: ArrowDownToLine,
  ready: CheckCircle2,
};

interface Props {
  articles: OrderArticle[];
  orderId?: string;
  onStockBreak?: (productId: string, data: StockBreakSubmit) => void;
  onStatusChange?: (productId: string, status: ArticleStatus) => void;
  onPartialDeliver?: (productId: string, qty: number) => void;
  /** Modification d'une décision déjà résolue (Super Admin uniquement). */
  onOverrideDecision?: (productId: string, data: StockBreakSubmit, overrideReason: string) => void;
  paidAmount?: number;
  orderStatus?: string;
}

export function ArticlesPanel({
  articles, orderId, onStockBreak, onStatusChange, onPartialDeliver, onOverrideDecision,
  paidAmount = 0, orderStatus,
}: Props) {
  const { isSuperAdmin, profile } = useAuth();
  const adminName = profile?.full_name ?? profile?.email ?? "Super Admin";

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailArticle, setDetailArticle] = useState<OrderArticle | null>(null);
  const [stockBreakProduct, setStockBreakProduct] = useState<OrderArticle | null>(null);
  const [overrideProduct, setOverrideProduct] = useState<OrderArticle | null>(null);
  const [overrideDraft, setOverrideDraft] = useState<StockBreakSubmit | null>(null);
  const [overrideStep, setOverrideStep] = useState<"choose" | "confirm">("choose");
  const [partialQty, setPartialQty] = useState<Record<string, string>>({});

  // Mode sélection multi-articles (pour créer un dossier groupé Retour/Annulation)
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const keyOf = (a: OrderArticle) => `${a.product_id}::${a.variant_id ?? ""}`;

  if (!articles || articles.length === 0) return null;

  // Articles en attente de réappro non repris → traités dans RestockWaitingPanel (hors workflow normal)
  const visibleArticles = articles.filter(a => !isWaitingRestock(a));
  if (visibleArticles.length === 0) return null;

  const sortedArticles = [...visibleArticles].sort((a, b) => {
    if (a.is_local && !b.is_local) return -1;
    if (!a.is_local && b.is_local) return 1;
    return 0;
  });

  const hasBreak = visibleArticles.some(a => a.stock_break && !a.stock_break.resolved);
  const deliveredCount = visibleArticles.reduce((s, a) => s + (a.delivered_qty ?? 0), 0);
  const totalQty = visibleArticles.reduce((s, a) => s + a.quantity, 0);

  // Articles éligibles à un retour/annulation groupé (pas de rupture en cours)
  const eligibleForBulk = useMemo(
    () => sortedArticles.filter((a) => !(a.stock_break && !a.stock_break.resolved)),
    [sortedArticles],
  );
  const allSelected =
    eligibleForBulk.length > 0 && eligibleForBulk.every((a) => selectedKeys.has(keyOf(a)));
  const toggleSelect = (a: OrderArticle) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const k = keyOf(a);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };
  const toggleAll = () => {
    if (allSelected) setSelectedKeys(new Set());
    else setSelectedKeys(new Set(eligibleForBulk.map((a) => keyOf(a))));
  };
  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedKeys(new Set());
  };

  const selectedItems = useMemo(
    () =>
      sortedArticles
        .filter((a) => selectedKeys.has(keyOf(a)))
        .map((a) => ({ product_id: a.product_id, variant_id: a.variant_id })),
    [sortedArticles, selectedKeys],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Articles ({articles.length})
        </h4>
        <div className="flex items-center gap-2 flex-wrap">
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
          {orderId && eligibleForBulk.length > 1 && (
            !selectionMode ? (
              <button
                onClick={() => setSelectionMode(true)}
                className="text-[10px] font-semibold px-2 py-1 rounded-full border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 inline-flex items-center gap-1"
                title="Sélectionner plusieurs articles pour un dossier groupé"
              >
                <CheckSquare className="h-3 w-3" />
                Sélection multiple
              </button>
            ) : (
              <button
                onClick={toggleAll}
                className="text-[10px] font-semibold px-2 py-1 rounded-full border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 inline-flex items-center gap-1"
              >
                {allSelected ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3" />}
                {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
              </button>
            )
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
        const k = keyOf(art);
        const isSelected = selectedKeys.has(k);
        const canBulkSelect = !isBreakUnresolved;

        return (
          <div
            key={art.product_id}
            className={`rounded-xl border transition-all ${
              isSelected ? "border-amber-400 ring-2 ring-amber-200 bg-amber-50/40" :
              isBreakUnresolved ? "border-red-300 bg-red-50/40" :
              isDelivered ? "border-emerald-200 bg-emerald-50/30" :
              "border-gray-200 bg-white"
            }`}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                if (selectionMode && canBulkSelect) toggleSelect(art);
                else setDetailArticle(art);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (selectionMode && canBulkSelect) toggleSelect(art);
                  else setDetailArticle(art);
                }
              }}
              className="w-full flex items-start gap-2.5 p-2.5 text-left hover:bg-gray-50/60 rounded-t-xl transition-colors cursor-pointer"
              title={selectionMode ? "Cliquer pour sélectionner" : "Voir le détail du produit"}
            >
              {selectionMode && (
                <div className="shrink-0 pt-1">
                  {canBulkSelect ? (
                    isSelected ? (
                      <CheckSquare className="h-5 w-5 text-amber-600" />
                    ) : (
                      <Square className="h-5 w-5 text-slate-300" />
                    )
                  ) : (
                    <Square className="h-5 w-5 text-slate-200" />
                  )}
                </div>
              )}
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
                  <span className="text-[10px] text-gray-500 ml-auto font-semibold">{art.line_total.toLocaleString("fr-FR")} FCFA</span>
                  {(() => {
                    const bs = getArticleBusinessState(art);
                    if (bs === "active" || bs === "delivered") return null;
                    return (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${BUSINESS_STATE_COLORS[bs]}`}>
                        {BUSINESS_STATE_LABELS[bs]}
                      </span>
                    );
                  })()}
                  {decisionBadge && art.stock_break?.action === "replace" && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${decisionBadge.className}`}>
                      {decisionBadge.label}
                    </span>
                  )}
                </div>
              </div>
            </button>

            {/* Actions toujours visibles selon le statut métier — pas besoin d'expand */}
            {true && (
              <div className="px-2.5 pb-2.5 space-y-2 border-t border-gray-100 pt-2">

                {/* Détails prix/rupture déplacés dans ProductDetailDrawer (clic sur la ligne).
                    Seules les actions métier contextuelles restent ici. */}


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
                        {orderId && (
                          <ReturnArticleAction
                            orderId={orderId}
                            productId={art.product_id}
                            variantId={art.variant_id}
                          />
                        )}

                        {/* La reprise wait_restock est gérée dans RestockWaitingPanel — hors workflow normal. */}


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

      {/* Drawer détail produit (clic sur une ligne) */}
      <ProductDetailDrawer article={detailArticle} onClose={() => setDetailArticle(null)} />
    </div>
  );
}

