import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkflowActions } from "@/hooks/use-workflow-actions";
import { useShippingServices } from "@/hooks/use-shipping-services";
import {
  CheckCircle2, Truck, DollarSign, Package, Send, Ban,
  Weight, CreditCard, Smartphone, Banknote, ChevronDown,
} from "lucide-react";
import type { WorkflowRow } from "@/types/workflow";
import { cn } from "@/lib/utils";

interface Props {
  row: WorkflowRow;
  onAction?: () => void;
}

/* ═══════════════════════════════════════════════════════════════
   WORKFLOW ACTION BUTTON — Bouton d'action contextuel
   Affiche la prochaine action logique selon le statut
   ═══════════════════════════════════════════════════════════════ */

export function WorkflowActionButton({ row, onAction }: Props) {
  const actions = useWorkflowActions();
  const [dialog, setDialog] = useState<"weigh" | "pay" | "ship" | "confirm" | "deliver" | "reject" | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAction = async (fn: () => Promise<void>) => {
    setLoading(true);
    try { await fn(); onAction?.(); } finally { setLoading(false); }
  };

  // ── LOCAL : new → confirmed → delivered ──
  if (row.order_type === "local") {
    if (row.logistics_status === "new" || row.logistics_status === null) {
      return (
        <>
          <Button size="sm" className="h-7 text-[11px] gap-1 bg-purple-600 hover:bg-purple-700" onClick={() => handleAction(() => actions.confirmOrder(row))} disabled={loading}>
            <CheckCircle2 className="h-3 w-3" />
            {loading ? "…" : "Confirmer"}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-red-500" onClick={() => setDialog("reject")}>
            <Ban className="h-3 w-3" />
          </Button>
          <RejectDialog open={dialog === "reject"} onClose={() => setDialog(null)} onConfirm={(reason) => handleAction(() => actions.rejectOrder(row, reason))} loading={loading} />
        </>
      );
    }
    if (row.logistics_status === "confirmed") {
      return (
        <>
          <Button size="sm" className="h-7 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialog("deliver")}>
            <Truck className="h-3 w-3" />
            Livrer
          </Button>
          <DeliverDialog open={dialog === "deliver"} onClose={() => setDialog(null)} onConfirm={() => handleAction(() => actions.markDelivered(row))} loading={loading} row={row} />
        </>
      );
    }
    return <StatusBadge status={row.logistics_status} />;
  }

  // ── IMPORT : 7-step workflow ──
  const declaredCircuit = row.weight_status === "declared" || row.weight_status === "verified" || row.weight_status === "anomaly";
  if (declaredCircuit && (row.logistics_status === null || row.logistics_status === "" || row.logistics_status === "awaiting_weighing")) {
    return (
      <span className="text-[10px] text-blue-700 font-medium px-2 py-1 bg-blue-50 border border-blue-200 rounded-full">
        À vérifier
      </span>
    );
  }

  switch (row.logistics_status) {
    case "awaiting_weighing":
    case null:
    case "":
      return (
        <>
          <Button size="sm" className="h-7 text-[11px] gap-1 bg-orange-600 hover:bg-orange-700" onClick={() => setDialog("weigh")}>
            <Weight className="h-3 w-3" />
            Peser
          </Button>
          <WeighDialog open={dialog === "weigh"} onClose={() => setDialog(null)} onConfirm={(data) => handleAction(() => actions.validateWeighing(row, data))} loading={loading} />
        </>
      );

    case "fees_calculated":
      // Circuit B — poids déjà déclaré : action interne « Vérifier »
      // qui court-circuite l'envoi au client (passe direct à ready_to_ship).
      if (declaredCircuit) {
        return (
          <span className="text-[10px] text-blue-700 font-medium px-2 py-1 bg-blue-50 border border-blue-200 rounded-full">
            À vérifier
          </span>
        );
      }
      // Circuit A — poids inconnu : envoyer les frais au client.
      return (
        <Button size="sm" className="h-7 text-[11px] gap-1 bg-blue-600 hover:bg-blue-700" onClick={() => handleAction(() => actions.sendFeesToClient(row))} disabled={loading}>
          <Send className="h-3 w-3" />
          {loading ? "…" : "Envoyer frais"}
        </Button>
      );

    case "awaiting_client_validation":
      return <StatusBadge status="awaiting_client_validation" label="Attente client" />;

    case "validated":
      return (
        <>
          {(row.amount_remaining ?? 0) > 0 && (
            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => setDialog("pay")}>
              <DollarSign className="h-3 w-3" />
              Paiement
            </Button>
          )}
          <Button size="sm" className="h-7 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => handleAction(() => actions.validatePayment(row))} disabled={loading}>
            <Package className="h-3 w-3" />
            {loading ? "…" : "Prêt"}
          </Button>
          <PaymentDialog open={dialog === "pay"} onClose={() => setDialog(null)} onConfirm={(data) => handleAction(() => actions.addPayment(row, data))} loading={loading} />
        </>
      );

    case "ready_to_ship":
      return (
        <>
          <Button size="sm" className="h-7 text-[11px] gap-1 bg-indigo-600 hover:bg-indigo-700" onClick={() => setDialog("ship")}>
            <Truck className="h-3 w-3" />
            Expédier
          </Button>
          <ShipDialog open={dialog === "ship"} onClose={() => setDialog(null)} onConfirm={(tracking) => handleAction(() => actions.shipOrder(row, tracking))} loading={loading} />
        </>
      );

    case "shipped":
      return <StatusBadge status="shipped" label="Expédiée" />;

    case "delivered":
      return <StatusBadge status="delivered" label="Livrée" />;

    case "rejected":
      return (
        <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => handleAction(() => actions.validateWeighing(row, { real_weight_kg: row.real_weight_kg ?? 0, volumetric_weight_kg: row.volumetric_weight_kg ?? 0, air_freight_fee: row.air_freight_fee ?? 0, service_fee: row.service_fee ?? 0 }))} disabled={loading}>
          <Weight className="h-3 w-3" />
          Re-peser
        </Button>
      );

    default:
      return <StatusBadge status={row.logistics_status} />;
  }
}

