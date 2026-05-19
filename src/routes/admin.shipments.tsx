import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plane, Scale, Send, MessageCircle, RefreshCw, Loader2 } from "lucide-react";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  listShipmentAssessments,
  getOrCreateShipmentAssessment,
  updateShipmentAssessment,
  sendShipmentForValidation,
  type ShipmentAssessment,
  type ShipmentAssessmentStatus,
} from "@/lib/shipment-assessments.functions";
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
  validated: "Validé par client",
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

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : `${Number(n).toLocaleString("fr-FR")} FCFA`;

function ShipmentsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listShipmentAssessments);
  const createFn = useServerFn(getOrCreateShipmentAssessment);
  const [q, setQ] = useState("");
  const [newOrderId, setNewOrderId] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-shipments", q],
    queryFn: () => listFn({ data: { status: null, q } }),
  });

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Plane className="h-5 w-5" /> Expéditions Chine → Sénégal
          </h1>
          <p className="text-xs text-muted-foreground">
            Pesée colis, calcul des frais réels et validation client avant embarquement.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Rafraîchir
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Démarrer une évaluation</CardTitle>
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
            Astuce : copiez l'ID depuis « Commandes » ou « Commandes commission ».
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Évaluations en cours</CardTitle>
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
          ) : !data?.assessments.length ? (
            <p className="text-sm text-muted-foreground">Aucune évaluation pour le moment.</p>
          ) : (
            <ul className="divide-y">
              {data.assessments.map((a) => {
                const o = data.orders[a.order_id];
                return (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 cursor-pointer hover:bg-accent/40 rounded px-2"
                    onClick={() => setOpenId(a.id)}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {o?.customer_name ?? "Client"} · {o?.customer_phone ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Cmd {a.order_id.slice(0, 8)} · Total cmd {fmt(o?.total)} · Frais expé {fmt(a.total_fees)}
                      </div>
                    </div>
                    <Badge variant={STATUS_VARIANTS[a.status]}>{STATUS_LABELS[a.status]}</Badge>
                  </li>
                );
              })}
            </ul>
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

  const total = useMemo(
    () =>
      Number(form.air_freight_fee || 0) +
      Number(form.service_fee || 0) +
      Number(form.extra_fees || 0),
    [form.air_freight_fee, form.service_fee, form.extra_fees],
  );

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
          <div className="rounded border p-3 text-xs">
            <div><strong>Client :</strong> {order.customer_name ?? "—"} · {order.customer_phone ?? "—"}</div>
            <div><strong>Commande :</strong> {order.id.slice(0, 8)} · Total {fmt(order.total)}</div>
            <div><strong>Statut actuel :</strong> <Badge variant={STATUS_VARIANTS[assessment.status]}>{STATUS_LABELS[assessment.status]}</Badge></div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <NumField label="Poids réel (kg)" value={form.real_weight_kg} onChange={(v) => setForm({ ...form, real_weight_kg: v })} />
            <NumField label="Poids volum. (kg)" value={form.volumetric_weight_kg} onChange={(v) => setForm({ ...form, volumetric_weight_kg: v })} />
            <NumField label="Longueur (cm)" value={form.length_cm} onChange={(v) => setForm({ ...form, length_cm: v })} />
            <NumField label="Largeur (cm)" value={form.width_cm} onChange={(v) => setForm({ ...form, width_cm: v })} />
            <NumField label="Hauteur (cm)" value={form.height_cm} onChange={(v) => setForm({ ...form, height_cm: v })} />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <NumField label="Frais avion (FCFA)" value={form.air_freight_fee} onChange={(v) => setForm({ ...form, air_freight_fee: v })} />
            <NumField label="Frais service (FCFA)" value={form.service_fee} onChange={(v) => setForm({ ...form, service_fee: v })} />
            <NumField label="Frais extra (FCFA)" value={form.extra_fees} onChange={(v) => setForm({ ...form, extra_fees: v })} />
          </div>

          <div className="rounded bg-primary/10 p-3 text-sm font-semibold">
            TOTAL à valider : {fmt(total)}
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Commentaire admin</label>
            <Textarea
              rows={2}
              value={form.admin_comment as string}
              onChange={(e) => setForm({ ...form, admin_comment: e.target.value })}
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">URL photo du colis (optionnel)</label>
            <Input
              value={form.parcel_photo_url as string}
              onChange={(e) => setForm({ ...form, parcel_photo_url: e.target.value })}
              placeholder="https://…"
            />
          </div>

          {assessment.client_response_note && (
            <div className="rounded border bg-muted/40 p-2 text-xs">
              <strong>Note du client :</strong> {assessment.client_response_note}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={() => save()} disabled={saving} variant="secondary">
              Enregistrer
            </Button>
            <Button onClick={sendValidation} disabled={saving}>
              <Send className="mr-1 h-4 w-4" /> Envoyer validation client
            </Button>
            <Button onClick={openWhatsApp} variant="outline">
              <MessageCircle className="mr-1 h-4 w-4" /> WhatsApp client
            </Button>
            {assessment.status === "validated" && (
              <>
                <Button onClick={() => save("ready_to_ship")} variant="outline">Prêt à embarquer</Button>
                <Button onClick={() => save("shipped")}>Marquer expédié</Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | number | null;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input
        type="number"
        step="0.01"
        min="0"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
