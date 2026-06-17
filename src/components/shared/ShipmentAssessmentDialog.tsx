/**
 * ShipmentAssessmentDialog — Évaluation logistique intégrée dans la carte commande
 * 
 * WORKFLOW PROFESSIONNEL :
 * 1. Admin clique "Peser/Évaluer" sur une commande
 * 2. Le composant crée AUTO l'évaluation si elle n'existe pas (getOrCreateShipmentAssessment)
 * 3. Affiche IMMÉDIATEMENT :
 *    - Produits de la commande (images, noms, quantités)
 *    - Champs poids réel + dimensions
 *    - Calcul auto volumétrique : (L×W×H)/5000
 *    - Calcul auto frais : MAX(poids_réel, poids_volumétrique) × prix/kg
 *    - Service transport choisi
 *    - Statut pipeline logistique
 *    - Actions rapides (Sauver, Envoyer au client, Marquer expédié)
 * 
 * ZERO copier/coller UUID. ZERO navigation. Contexte préservé.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Scale, Plane, Send, Loader2, Check, Package, DollarSign,
  TrendingUp, Weight, Camera, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminOrderItem } from "@/lib/admin-orders.functions";
import {
  getOrCreateShipmentAssessment,
  updateShipmentAssessment,
  sendShipmentForValidation,
  adminValidateShipment,
  type ShipmentAssessment,
} from "@/lib/shipment-assessments.functions";
import { listShippingServices, type ShippingService } from "@/lib/shipping-services.functions";

/* ── Types ── */

interface Props {
  orderId: string;
  orderItems: AdminOrderItem[];
  orderTotal: number;
  customerName: string | null;
  customerPhone: string | null;
  shippingServiceId: string | null;
  open: boolean;
  onClose: () => void;
  onStatusChange?: () => void;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_arrival:              { label: "En attente arrivée", color: "bg-gray-100 text-gray-700" },
  awaiting_weighing:            { label: "En attente pesée", color: "bg-amber-100 text-amber-700" },
  fees_calculated:              { label: "Frais calculés", color: "bg-blue-100 text-blue-700" },
  awaiting_client_validation:   { label: "Attente validation client", color: "bg-purple-100 text-purple-700" },
  validated:                    { label: "Validé par client", color: "bg-emerald-100 text-emerald-700" },
  rejected:                     { label: "Refusé par client", color: "bg-red-100 text-red-700" },
  ready_to_ship:                { label: "Prêt à embarquer", color: "bg-cyan-100 text-cyan-700" },
  shipped:                      { label: "Expédié", color: "bg-violet-100 text-violet-700" },
};

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : `${Number(n).toLocaleString("fr-FR")} FCFA`;

/* ── Composant principal ── */