/* ── Status Badge (pas d'action) ── */
function StatusBadge({ status, label }: { status: string | null; label?: string }) {
  return (
    <span className="text-[10px] text-muted-foreground px-2 py-1 bg-gray-100 rounded-full">
      {label ?? status ?? "Nouvelle"}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DIALOGS — Modales de confirmation avec formulaire
   ═══════════════════════════════════════════════════════════════ */

// ── Confirmer livraison ──
function DeliverDialog({ open, onClose, onConfirm, loading, row }: { open: boolean; onClose: () => void; onConfirm: () => void; loading: boolean; row: WorkflowRow }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Truck className="h-5 w-5 text-emerald-600" /> Confirmer la livraison</DialogTitle>
          <DialogDescription>
            #{row.order_id?.slice(-4)} · {row.customer_name} · {fmtF(row.order_total ?? 0)}
          </DialogDescription>
        </DialogHeader>
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
          Cette action marquera la commande comme <strong>livrée</strong>. Le statut ne pourra plus être modifié.
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Annuler</Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={onConfirm} disabled={loading}>
            {loading ? "…" : "Confirmer la livraison"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Peser ──
function WeighDialog({ open, onClose, onConfirm, loading }: { open: boolean; onClose: () => void; onConfirm: (data: any) => void; loading: boolean }) {
  const [weight, setWeight] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const { services } = useShippingServices();
  const [serviceId, setServiceId] = useState("");

  const handleSubmit = () => {
    const w = parseFloat(weight);
    if (!w || w <= 0) return;
    const l = parseFloat(length) || 0;
    const wi = parseFloat(width) || 0;
    const h = parseFloat(height) || 0;
    const vol = (l * wi * h) / 5000;
    const chargeable = Math.max(w, vol);
    const svc = services.find((s) => s.id === serviceId);
    const pricePerKg = svc?.price_per_kg ?? 7500;
    const airFee = Math.round(chargeable * pricePerKg);
    const serviceFee = Math.round(airFee * 0.1);

    onConfirm({
      real_weight_kg: w,
      volumetric_weight_kg: vol,
      length_cm: l || undefined,
      width_cm: wi || undefined,
      height_cm: h || undefined,
      air_freight_fee: airFee,
      service_fee: serviceFee,
      shipping_service_id: serviceId || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Weight className="h-5 w-5 text-orange-600" /> Valider la pesée</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Poids réel (kg) *</Label>
              <Input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="2.5" className="h-8" />
            </div>
            <div>
              <Label className="text-xs">Service transport</Label>
              <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className="w-full h-8 text-xs border rounded-md px-2">
                <option value="">-- Choisir --</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.price_per_kg?.toLocaleString("fr-FR")} FCFA/kg)</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label className="text-xs">Longueur (cm)</Label><Input type="number" value={length} onChange={(e) => setLength(e.target.value)} placeholder="L" className="h-8" /></div>
            <div><Label className="text-xs">Largeur (cm)</Label><Input type="number" value={width} onChange={(e) => setWidth(e.target.value)} placeholder="l" className="h-8" /></div>
            <div><Label className="text-xs">Hauteur (cm)</Label><Input type="number" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="h" className="h-8" /></div>
          </div>
          {weight && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 text-xs text-orange-800">
              <div className="flex justify-between"><span>Frais avion (estimé)</span><span className="font-bold">{fmtF(Math.round(Math.max(parseFloat(weight) || 0, (parseFloat(length || "0") * parseFloat(width || "0") * parseFloat(height || "0")) / 5000) * (services.find((s) => s.id === serviceId)?.price_per_kg ?? 7500)))}</span></div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Annuler</Button>
          <Button size="sm" className="bg-orange-600 hover:bg-orange-700" onClick={handleSubmit} disabled={loading || !weight}>
            {loading ? "…" : "Valider la pesée"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Enregistrer paiement ──
function PaymentDialog({ open, onClose, onConfirm, loading }: { open: boolean; onClose: () => void; onConfirm: (data: any) => void; loading: boolean }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("wave");
  const [note, setNote] = useState("");

  const handleSubmit = () => {
    const n = parseInt(amount);
    if (!n || n <= 0) return;
    onConfirm({ amount: n, payment_method: method, payment_reference: note || `${method.toUpperCase()}` });
  };

  const methods = [
    { key: "wave", label: "Wave", icon: <Smartphone className="h-3.5 w-3.5" /> },
    { key: "orange_money", label: "Orange Money", icon: <Smartphone className="h-3.5 w-3.5" /> },
    { key: "cash", label: "Espèce", icon: <Banknote className="h-3.5 w-3.5" /> },
    { key: "bank", label: "Virement", icon: <CreditCard className="h-3.5 w-3.5" /> },
    { key: "other", label: "Autre", icon: <CreditCard className="h-3.5 w-3.5" /> },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5 text-amber-600" /> Enregistrer un paiement</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Montant (FCFA) *</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50000" className="h-8" autoFocus />
          </div>
          <div>
            <Label className="text-xs">Méthode</Label>
            <div className="flex gap-1.5 flex-wrap">
              {methods.map((m) => (
                <button key={m.key} onClick={() => setMethod(m.key)}
                  className={cn("flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium border transition-colors",
                    method === m.key ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50")}>
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Commentaire</Label>
            <Input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Transfert WhatsApp de Mamadou" className="h-8" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Annuler</Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSubmit} disabled={loading || !amount}>
            {loading ? "…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Expédier ──
function ShipDialog({ open, onClose, onConfirm, loading }: { open: boolean; onClose: () => void; onConfirm: (tracking: string) => void; loading: boolean }) {
  const [tracking, setTracking] = useState("");
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Truck className="h-5 w-5 text-indigo-600" /> Expédier</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Numéro de tracking *</Label>
            <Input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="EX123456789" className="h-8" autoFocus />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Annuler</Button>
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => onConfirm(tracking)} disabled={loading || !tracking}>
            {loading ? "…" : "Expédier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Rejeter ──
function RejectDialog({ open, onClose, onConfirm, loading }: { open: boolean; onClose: () => void; onConfirm: (reason: string) => void; loading: boolean }) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600"><Ban className="h-5 w-5" /> Rejeter la commande</DialogTitle>
          <DialogDescription>Cette action est irréversible.</DialogDescription>
        </DialogHeader>
        <div>
          <Label className="text-xs">Motif (optionnel)</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Produit indisponible…" className="h-8" />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Annuler</Button>
          <Button size="sm" variant="destructive" onClick={() => onConfirm(reason)} disabled={loading}>
            {loading ? "…" : "Rejeter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function fmtF(n: number): string {
  if (!n) return "0 FCFA";
  return n.toLocaleString("fr-FR") + " FCFA";
}
