// @ts-nocheck
import { useState } from "react";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkflowStepBar } from "./WorkflowStepBar";
import { CustomerBadge } from "./CustomerBadge";
import {
  fmtF, fmtFees, fmtRemaining, getOrderTypeLabel, getDaysBadgeColor, getPaymentBadgeVariant,
} from "@/lib/workflow.config";
import { recordShipmentPayment } from "@/lib/admin-logistics.functions";
import type { WorkflowRow } from "@/types/workflow";
import {
  Phone, MapPin, Calendar, Package, Receipt, Truck,
  Plus, CreditCard, Banknote, Smartphone, History, User,
} from "lucide-react";

interface Props {
  row: WorkflowRow | null;
  onClose: () => void;
}

export function WorkflowDrawer({ row, onClose }: Props) {
  if (!row) return null;

  const typeLabel = getOrderTypeLabel(row.order_type);
  const remainingInfo = fmtRemaining(row.amount_remaining);
  const paymentBadge = getPaymentBadgeVariant(row);
  const whatsappUrl = row.customer_phone
    ? `https://wa.me/${row.customer_phone.replace(/\D/g, "")}` : null;

  return (
    <Drawer open={!!row} onClose={onClose}>
      <DrawerContent className="max-h-[92vh]">
        <DrawerHeader className="border-b pb-3">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-[10px] font-bold text-white ${typeLabel.color}`}>
              {typeLabel.icon}
            </span>
            <DrawerTitle className="text-base">
              #{row.order_id?.slice(-4)} · {row.order_id?.slice(0, 8)}…
            </DrawerTitle>
            {row.days_pending > 0 && (
              <Badge className={`text-[10px] ${getDaysBadgeColor(row.days_pending)}`}>
                {row.days_pending}j
              </Badge>
            )}
          </div>
        </DrawerHeader>

        <div className="px-4 py-4 space-y-5 overflow-y-auto">

          {/* ── CLIENT ── */}
          <section className="space-y-2">
            <h3 className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center gap-1">
              <User className="h-3 w-3" /> Client
            </h3>
            <div className="bg-muted/30 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{row.customer_name ?? "—"}</span>
                {row.customer && <CustomerBadge customer={row.customer} />}
              </div>
              {row.customer_phone && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  <span>{row.customer_phone}</span>
                  {whatsappUrl && (
                    <a href={whatsappUrl} target="_blank" rel="noopener noreferrer"
                      className="text-emerald-600 hover:underline ml-2 font-medium">
                      WhatsApp →
                    </a>
                  )}
                </div>
              )}
              {row.customer_address && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  <span>{row.customer_address}{row.customer_city ? `, ${row.customer_city}` : ""}</span>
                </div>
              )}
              {/* Compte client rapide */}
              {row.customer && (
                <div className="border-t pt-2 mt-1 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-xs font-bold">{row.customer.order_count ?? 1}</div>
                    <div className="text-[10px] text-muted-foreground">Commandes</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-emerald-600">{fmtF(row.customer.total_paid ?? 0)}</div>
                    <div className="text-[10px] text-muted-foreground">Payé</div>
                  </div>
                  <div>
                    <div className={`text-xs font-bold ${(row.customer.balance_due ?? 0) > 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {fmtF(row.customer.balance_due ?? 0)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">Dette</div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ── WORKFLOW ── */}
          <section className="space-y-2">
            <h3 className="text-[10px] uppercase font-semibold text-muted-foreground">Workflow</h3>
            <WorkflowStepBar orderType={row.order_type} logisticsStatus={row.logistics_status} />
          </section>

          {/* ── FINANCES ── */}
          <section className="space-y-2">
            <h3 className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center gap-1">
              <Receipt className="h-3 w-3" /> Finances
            </h3>
            <div className="bg-muted/30 rounded-lg p-3 space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Produits</span><span className="font-medium">{fmtF(row.order_total ?? 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Frais transport</span><span className="font-medium">{fmtFees(row.total_shipping_fees)}</span></div>
              {row.air_freight_fee && row.air_freight_fee > 0 && (
                <div className="flex justify-between text-muted-foreground pl-2"><span>└ Avion</span><span>{fmtF(row.air_freight_fee)}</span></div>
              )}
              {row.service_fee && row.service_fee > 0 && (
                <div className="flex justify-between text-muted-foreground pl-2"><span>└ Service</span><span>{fmtF(row.service_fee)}</span></div>
              )}
              <div className="border-t pt-1.5 flex justify-between font-bold text-sm">
                <span>Total</span><span>{fmtF((row.order_total ?? 0) + (row.total_shipping_fees ?? 0))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payé</span>
                <span className="font-semibold text-emerald-700">{fmtF(row.amount_paid)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reste</span>
                <span className={`font-bold ${remainingInfo.alert ? "text-red-600" : "text-emerald-700"}`}>{remainingInfo.text}</span>
              </div>
              <div className="pt-1">
                <Badge variant="outline" className={`text-[10px] ${paymentBadge.color}`}>{paymentBadge.label}</Badge>
              </div>
            </div>
          </section>

          {/* ── HISTORIQUE PAIEMENTS ── */}
          {row.amount_paid && row.amount_paid > 0 && (
            <section className="space-y-2">
              <h3 className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center gap-1">
                <History className="h-3 w-3" /> Paiements reçus
              </h3>
              <div className="bg-emerald-50/50 border border-emerald-100 rounded-lg p-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-emerald-700 font-medium">Total payé</span>
                  <span className="text-sm font-bold text-emerald-700">{fmtF(row.amount_paid)}</span>
                </div>
                {row.payment_reference && (
                  <div className="text-[10px] text-emerald-600 mt-1">
                    Réf: {row.payment_reference}
                  </div>
                )}
                {row.payment_method && (
                  <div className="text-[10px] text-emerald-600">
                    Méthode: {row.payment_method}
                  </div>
                )}
                {row.confirmed_at && (
                  <div className="text-[10px] text-emerald-600">
                    Confirmé le: {new Date(row.confirmed_at).toLocaleDateString("fr-FR")}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── AJOUTER PAIEMENT ── */}
          <PaymentSection row={row} />

          {/* ── LOGISTIQUE ── */}
          {(row.real_weight_kg || row.tracking_number) && (
            <section className="space-y-2">
              <h3 className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center gap-1">
                <Truck className="h-3 w-3" /> Logistique
              </h3>
              <div className="bg-muted/30 rounded-lg p-3 space-y-1 text-xs">
                {row.real_weight_kg && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Poids réel</span><span>{row.real_weight_kg} kg</span></div>
                )}
                {row.volumetric_weight_kg && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Volumétrique</span><span>{row.volumetric_weight_kg} kg</span></div>
                )}
                {row.chargeable_weight_kg && (
                  <div className="flex justify-between font-medium"><span>Facturable</span><span>{row.chargeable_weight_kg} kg</span></div>
                )}
                {row.tracking_number && (
                  <>
                    <div className="flex justify-between"><span className="text-muted-foreground">Tracking</span><span className="font-mono">{row.tracking_number}</span></div>
                    {row.tracking_url && (
                      <a href={row.tracking_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">Suivre le colis →</a>
                    )}
                  </>
                )}
              </div>
            </section>
          )}

          {/* ── DATES ── */}
          <section className="space-y-2">
            <h3 className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Dates
            </h3>
            <div className="text-xs space-y-1 text-muted-foreground">
              {row.order_created_at && (
                <div className="flex justify-between"><span>Création</span><span>{new Date(row.order_created_at).toLocaleDateString("fr-FR")}</span></div>
              )}
              {row.warehouse_received_at && (
                <div className="flex justify-between"><span>Réception</span><span>{new Date(row.warehouse_received_at).toLocaleDateString("fr-FR")}</span></div>
              )}
              {row.weighed_at && (
                <div className="flex justify-between"><span>Pesée</span><span>{new Date(row.weighed_at).toLocaleDateString("fr-FR")}</span></div>
              )}
              {row.shipped_at && (
                <div className="flex justify-between"><span>Expédition</span><span>{new Date(row.shipped_at).toLocaleDateString("fr-FR")}</span></div>
              )}
            </div>
          </section>

          {/* ── PHOTO / COMMENTAIRES ── */}
          {row.parcel_photo_url && (
            <section>
              <h3 className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center gap-1 mb-1">
                <Package className="h-3 w-3" /> Photo
              </h3>
              <img src={row.parcel_photo_url} alt="Colis" className="h-32 w-32 rounded-lg border object-cover" />
            </section>
          )}
          {row.admin_comment && (
            <section className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <h3 className="text-[10px] uppercase font-semibold text-amber-700">Commentaire admin</h3>
              <p className="text-xs text-amber-800 mt-1">{row.admin_comment}</p>
            </section>
          )}
          {row.client_response_note && (
            <section className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <h3 className="text-[10px] uppercase font-semibold text-purple-700">Réponse client</h3>
              <p className="text-xs text-purple-800 mt-1">{row.client_response_note}</p>
            </section>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SECTION PAIEMENT — Ajout rapide depuis le drawer
   ═══════════════════════════════════════════════════════════════ */

function PaymentSection({ row }: { row: WorkflowRow }) {
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"wave" | "om" | "cash" | "other">("wave");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const remaining = row.amount_remaining ?? 0;
  if (remaining <= 0) return null; // Rien à payer

  const handleSubmit = async () => {
    const n = parseInt(amount.replace(/\D/g, ""));
    if (!n || n <= 0) return;
    setLoading(true);
    try {
      await recordShipmentPayment({
        data: {
          order_id: row.order_id,
          amount: n,
          payment_method: method,
          payment_reference: note || `${method.toUpperCase()} - ${new Date().toLocaleDateString("fr-FR")}`,
        },
      });
      setShowForm(false);
      setAmount("");
      setNote("");
      // La mutation invalide le cache, le montant se mettra à jour
    } catch (e) {
      console.error("Paiement échoué:", e);
    } finally {
      setLoading(false);
    }
  };

  const methods: { key: typeof method; label: string; icon: React.ReactNode }[] = [
    { key: "wave", label: "Wave", icon: <Smartphone className="h-3.5 w-3.5" /> },
    { key: "om", label: "Orange Money", icon: <Smartphone className="h-3.5 w-3.5" /> },
    { key: "cash", label: "Espèce", icon: <Banknote className="h-3.5 w-3.5" /> },
    { key: "other", label: "Autre", icon: <CreditCard className="h-3.5 w-3.5" /> },
  ];

  return (
    <section className="space-y-2">
      <h3 className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center gap-1">
        <Plus className="h-3 w-3" /> Ajouter un paiement
      </h3>

      {!showForm ? (
        <Button variant="outline" size="sm" className="w-full h-9 text-xs" onClick={() => setShowForm(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Enregistrer un paiement ({fmtF(remaining)} restants)
        </Button>
      ) : (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-3">
          {/* Montant */}
          <div>
            <label className="text-[10px] font-medium text-emerald-700 mb-1 block">Montant (FCFA)</label>
            <Input
              type="number"
              placeholder="Ex: 50000"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="h-8 text-sm"
              autoFocus
            />
          </div>

          {/* Méthode */}
          <div>
            <label className="text-[10px] font-medium text-emerald-700 mb-1 block">Méthode</label>
            <div className="flex gap-1.5 flex-wrap">
              {methods.map(m => (
                <button
                  key={m.key}
                  onClick={() => setMethod(m.key)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium border transition-colors ${
                    method === m.key
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                  }`}
                >
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Commentaire */}
          <div>
            <label className="text-[10px] font-medium text-emerald-700 mb-1 block">Commentaire</label>
            <Input
              type="text"
              placeholder="Ex: Transfert WhatsApp de Mamadou"
              value={note}
              onChange={e => setNote(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button size="sm" className="h-8 text-xs flex-1" onClick={handleSubmit} disabled={loading || !amount}>
              {loading ? "Enregistrement…" : `Enregistrer ${amount ? fmtF(parseInt(amount) || 0) : ""}`}
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setShowForm(false)}>
              Annuler
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
