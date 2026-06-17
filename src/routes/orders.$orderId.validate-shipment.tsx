import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, X, Plane, Loader2, Package, DollarSign, TrendingUp, Weight, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
        <Button onClick={() => navigate({ to: "/login", search: { redirect: `/orders/${orderId}/validate-shipment` } as any })}>
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
      toast.success(decision === "validated" ? "Frais validés. Merci !" : "Frais refusés. Notre équipe va vous recontacter.");
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

  const orderTotal = order?.total ?? 0;
  const feesTotal = assessment.total_fees ?? 0;
  const grandTotal = Number(orderTotal) + Number(feesTotal);

  return (
    <div className="mx-auto max-w-xl p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plane className="h-5 w-5" /> Validation frais d'expédition
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Commande {orderId.slice(0, 8)} · {order?.customer_name ?? ""}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Statut */}
          {isValidated && (
            <Badge className="w-full justify-center py-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
              <Check className="mr-1 h-3.5 w-3.5" /> Vous avez validé — votre colis va être embarqué
            </Badge>
          )}
          {isRejected && (
            <Badge variant="destructive" className="w-full justify-center py-2">
              <X className="mr-1 h-3.5 w-3.5" /> Vous avez refusé — notre équipe va vous recontacter
            </Badge>
          )}
          {isAwaiting && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <strong>Votre colis a été pesé.</strong> Vérifiez les frais ci-dessous et validez pour l'expédition.
                Votre colis ne sera embarqué qu'après votre validation.
              </div>
            </div>
          )}

          {/* Photo du colis */}
          {assessment.parcel_photo_url && (
            <img
              src={assessment.parcel_photo_url}
              alt="Photo du colis"
              loading="lazy"
              className="w-full rounded-lg border"
            />
          )}

          {/* Détails colis */}
          <div className="space-y-1.5 rounded-lg border p-3 text-sm">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-2">
              <Weight className="h-3 w-3" /> Détails du colis
            </p>
            <div className="flex justify-between"><span className="text-muted-foreground">Poids réel :</span><strong>{assessment.real_weight_kg ?? "—"} kg</strong></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Poids volumétrique :</span><strong>{assessment.volumetric_weight_kg ?? "—"} kg</strong></div>
            {assessment.length_cm && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dimensions :</span>
                <strong>{assessment.length_cm} × {assessment.width_cm} × {assessment.height_cm} cm</strong>
              </div>
            )}
          </div>

          {/* Détail du calcul */}
          <div className="space-y-1.5 rounded-lg border p-3 text-sm">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-2">
              <DollarSign className="h-3 w-3" /> Détail du calcul
            </p>
            <div className="flex justify-between"><span className="text-muted-foreground">Prix de vos produits :</span><span>{fmt(orderTotal)}</span></div>
            <Separator className="my-1" />
            <div className="flex justify-between"><span className="text-muted-foreground">Frais avion :</span><span>{fmt(assessment.air_freight_fee)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Frais service :</span><span>{fmt(assessment.service_fee)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Frais supplémentaires :</span><span>{fmt(assessment.extra_fees)}</span></div>
            <Separator className="my-1" />
            <div className="flex justify-between font-semibold text-sm">
              <span>Frais transport :</span>
              <span>{fmt(feesTotal)}</span>
            </div>
          </div>

          {/* TOTAL FINAL */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold flex items-center gap-1">
                <TrendingUp className="h-4 w-4 text-primary" /> TOTAL à payer :
              </span>
              <span className="text-xl font-bold text-primary">{fmt(grandTotal)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {fmt(orderTotal)} (produits) + {fmt(feesTotal)} (transport)
            </p>
          </div>

          {/* Commentaire admin */}
          {assessment.admin_comment && (
            <div className="rounded-lg bg-muted/50 p-3 text-xs">
              <strong className="text-muted-foreground">Note de notre équipe :</strong>
              <p className="mt-0.5">{assessment.admin_comment}</p>
            </div>
          )}

          {/* Boutons d'action */}
          {isAwaiting && (
            <>
              <div>
                <label className="text-xs text-muted-foreground">Votre message (optionnel)</label>
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Une question ou remarque ?" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => respond("validated")} disabled={submitting} className="w-full bg-emerald-600 hover:bg-emerald-700">
                  <Check className="mr-1 h-4 w-4" /> Valider les frais
                </Button>
                <Button onClick={() => respond("rejected")} disabled={submitting} variant="destructive" className="w-full">
                  <X className="mr-1 h-4 w-4" /> Refuser
                </Button>
              </div>
            </>
          )}

          {/* Lien retour commandes */}
          <Button variant="ghost" size="sm" className="w-full" onClick={() => navigate({ to: "/orders" })}>
            <Package className="mr-1 h-3.5 w-3.5" /> Voir mes commandes
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
