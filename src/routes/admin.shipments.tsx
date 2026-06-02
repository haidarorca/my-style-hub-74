import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Plane, Scale, Send, MessageCircle, RefreshCw, Loader2, ShieldCheck,
  AlertTriangle, PackageCheck, Clock, DollarSign, TrendingUp,
  ChevronRight, Ban,
} from "lucide-react";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  listShipmentAssessments,
  getOrCreateShipmentAssessment,
  updateShipmentAssessment,
  sendShipmentForValidation,
  adminValidateShipment,
  type ShipmentAssessment,
  type ShipmentAssessmentStatus,
} from "@/lib/shipment-assessments.functions";
import { listShippingServices, type ShippingService } from "@/lib/shipping-services.functions";
import { buildShipmentValidationMessage, whatsappUrlTo } from "@/lib/whatsapp";

export const Route = createFileRoute("/admin/shipments")({
  component: () => (
    <PermissionGate perm="orders">
      <ShipmentsPage />
    </PermissionGate>
  ),
});

const STATUS_LABELS: Record<ShipmentAssessmentStatus, string> = {
  pending_arrival: "En attente arrivée",
  awaiting_weighing: "En attente pesée",
  fees_calculated: "Frais calculés",
  awaiting_client_validation: "Attente validation client",
  validated: "Validé",
  rejected: "Refusé par client",
  ready_to_ship: "Prêt à embarquer",
  shipped: "Expédié par avion",
};

const STATUS_VARIANTS: Record<ShipmentAssessmentStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending_arrival: "outline",
  awaiting_weighing: "outline",
  fees_calculated: "secondary",
  awaiting_client_validation: "default",
  validated: "default",
  rejected: "destructive",
  ready_to_ship: "default",
  shipped: "secondary",
};

const ACTION_REQUIRED_STATUSES: ShipmentAssessmentStatus[] = [
  "awaiting_weighing",
  "awaiting_client_validation",
  "rejected",
];

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : `${Number(n).toLocaleString("fr-FR")} FCFA`;

function ShipmentsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listShipmentAssessments);
  const createFn = useServerFn(getOrCreateShipmentAssessment);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [newOrderId, setNewOrderId] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-shipments", q, statusFilter],
    queryFn: () => listFn({ data: { status: statusFilter === "action_required" ? null : statusFilter, q } }),
  });

  // Stats
  const stats = useMemo(() => {
    const assessments = data?.assessments ?? [];
    const counts: Record<string, number> = {};
    let totalFees = 0;
    let totalOrders = 0;
    let actionRequired = 0;
    for (const a of assessments) {
      counts[a.status] = (counts[a.status] || 0) + 1;
      if (a.total_fees) totalFees += Number(a.total_fees);
      totalOrders++;
      if (ACTION_REQUIRED_STATUSES.includes(a.status)) actionRequired++;
    }
    return { counts, totalFees, totalOrders, actionRequired };
  }, [data]);

  async function startAssessment() {
    const id = newOrderId.trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      toast.error("ID de commande invalide (UUID requis)");
      return;
    }
    try {
      const row = await createFn({ data: { order_id: id } });
      toast.success("Évaluation créée");
      setNewOrderId("");
      qc.invalidateQueries({ queryKey: ["admin-shipments"] });
      setOpenId(row.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  }

  const filteredAssessments = useMemo(() => {
    const assessments = data?.assessments ?? [];
    if (statusFilter === "action_required") {
      return assessments.filter((a) => ACTION_REQUIRED_STATUSES.includes(a.status));
    }
    return assessments;
  }, [data, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Plane className="h-5 w-5" /> Expéditions Internationales
          </h1>
          <p className="text-xs text-muted-foreground">
            Pesée colis, calcul frais, validation client et suivi expédition.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Rafraîchir
        </Button>
      </div>

      {/* Alertes actions requises */}
      {stats.actionRequired > 0 && (
        <Alert className="border-amber-500/30 bg-amber-500/10">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <strong>{stats.actionRequired} commande{stats.actionRequired > 1 ? "s" : ""}</strong> nécessite{stats.actionRequired > 1 ? "nt" : ""} votre attention :
            pesée en attente, validation client ou refus.
          </AlertDescription>
        </Alert>
      )}

      {/* Cartes statistiques */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <StatCard icon={<PackageCheck className="h-4 w-4" />} label="Total" value={stats.totalOrders} tone="bg-primary/10" />
        <StatCard icon={<Scale className="h-4 w-4" />} label="En attente pesée" value={stats.counts["awaiting_weighing"] ?? 0} tone="bg-amber-500/10" />
        <StatCard icon={<Clock className="h-4 w-4" />} label="Attente client" value={stats.counts["awaiting_client_validation"] ?? 0} tone="bg-blue-500/10" />
        <StatCard icon={<ShieldCheck className="h-4 w-4" />} label="Validés" value={(stats.counts["validated"] ?? 0) + (stats.counts["ready_to_ship"] ?? 0)} tone="bg-emerald-500/10" />
        <StatCard icon={<Plane className="h-4 w-4" />} label="Expédiés" value={stats.counts["shipped"] ?? 0} tone="bg-violet-500/10" />
        <StatCard icon={<DollarSign className="h-4 w-4" />} label="Frais totaux" value={`${(stats.totalFees / 1000).toFixed(0)}k`} tone="bg-cyan-500/10" />
      </div>

      {/* Démarrer évaluation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Scale className="h-4 w-4" /> Démarrer une évaluation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[260px]">
              <label className="text-xs text-muted-foreground">ID de commande (UUID)</label>
              <Input
                value={newOrderId}
                onChange={(e) => setNewOrderId(e.target.value)}
                placeholder="Coller l'ID de la commande à peser"
              />
            </div>
            <Button onClick={startAssessment}>
              <Scale className="mr-1 h-4 w-4" /> Créer l'évaluation
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Astuce : copiez l'ID depuis la page Commandes ou Commandes Commission.
          </p>
        </CardContent>
      </Card>

      {/* Liste des évaluations */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Évaluations en cours
            </CardTitle>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px] h-8 text-xs">
                <SelectValue placeholder="Filtrer par statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="action_required">
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                    Actions requises
                  </span>
                </SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Rechercher par nom client, téléphone, ID…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="mb-3 max-w-md"
          />
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
            </div>
          ) : !filteredAssessments.length ? (
            <p className="text-sm text-muted-foreground">Aucune évaluation pour le moment.</p>
          ) : (
            <div className="divide-y">
              {filteredAssessments.map((a) => {
                const o = data?.orders[a.order_id];
                const needsAction = ACTION_REQUIRED_STATUSES.includes(a.status);
                const orderTotal = o?.total ?? 0;
                const feesTotal = a.total_fees ?? 0;
                const grandTotal = Number(orderTotal) + Number(feesTotal);

                return (
                  <div
                    key={a.id}
                    className={`flex flex-wrap items-center justify-between gap-2 py-3 cursor-pointer hover:bg-accent/40 rounded px-2 transition ${needsAction ? "border-l-2 border-l-amber-500 bg-amber-50/50" : ""}`}
                    onClick={() => setOpenId(a.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {needsAction && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                        <span className="text-sm font-medium truncate">
                          {o?.customer_name ?? "Client"} · {o?.customer_phone ?? "—"}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Cmd {a.order_id.slice(0, 8)} ·
                        <span className="ml-1">Produits: {fmt(orderTotal)}</span> ·
                        <span className="ml-1">Transport: {fmt(feesTotal)}</span> ·
                        <span className="ml-1 font-semibold text-foreground">Total: {fmt(grandTotal)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={STATUS_VARIANTS[a.status]}>{STATUS_LABELS[a.status]}</Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {openId && (
        <AssessmentDialog
          assessment={data?.assessments.find((a) => a.id === openId) ?? null}
          order={data?.orders[data?.assessments.find((a) => a.id === openId)?.order_id ?? ""] ?? null}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number | string; tone: string }) {
  return (
    <div className={`rounded-xl border p-3 ${tone}`}>
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function AssessmentDialog({
  assessment,
  order,
  onClose,
}: {
  assessment: ShipmentAssessment | null;
  order: { id: string; customer_name: string | null; customer_phone: string | null; total: number | null } | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateShipmentAssessment);
  const sendFn = useServerFn(sendShipmentForValidation);
  const adminValidateFn = useServerFn(adminValidateShipment);
  const listServicesFn = useServerFn(listShippingServices);
  const [services, setServices] = useState<ShippingService[]>([]);
  const [serviceId, setServiceId] = useState<string | null>(assessment?.shipping_service_id ?? null);
  const [autoCalc, setAutoCalc] = useState(true);
  const [form, setForm] = useState({
    real_weight_kg: assessment?.real_weight_kg ?? "",
    volumetric_weight_kg: assessment?.volumetric_weight_kg ?? "",
    length_cm: assessment?.length_cm ?? "",
    width_cm: assessment?.width_cm ?? "",
    height_cm: assessment?.height_cm ?? "",
    air_freight_fee: assessment?.air_freight_fee ?? "",
    service_fee: assessment?.service_fee ?? "",
    extra_fees: assessment?.extra_fees ?? "",
    admin_comment: assessment?.admin_comment ?? "",
    parcel_photo_url: assessment?.parcel_photo_url ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [adminNote, setAdminNote] = useState("");

  useEffect(() => {
    listServicesFn({ data: { source_country_id: null, destination_country_id: null, only_enabled: true } })
      .then(setServices)
      .catch(() => setServices([]));
  }, [listServicesFn]);

  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [services, serviceId],
  );

  // Auto-compute air_freight_fee from weight × price/kg
  useEffect(() => {
    if (!autoCalc || !selectedService) return;
    const w = Number(form.real_weight_kg || 0);
    if (!Number.isFinite(w) || w <= 0) return;
    const fee = Math.round(w * Number(selectedService.price_per_kg));
    setForm((f) => ({ ...f, air_freight_fee: fee as any }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCalc, selectedService?.id, form.real_weight_kg]);

  const total = useMemo(
    () => Number(form.air_freight_fee || 0) + Number(form.service_fee || 0) + Number(form.extra_fees || 0),
    [form.air_freight_fee, form.service_fee, form.extra_fees],
  );

  const orderTotal = order?.total ?? 0;
  const grandTotal = Number(orderTotal) + total;

  if (!assessment || !order) return null;

  const num = (v: string | number | null) => {
    if (v === "" || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  async function save(nextStatus?: ShipmentAssessmentStatus) {
    if (!assessment) return;
    setSaving(true);
    try {
      await updateFn({
        data: {
          id: assessment.id,
          real_weight_kg: num(form.real_weight_kg as any),
          volumetric_weight_kg: num(form.volumetric_weight_kg as any),
          length_cm: num(form.length_cm as any),
          width_cm: num(form.width_cm as any),
          height_cm: num(form.height_cm as any),
          air_freight_fee: num(form.air_freight_fee as any),
          service_fee: num(form.service_fee as any),
          extra_fees: num(form.extra_fees as any),
          admin_comment: form.admin_comment || null,
          parcel_photo_url: form.parcel_photo_url || null,
          shipping_service_id: serviceId,
          price_per_kg_snapshot: selectedService ? Number(selectedService.price_per_kg) : null,
          ...(nextStatus ? { status: nextStatus } : {}),
        },
      });
      toast.success("Enregistré");
      qc.invalidateQueries({ queryKey: ["admin-shipments"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function sendValidation() {
    if (!assessment) return;
    if (total <= 0) {
      toast.error("Renseignez d'abord les frais avant d'envoyer pour validation.");
      return;
    }
    await save("awaiting_client_validation");
    await sendFn({ data: { id: assessment.id } });
    qc.invalidateQueries({ queryKey: ["admin-shipments"] });
  }

  async function validateManually() {
    if (!assessment || !order) return;
    setSaving(true);
    try {
      await adminValidateFn({ data: { order_id: order.id, note: adminNote || undefined } });
      await save("ready_to_ship");
      toast.success("Validé manuellement — la commande est prête à embarquer");
      qc.invalidateQueries({ queryKey: ["admin-shipments"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  function openWhatsApp() {
    if (!order || !assessment) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "https://kawzone.com";
    const msg = buildShipmentValidationMessage({
      customerName: order.customer_name ?? "Client",
      orderShortId: order.id.slice(0, 8),
      totalFees: total || Number(assessment.total_fees ?? 0),
      validationUrl: `${origin}/orders/${order.id}/validate-shipment`,
    });
    window.open(whatsappUrlTo(order.customer_phone, msg), "_blank");
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" /> Évaluation expédition
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Résumé client */}
          <div className="rounded border p-3 text-xs space-y-1">
            <div><strong>Client :</strong> {order.customer_name ?? "—"} · {order.customer_phone ?? "—"}</div>
            <div><strong>Commande :</strong> {order.id.slice(0, 8)}</div>
            <div className="flex items-center gap-1"><strong>Statut :</strong> <Badge variant={STATUS_VARIANTS[assessment.status]}>{STATUS_LABELS[assessment.status]}</Badge></div>
          </div>

          {/* Synthèse financière */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-primary flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5" /> Synthèse financière
            </p>
            <div className="flex justify-between text-xs">
              <span>Prix produits :</span>
              <strong>{fmt(orderTotal)}</strong>
            </div>
            <div className="flex justify-between text-xs">
              <span>Frais transport :</span>
              <strong>{fmt(total || assessment.total_fees)}</strong>
            </div>
            <div className="border-t pt-1 flex justify-between text-sm font-bold">
              <span>TOTAL GLOBAL :</span>
              <span>{fmt(grandTotal)}</span>
            </div>
          </div>

          {/* Service de transport */}
          <div className="space-y-2 rounded border border-primary/30 bg-primary/5 p-3">
            <label className="text-xs font-semibold">Service de transport</label>
            <Select value={serviceId ?? ""} onValueChange={(v) => setServiceId(v || null)}>
              <SelectTrigger><SelectValue placeholder="Choisir un service" /></SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} — {Number(s.price_per_kg).toLocaleString("fr-FR")} FCFA/{s.pricing_unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedService && (
              <p className="text-[11px] text-muted-foreground">
                Calcul auto : poids × {Number(selectedService.price_per_kg).toLocaleString("fr-FR")} FCFA/{selectedService.pricing_unit}
              </p>
            )}
            <label className="flex items-center gap-2 text-[11px]">
              <input type="checkbox" checked={autoCalc} onChange={(e) => setAutoCalc(e.target.checked)} />
              Recalculer automatiquement les frais avion quand le poids change
            </label>
          </div>

          {/* Poids et dimensions */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <NumField label="Poids réel (kg)" value={form.real_weight_kg} onChange={(v) => setForm({ ...form, real_weight_kg: v })} />
            <NumField label="Poids volum. (kg)" value={form.volumetric_weight_kg} onChange={(v) => setForm({ ...form, volumetric_weight_kg: v })} />
            <NumField label="Longueur (cm)" value={form.length_cm} onChange={(v) => setForm({ ...form, length_cm: v })} />
            <NumField label="Largeur (cm)" value={form.width_cm} onChange={(v) => setForm({ ...form, width_cm: v })} />
            <NumField label="Hauteur (cm)" value={form.height_cm} onChange={(v) => setForm({ ...form, height_cm: v })} />
          </div>

          {/* Frais */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <NumField label="Frais avion (FCFA)" value={form.air_freight_fee} onChange={(v) => { setAutoCalc(false); setForm({ ...form, air_freight_fee: v }); }} />
            <NumField label="Frais service (FCFA)" value={form.service_fee} onChange={(v) => setForm({ ...form, service_fee: v })} />
            <NumField label="Frais extra (FCFA)" value={form.extra_fees} onChange={(v) => setForm({ ...form, extra_fees: v })} />
          </div>

          {/* Total frais */}
          <div className="rounded bg-primary/10 p-3 text-sm font-semibold">
            TOTAL frais transport : {fmt(total)}
          </div>

          {/* Commentaire */}
          <div>
            <label className="text-xs text-muted-foreground">Commentaire admin</label>
            <Textarea
              rows={2}
              value={form.admin_comment as string}
              onChange={(e) => setForm({ ...form, admin_comment: e.target.value })}
            />
          </div>

          {/* Photo */}
          <div>
            <label className="text-xs text-muted-foreground">URL photo du colis (optionnel)</label>
            <Input
              value={form.parcel_photo_url as string}
              onChange={(e) => setForm({ ...form, parcel_photo_url: e.target.value })}
              placeholder="https://…"
            />
          </div>

          {assessment.parcel_photo_url && (
            <img src={assessment.parcel_photo_url} alt="Colis" className="w-full max-h-48 object-cover rounded border" />
          )}

          {/* Note client */}
          {assessment.client_response_note && (
            <div className="rounded border bg-muted/40 p-2 text-xs">
              <strong>Note du client :</strong> {assessment.client_response_note}
            </div>
          )}

          {/* Actions principales */}
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <Button onClick={() => save()} disabled={saving} variant="secondary" size="sm">
              Enregistrer
            </Button>

            {/* Envoyer validation client */}
            {(assessment.status === "awaiting_weighing" || assessment.status === "fees_calculated") && (
              <Button onClick={sendValidation} disabled={saving} size="sm">
                <Send className="mr-1 h-3.5 w-3.5" /> Envoyer validation client
              </Button>
            )}

            {/* Validation manuelle admin */}
            {(assessment.status === "awaiting_client_validation" || assessment.status === "awaiting_weighing" || assessment.status === "fees_calculated") && (
              <>
                <div className="w-full" />
                <div className="flex flex-wrap items-end gap-2 w-full rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                  <div className="flex-1 min-w-[200px]">
                    <label className="text-[10px] font-semibold text-emerald-700 uppercase">Validation manuelle (paiement reçu)</label>
                    <Textarea
                      rows={1}
                      value={adminNote}
                      onChange={(e) => setAdminNote(e.target.value)}
                      placeholder="Note optionnelle (ex: paiement Wave reçu)"
                      className="text-xs"
                    />
                  </div>
                  <Button onClick={validateManually} disabled={saving} variant="default" size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                    <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Valider manuellement
                  </Button>
                </div>
              </>
            )}

            <Button onClick={openWhatsApp} variant="outline" size="sm">
              <MessageCircle className="mr-1 h-3.5 w-3.5" /> WhatsApp
            </Button>

            {/* Actions post-validation */}
            {assessment.status === "validated" && (
              <>
                <Button onClick={() => save("ready_to_ship")} variant="outline" size="sm">
                  <PackageCheck className="mr-1 h-3.5 w-3.5" /> Prêt à embarquer
                </Button>
                <Button onClick={() => save("shipped")} size="sm">
                  <Plane className="mr-1 h-3.5 w-3.5" /> Marquer expédié
                </Button>
              </>
            )}

            {assessment.status === "rejected" && (
              <Button onClick={() => save("awaiting_weighing")} variant="outline" size="sm">
                <Ban className="mr-1 h-3.5 w-3.5" /> Revenir à pesée
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NumField({ label, value, onChange }: { label: string; value: string | number | null; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input type="number" step="0.01" min="0" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
