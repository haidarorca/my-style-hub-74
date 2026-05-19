import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, X, Plane, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getMyShipmentAssessment,
  respondToShipmentAssessment,
} from "@/lib/shipment-assessments.functions";

export const Route = createFileRoute("/orders/$orderId/validate-shipment")({
  component: ValidateShipmentPage,
  head: () => ({
    meta: [
      { title: "Validation frais d'expédition – Kawzone" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
});

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : `${Number(n).toLocaleString("fr-FR")} FCFA`;

function ValidateShipmentPage() {
  const { orderId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getMyShipmentAssessment);
  const respondFn = useServerFn(respondToShipmentAssessment);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-shipment", orderId],
    queryFn: () => getFn({ data: { order_id: orderId } }),
    enabled: !!user,
  });

  if (loading || isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="mb-3 text-sm">Connectez-vous pour valider les frais.</p>
        <Button
          onClick={() =>
            navigate({ to: "/login", search: { redirect: `/orders/${orderId}/validate-shipment` } as any })
          }
        >
          Se connecter
        </Button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md p-6 text-center text-destructive">
        {error instanceof Error ? error.message : "Erreur"}
      </div>
    );
  }

  const assessment = data?.assessment;
  const order = data?.order;

  if (!assessment) {
    return (
      <div className="mx-auto max-w-md p-6 text-center text-sm text-muted-foreground">
        Aucune évaluation d'expédition n'est encore disponible pour cette commande.
      </div>
    );
  }

  async function respond(decision: "validated" | "rejected") {
    setSubmitting(true);
    try {
      await respondFn({ data: { order_id: orderId, decision, note: note || undefined } });
      toast.success(decision === "validated" ? "Frais validés. Merci !" : "Frais refusés. L'admin a été notifié.");
      qc.invalidateQueries({ queryKey: ["my-shipment", orderId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSubmitting(false);
    }
  }

  const isAwaiting = assessment.status === "awaiting_client_validation";
  const isValidated = assessment.status === "validated";
  const isRejected = assessment.status === "rejected";

  return (
    <div className="mx-auto max-w-xl p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plane className="h-5 w-5" /> Validation frais d'expédition
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Commande {orderId.slice(0, 8)} · {order?.customer_name ?? ""}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {isValidated && (
            <Badge>✅ Vous avez validé ces frais — votre colis va être embarqué.</Badge>
          )}
          {isRejected && (
            <Badge variant="destructive">❌ Vous avez refusé ces frais — notre équipe va vous recontacter.</Badge>
          )}

          {assessment.parcel_photo_url && (
            <img
              src={assessment.parcel_photo_url}
              alt="Photo du colis"
              loading="lazy"
              className="w-full rounded border"
            />
          )}

          <div className="space-y-1 rounded border p-3 text-sm">
            <div className="flex justify-between"><span>Poids réel :</span><strong>{assessment.real_weight_kg ?? "—"} kg</strong></div>
            <div className="flex justify-between"><span>Poids volumétrique :</span><strong>{assessment.volumetric_weight_kg ?? "—"} kg</strong></div>
            {assessment.length_cm && (
              <div className="flex justify-between">
                <span>Dimensions :</span>
                <strong>{assessment.length_cm} × {assessment.width_cm} × {assessment.height_cm} cm</strong>
              </div>
            )}
          </div>

          <div className="space-y-1 rounded border p-3 text-sm">
            <div className="flex justify-between"><span>Frais avion :</span><span>{fmt(assessment.air_freight_fee)}</span></div>
            <div className="flex justify-between"><span>Frais service :</span><span>{fmt(assessment.service_fee)}</span></div>
            <div className="flex justify-between"><span>Frais supplémentaires :</span><span>{fmt(assessment.extra_fees)}</span></div>
            <div className="mt-2 flex justify-between border-t pt-2 text-base font-bold">
              <span>TOTAL à valider :</span>
              <span>{fmt(assessment.total_fees)}</span>
            </div>
          </div>

          {assessment.admin_comment && (
            <div className="rounded bg-muted/50 p-2 text-xs">
              <strong>Note de notre équipe :</strong> {assessment.admin_comment}
            </div>
          )}

          {isAwaiting && (
            <>
              <div>
                <label className="text-xs text-muted-foreground">Votre message (optionnel)</label>
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => respond("validated")}
                  disabled={submitting}
                  className="w-full"
                >
                  <Check className="mr-1 h-4 w-4" /> Valider les frais
                </Button>
                <Button
                  onClick={() => respond("rejected")}
                  disabled={submitting}
                  variant="destructive"
                  className="w-full"
                >
                  <X className="mr-1 h-4 w-4" /> Refuser
                </Button>
              </div>
              <p className="text-center text-[11px] text-muted-foreground">
                ⚠️ Votre colis ne sera embarqué qu'après votre validation.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