export function ShipmentAssessmentDialog({
  orderId,
  orderItems,
  orderTotal,
  customerName,
  customerPhone,
  shippingServiceId,
  open,
  onClose,
  onStatusChange,
}: Props) {
  const qc = useQueryClient();
  const createFn = useServerFn(getOrCreateShipmentAssessment);
  const updateFn = useServerFn(updateShipmentAssessment);
  const sendFn = useServerFn(sendShipmentForValidation);
  const adminValidateFn = useServerFn(adminValidateShipment);
  const listServicesFn = useServerFn(listShippingServices);

  // Load or create assessment automatically
  const { data, isLoading, error } = useQuery({
    queryKey: ["shipment-assessment", orderId],
    queryFn: async () => {
      const assessment = await createFn({ data: { order_id: orderId } });
      return assessment as ShipmentAssessment;
    },
    enabled: open,
    staleTime: 0,
  });

  const [services, setServices] = useState<ShippingService[]>([]);
  const [serviceId, setServiceId] = useState<string | null>(shippingServiceId);
  const [autoCalc, setAutoCalc] = useState(true);
  const [form, setForm] = useState<Record<string, string | number>>({});
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [adminNote, setAdminNote] = useState("");

  // Load shipping services once
  useEffect(() => {
    if (!open) return;
    listServicesFn({ data: { source_country_id: null, destination_country_id: null, only_enabled: true } })
      .then(setServices)
      .catch(() => setServices([]));
  }, [open, listServicesFn]);

  // Sync form when assessment data loads
  useEffect(() => {
    if (!data) return;
    setServiceId(data.shipping_service_id ?? shippingServiceId);
    setForm({
      real_weight_kg: data.real_weight_kg ?? "",
      volumetric_weight_kg: data.volumetric_weight_kg ?? "",
      length_cm: data.length_cm ?? "",
      width_cm: data.width_cm ?? "",
      height_cm: data.height_cm ?? "",
      air_freight_fee: data.air_freight_fee ?? "",
      service_fee: data.service_fee ?? "",
      extra_fees: data.extra_fees ?? "",
      admin_comment: data.admin_comment ?? "",
      parcel_photo_url: data.parcel_photo_url ?? "",
    });
  }, [data, shippingServiceId]);

  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [services, serviceId],
  );

  // Auto-calculate volumetric weight + chargeable weight + air freight fee
  useEffect(() => {
    if (!autoCalc || !selectedService) return;
    const realW = Number(form.real_weight_kg || 0);
    const l = Number(form.length_cm || 0);
    const wdt = Number(form.width_cm || 0);
    const h = Number(form.height_cm || 0);
    if (!Number.isFinite(realW) || realW <= 0) return;
    let volW = 0;
    if (l > 0 && wdt > 0 && h > 0) {
      volW = (l * wdt * h) / 5000;
    }
    const chargeableWeight = Math.max(realW, volW);
    const fee = Math.round(chargeableWeight * Number(selectedService.price_per_kg));
    setForm((f) => ({
      ...f,
      air_freight_fee: fee,
      ...(volW > 0 ? { volumetric_weight_kg: Math.round(volW * 1000) / 1000 } : {}),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCalc, selectedService?.id, form.real_weight_kg, form.length_cm, form.width_cm, form.height_cm]);

  const feesTotal = useMemo(
    () => Number(form.air_freight_fee || 0) + Number(form.service_fee || 0) + Number(form.extra_fees || 0),
    [form.air_freight_fee, form.service_fee, form.extra_fees],
  );
  const grandTotal = orderTotal + feesTotal;

  // Status
  const status = data?.status ?? "awaiting_weighing";
  const statusCfg = STATUS_LABELS[status] ?? STATUS_LABELS.awaiting_weighing;
  const isAwaitingValidation = status === "awaiting_client_validation";
  const isValidated = status === "validated" || status === "ready_to_ship" || status === "shipped";
  const isRejected = status === "rejected";
  const canSend = (status === "awaiting_weighing" || status === "fees_calculated") && feesTotal > 0;

  /* ── Handlers ── */

  const save = useCallback(async () => {
    if (!data) return;
    setSaving(true);
    try {
      const num = (v: string | number | null) => (v === "" || v == null ? null : Number(v));
      await updateFn({
        data: {
          id: data.id,
          real_weight_kg: num(form.real_weight_kg),
          volumetric_weight_kg: num(form.volumetric_weight_kg),
          length_cm: num(form.length_cm),
          width_cm: num(form.width_cm),
          height_cm: num(form.height_cm),
          air_freight_fee: num(form.air_freight_fee),
          service_fee: num(form.service_fee),
          extra_fees: num(form.extra_fees),
          admin_comment: form.admin_comment || null,
          parcel_photo_url: form.parcel_photo_url || null,
          shipping_service_id: serviceId,
          status: "fees_calculated",
        },
      });
      toast.success("Évaluation sauvegardée");
      qc.invalidateQueries({ queryKey: ["shipment-assessment", orderId] });
      onStatusChange?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [data, form, serviceId, updateFn, qc, orderId, onStatusChange]);

  const sendToClient = useCallback(async () => {
    if (!data) return;
    setSending(true);
    try {
      await save();
      await sendFn({ data: { id: data.id } });
      toast.success("Envoyé au client pour validation");
      qc.invalidateQueries({ queryKey: ["shipment-assessment", orderId] });
      onStatusChange?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }, [data, save, sendFn, qc, orderId, onStatusChange]);

  const adminValidate = useCallback(async () => {
    if (!data) return;
    setSaving(true);
    try {
      await adminValidateFn({ data: { order_id: orderId, note: adminNote || undefined } });
      toast.success("Validé manuellement par l'admin");
      qc.invalidateQueries({ queryKey: ["shipment-assessment", orderId] });
      onStatusChange?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [data, adminValidateFn, orderId, adminNote, qc, onStatusChange]);

  const markShipped = useCallback(async () => {
    if (!data) return;
    setSaving(true);
    try {
      await updateFn({
        data: { id: data.id, status: "shipped" },
      });
      toast.success("Colis marqué comme expédié");
      qc.invalidateQueries({ queryKey: ["shipment-assessment", orderId] });
      onStatusChange?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [data, updateFn, qc, orderId, onStatusChange]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        {/* Header */}
        <DialogHeader className="p-4 pb-3 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Scale className="h-5 w-5 text-primary" />
              Pesée & Évaluation
            </DialogTitle>
            <Badge className={cn(statusCfg.color)}>{statusCfg.label}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Commande #{orderId.slice(0, 8)} · {customerName ?? "—"} · {customerPhone ?? "—"}
          </p>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-destructive">
            {(error as Error).message}
          </div>
        ) : (
          <div className="p-4 space-y-5">

            {/* Section 1: Produits de la commande */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" /> Produits ({orderItems.length})
              </h3>
              <div className="space-y-2">
                {orderItems.map((it) => (
                  <div key={it.id} className="flex items-center gap-3 rounded-lg border bg-muted/30 p-2">
                    <div className="h-12 w-12 shrink-0 rounded-md bg-muted overflow-hidden">
                      {it.product_image_url && (
                        <img src={it.product_image_url} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{it.product_name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Qté {it.quantity} · {(it.unit_price * it.quantity).toLocaleString("fr-FR")} FCFA
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Section 2: Service de transport */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Plane className="h-3.5 w-3.5" /> Service de transport
              </h3>
              <select
                value={serviceId ?? ""}
                onChange={(e) => setServiceId(e.target.value || null)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">— Sélectionner —</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {Number(s.price_per_kg).toLocaleString("fr-FR")} FCFA/{s.pricing_unit}
                  </option>
                ))}
              </select>
              {selectedService && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Prix de référence : {Number(selectedService.price_per_kg).toLocaleString("fr-FR")} FCFA/kg ·
                  Délai : {selectedService.delay_min_days ?? "?"}-{selectedService.delay_max_days ?? "?"} jours
                </p>
              )}
            </section>

            {/* Section 3: Poids & Dimensions */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Weight className="h-3.5 w-3.5" /> Poids & Dimensions
                </h3>
                <div className="flex items-center gap-2">
                  <Label htmlFor="auto-calc" className="text-[11px] text-muted-foreground cursor-pointer">
                    Calcul auto
                  </Label>
                  <Switch
                    id="auto-calc"
                    checked={autoCalc}
                    onCheckedChange={setAutoCalc}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <NumField label="Poids réel (kg)" value={form.real_weight_kg} onChange={(v) => setForm((f) => ({ ...f, real_weight_kg: v }))} />
                <NumField label="Poids volumétrique (kg)" value={form.volumetric_weight_kg} onChange={(v) => setForm((f) => ({ ...f, volumetric_weight_kg: v }))} disabled={autoCalc} />
                <NumField label="Longueur (cm)" value={form.length_cm} onChange={(v) => setForm((f) => ({ ...f, length_cm: v }))} />
                <NumField label="Largeur (cm)" value={form.width_cm} onChange={(v) => setForm((f) => ({ ...f, width_cm: v }))} />
                <NumField label="Hauteur (cm)" value={form.height_cm} onChange={(v) => setForm((f) => ({ ...f, height_cm: v }))} />
              </div>
              {autoCalc && selectedService && (
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  Volumétrique = (L × W × H) / 5000 · Poids chargeable = MAX(réel, volumétrique) · Frais = poids × {Number(selectedService.price_per_kg).toLocaleString("fr-FR")} FCFA/kg
                </p>
              )}
            </section>

            {/* Section 4: Photo du colis */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Camera className="h-3.5 w-3.5" /> Photo du colis
              </h3>
              {form.parcel_photo_url ? (
                <div className="relative">
                  <img src={String(form.parcel_photo_url ?? "")} alt="Colis" className="h-32 w-32 rounded-lg border object-cover" />
                  <Button size="sm" variant="ghost" className="absolute top-0 right-0 h-6 w-6 p-0" onClick={() => setForm((f) => ({ ...f, parcel_photo_url: "" }))}>
                    ✕
                  </Button>
                </div>
              ) : (
                <Input
                  placeholder="URL de la photo du colis"
                  value={form.parcel_photo_url}
                  onChange={(e) => setForm((f) => ({ ...f, parcel_photo_url: e.target.value }))}
                  className="text-sm"
                />
              )}
            </section>

            {/* Section 5: Frais */}
            <section className="rounded-xl border bg-muted/30 p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" /> Détail des frais
              </h3>
              <div className="space-y-2">
                <NumField label="Frais avion (FCFA)" value={form.air_freight_fee} onChange={(v) => { setAutoCalc(false); setForm((f) => ({ ...f, air_freight_fee: v })); }} />
                <NumField label="Frais service (FCFA)" value={form.service_fee} onChange={(v) => setForm((f) => ({ ...f, service_fee: v }))} />
                <NumField label="Frais supplémentaires (FCFA)" value={form.extra_fees} onChange={(v) => setForm((f) => ({ ...f, extra_fees: v }))} />
              </div>
              <Separator />
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Produits</span>
                  <span>{fmt(orderTotal)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Transport</span>
                  <span>{fmt(feesTotal)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-base font-bold text-primary">
                  <span className="flex items-center gap-1"><TrendingUp className="h-4 w-4" /> TOTAL</span>
                  <span>{fmt(grandTotal)}</span>
                </div>
              </div>
            </section>

            {/* Commentaire admin */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Commentaire admin
              </h3>
              <Textarea
                value={form.admin_comment}
                onChange={(e) => setForm((f) => ({ ...f, admin_comment: e.target.value }))}
                placeholder="Note interne (visible par le client si envoyé)"
                rows={2}
              />
            </section>

            {/* Alertes statut */}
            {isAwaitingValidation && (
              <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-xs text-purple-800 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <strong>En attente de validation client.</strong> Le client a reçu une notification et doit valider les frais de transport sur sa page de commandes.
                </div>
              </div>
            )}
            {isValidated && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-start gap-2">
                <Check className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <strong>Validé.</strong> Le client a accepté les frais. Vous pouvez marquer le colis comme expédié.
                </div>
              </div>
            )}
            {isRejected && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <strong>Refusé par le client.</strong> Modifiez les frais si nécessaire et renvoyez pour validation.
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <Button onClick={save} disabled={saving || !data} size="sm" className="gap-1">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scale className="h-3.5 w-3.5" />}
                Sauvegarder
              </Button>

              {canSend && (
                <Button onClick={sendToClient} disabled={sending || !data} size="sm" variant="secondary" className="gap-1">
                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Envoyer au client
                </Button>
              )}

              {(isAwaitingValidation || isRejected) && (
                <Button onClick={adminValidate} disabled={saving} size="sm" variant="outline" className="gap-1">
                  <Check className="h-3.5 w-3.5" /> Valider manuellement (admin)
                </Button>
              )}

              {isValidated && status !== "shipped" && (
                <Button onClick={markShipped} disabled={saving} size="sm" variant="default" className="gap-1 bg-violet-600 hover:bg-violet-700">
                  <Plane className="h-3.5 w-3.5" /> Marquer expédié
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Sub-component: numeric input ── */

function NumField({ label, value, onChange, disabled }: { label: string; value: string | number; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div>
      <label className="text-[11px] text-muted-foreground block mb-1">{label}</label>
      <Input
        type="number"
        step="0.001"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn("h-8 text-sm", disabled && "bg-muted opacity-60")}
      />
    </div>
  );
}
