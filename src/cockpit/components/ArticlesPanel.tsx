import { useState } from "react";
import {
  Package, ChevronRight, AlertTriangle, CheckCircle2,
  CircleDot, Ban, RotateCcw, ArrowDownToLine,
} from "lucide-react";
import {
  ARTICLE_STATUS_LABELS, ARTICLE_STATUS_COLORS, getOrderMixType,
} from "@/cockpit/lib/article-states";
import type { OrderArticle, ArticleStatus, StockBreakAction } from "@/cockpit/lib/article-states";
import { StockBreakDialog } from "./StockBreakDialog";

const STATUS_ICONS: Partial<Record<ArticleStatus, React.ElementType>> = {
  delivered: CheckCircle2,
  no_stock: Ban,
  ordered: ArrowDownToLine,
  ready: CheckCircle2,
};

interface Props {
  articles: OrderArticle[];
  onStockBreak?: (productId: string, data: { reason: string; action: StockBreakAction }) => void;
  onStatusChange?: (productId: string, status: ArticleStatus) => void;
  onPartialDeliver?: (productId: string, qty: number) => void;
}

export function ArticlesPanel({ articles, onStockBreak, onStatusChange, onPartialDeliver }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stockBreakProduct, setStockBreakProduct] = useState<OrderArticle | null>(null);
  const [partialQty, setPartialQty] = useState<Record<string, string>>({});

  if (!articles || articles.length === 0) return null;

  const mixType = getOrderMixType(articles);
  const hasBreak = articles.some(a => a.stock_break && !a.stock_break.resolved);
  const deliveredCount = articles.reduce((s, a) => s + (a.delivered_qty ?? 0), 0);
  const totalQty = articles.reduce((s, a) => s + a.quantity, 0);

  return (
    <div className="space-y-3">
      {/* ─── En-tête : type mixte + résumé ─── */}
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
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
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

      {/* ─── Liste des articles ─── */}
      {articles.map((art) => {
        const isExpanded = expandedId === art.product_id;
        const StatusIcon = STATUS_ICONS[art.status] ?? CircleDot;
        const isBreak = art.stock_break && !art.stock_break.resolved;
        const isDelivered = (art.delivered_qty ?? 0) >= art.quantity;
        const partialDelivered = (art.delivered_qty ?? 0) > 0 && (art.delivered_qty ?? 0) < art.quantity;

        return (
          <div
            key={art.product_id}
            className={`rounded-xl border transition-all ${
              isBreak ? "border-red-200 bg-red-50/30" :
              isDelivered ? "border-emerald-200 bg-emerald-50/30" :
              "border-gray-200 bg-white"
            }`}
          >
            {/* ── Ligne principale ── */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : art.product_id)}
              className="w-full flex items-start gap-2.5 p-2.5 text-left"
            >
              {/* Image */}
              <div className="shrink-0 w-12 h-12 bg-gray-100 rounded-lg overflow-hidden">
                {art.product_image ? (
                  <img src={art.product_image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <Package className="h-5 w-5" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold truncate">{art.product_name}</div>
                {art.variant_label && (
                  <div className="text-[10px] text-gray-400">{art.variant_label}</div>
                )}
                <div className="flex items-center gap-2 mt-1">
                  {/* Badge type IMP/LOC */}
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                    art.is_import ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700"
                  }`}>
                    {art.is_import ? "IMP" : "LOC"}
                  </span>
                  {/* Badge statut */}
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${ARTICLE_STATUS_COLORS[art.status]}`}>
                    {ARTICLE_STATUS_LABELS[art.status]}
                  </span>
                  {/* Qty */}
                  <span className="text-[10px] text-gray-500">
                    x{art.quantity}
                  </span>
                </div>
              </div>

              {/* Flèche */}
              <ChevronRight className={`h-4 w-4 text-gray-300 shrink-0 mt-2 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
            </button>

            {/* ── Détail déplié ── */}
            {isExpanded && (
              <div className="px-2.5 pb-2.5 space-y-2 border-t border-gray-100 pt-2">
                {/* Prix */}
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-500">Prix unitaire</span>
                  <span className="font-medium">{art.unit_price.toLocaleString("fr-FR")} FCFA</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-500">Total ligne</span>
                  <span className="font-bold">{art.line_total.toLocaleString("fr-FR")} FCFA</span>
                </div>

                {/* Livraison partielle */}
                {partialDelivered && (
                  <div className="bg-teal-50 border border-teal-200 rounded-lg p-2 text-[10px] text-teal-700">
                    Livré partiellement : {art.delivered_qty}/{art.quantity}
                  </div>
                )}

                {/* Rupture de stock info */}
                {art.stock_break && (
                  <div className={`rounded-lg p-2.5 text-[11px] space-y-1 ${
                    art.stock_break.resolved ? "bg-gray-100 border border-gray-200" : "bg-red-50 border border-red-200"
                  }`}>
                    <div className="font-semibold text-red-700 flex items-center gap-1">
                      <Ban className="h-3 w-3" />
                      Rupture de stock
                      {art.stock_break.resolved && <span className="text-gray-500">(résolu)</span>}
                    </div>
                    <div className="text-gray-600">{art.stock_break.reason}</div>
                    <div className="text-gray-500">
                      Action : {STOCK_BREAK_ACTIONS.find(a => a.key === art.stock_break!.action)?.label ?? art.stock_break.action}
                    </div>
                  </div>
                )}

                {/* ── Actions contextuelles ── */}
                <div className="space-y-2 pt-1">
                  {/* 
                    LOGIQUE : 
                    1. Rupture stock → toujours dispo (action d'urgence)
                    2. Livrer → seulement si article est Prêt/Disponible/Reçu
                    3. Changer état → seulement les transitions logiques
                  */}

                  {/* (1) Rupture stock — toujours visible */}
                  {!art.stock_break && onStockBreak && (
                    <button
                      onClick={() => setStockBreakProduct(art)}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-[11px] font-medium text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Signaler rupture de stock
                    </button>
                  )}

                  {/* (2) Livrer — SEULEMENT si l'article est prêt */}
                  {!isDelivered && onPartialDeliver && ["ready", "available", "received"].includes(art.status) && (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={art.quantity - (art.delivered_qty ?? 0)}
                        value={partialQty[art.product_id] ?? ""}
                        onChange={e => setPartialQty(prev => ({ ...prev, [art.product_id]: e.target.value }))}
                        placeholder="Qty"
                        className="w-16 h-9 text-[11px] border rounded-lg px-2 text-center"
                      />
                      <button
                        onClick={() => {
                          const qty = parseInt(partialQty[art.product_id] ?? "0", 10);
                          if (qty > 0) { onPartialDeliver(art.product_id, qty); setPartialQty(prev => ({ ...prev, [art.product_id]: "" })); }
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 text-white text-[11px] font-semibold hover:bg-teal-700 transition-colors"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Livrer {partialQty[art.product_id] || art.quantity} / {art.quantity}
                      </button>
                    </div>
                  )}

                  {/* (3) Changer état — transitions logiques uniquement */}
                  {onStatusChange && (
                    <div>
                      <div className="text-[9px] text-gray-400 mb-1.5">Prochaine étape :</div>
                      <div className="flex flex-wrap gap-1.5">
                        {(() => {
                          // Transitions logiques selon l'état actuel
                          const transitions: Record<ArticleStatus, ArticleStatus[]> = {
                            pending:     ["available", "ordered"],
                            available:   ["ready"],
                            ordered:     ["received"],
                            received:    ["ready"],
                            ready:       ["delivered"],
                            delivered:   [],
                            partial_stock: ["available", "ordered"],
                            no_stock:    ["available", "ordered"],
                            shipped:     ["delivered"],
                            returned:    ["pending"],
                            refunded:    [],
                          };
                          const nextStates = transitions[art.status] ?? [];
                          if (nextStates.length === 0) {
                            return <span className="text-[10px] text-gray-400 italic">Aucune action — article terminé</span>;
                          }
                          return nextStates.map(st => (
                            <button
                              key={st}
                              onClick={() => onStatusChange(art.product_id, st)}
                              className={`text-[10px] px-3 py-1.5 rounded-full font-semibold transition-colors ${ARTICLE_STATUS_COLORS[st]} hover:opacity-80`}
                            >
                              {ARTICLE_STATUS_LABELS[st]}
                            </button>
                          ));
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* ─── Dialog rupture de stock ─── */}
      {stockBreakProduct && (
        <StockBreakDialog
          open={!!stockBreakProduct}
          productName={stockBreakProduct.product_name}
          variantLabel={stockBreakProduct.variant_label}
          onClose={() => setStockBreakProduct(null)}
          onConfirm={(data) => {
            onStockBreak?.(stockBreakProduct.product_id, data);
            setStockBreakProduct(null);
          }}
        />
      )}
    </div>
  );
}
