import { useState } from "react";
import { Loader2, Flag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const REPORT_REASONS = [
  "Produit non conforme",
  "Contrefaçon",
  "Mauvaise qualité",
  "Arnaque",
  "Vendeur irrespectueux",
  "Produit interdit",
  "Photos mensongères",
  "Autre",
] as const;

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  type: "product" | "vendor";
  productId?: string;
  vendorId?: string;
  orderId?: string;
  targetName?: string;
  reporterId: string;
};

export function ReportDialog({
  open,
  onOpenChange,
  type,
  productId,
  vendorId,
  orderId,
  targetName,
  reporterId,
}: Props) {
  const [category, setCategory] = useState<string>("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setCategory("");
    setDetails("");
  };

  const submit = async () => {
    if (!category) {
      toast.error("Sélectionnez un motif");
      return;
    }
    setSubmitting(true);
    const payload: any = {
      report_type: type,
      reporter_id: reporterId,
      reason_category: category,
      reason: details.trim() || category,
      order_id: orderId ?? null,
    };
    if (type === "product") payload.product_id = productId;
    if (type === "vendor") payload.vendor_id = vendorId;

    const { error } = await supabase.from("product_reports").insert(payload);
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Signalement envoyé. Nos équipes vont l'examiner.");
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-rose-500" />
            Signaler {type === "product" ? "ce produit" : "ce vendeur"}
          </DialogTitle>
          {targetName && (
            <DialogDescription className="line-clamp-2">{targetName}</DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold">Motif</label>
            <div className="flex flex-wrap gap-1.5">
              {REPORT_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setCategory(r)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                    category === r
                      ? "border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                      : "border-border bg-card hover:bg-accent",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold">
              Détails {category === "Autre" ? "(requis)" : "(optionnel)"}
            </label>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value.slice(0, 800))}
              rows={4}
              placeholder="Décrivez le problème…"
              className="resize-none"
            />
            <div className="mt-1 text-right text-[10px] text-muted-foreground">
              {details.length}/800
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Annuler
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || !category || (category === "Autre" && !details.trim())}
            className="bg-rose-600 hover:bg-rose-700"
          >
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Envoyer le signalement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
