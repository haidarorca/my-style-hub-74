/**
 * Contrôles admin « Images sensibles » — visibles UNIQUEMENT par les administrateurs.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, ShieldCheck, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setSensitiveManual } from "@/lib/sensitive.functions";
import { getProductImageClassification, requeueVision, setImageManual } from "@/lib/sensitive-vision.functions";

export type Choice = "normal" | "homme" | "femme" | "review" | "auto";

export function statusOf(decision: string | null | undefined, audience: string | null | undefined) {
  if (decision === "sensitive") return audience === "homme" ? "homme" : "femme";
  if (decision === "normal") return "normal";
  return "review";
}

export const STATUS_LABEL: Record<string, string> = {
  normal: "Non sensible",
  homme: "Sensible — Homme",
  femme: "Sensible — Femme",
  review: "À vérifier",
};
export const STATUS_HINT: Record<string, string> = {
  homme: "Visible uniquement par les hommes",
  femme: "Visible uniquement par les femmes",
  normal: "Visible par tous",
  review: "Décision à confirmer",
};
export const SOURCE_LABEL: Record<string, string> = {
  MANUAL: "Manuel",
  RULE_VALIDATED: "Règle validée",
  VISION: "OpenAI Vision",
  AI: "IA texte",
  RULE: "Règle",
  NONE: "Aucune",
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  const tone =
    status === "normal" ? "border-success/30 bg-success/10 text-success"
    : status === "review" ? "border-destructive/30 bg-destructive/10 text-destructive"
    : "border-warning/40 bg-warning/10 text-warning";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", tone, className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ClassifyMenu({ current, onChoose, busy, trigger, allowAuto }: {
  current: string; onChoose: (c: Choice) => void; busy?: boolean; trigger?: React.ReactNode; allowAuto?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => { e.stopPropagation(); }}>
        {trigger ?? (
          <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" disabled={busy}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />} Modifier
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="text-xs">Classification image</DropdownMenuLabel>
        {(["normal", "homme", "femme", "review"] as const).map((c) => (
          <DropdownMenuItem key={c} onSelect={() => onChoose(c)} className="flex flex-col items-start gap-0">
            <span className={cn("text-sm", current === c && "font-semibold")}>{current === c ? "● " : "○ "}{STATUS_LABEL[c]}</span>
            <span className="text-[10px] text-muted-foreground">{STATUS_HINT[c]}</span>
          </DropdownMenuItem>
        ))}
        {allowAuto && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChoose("auto")} className="text-xs text-muted-foreground">
              Retirer la décision manuelle (revenir à l'automatique)
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function refreshAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["sensitive-images"] });
  qc.invalidateQueries({ queryKey: ["sensitive-admin"] });
}

/** Décisions produit pour les badges admin du catalogue. */
function useAdminProductDecisions(enabled: boolean) {
  return useQuery({
    queryKey: ["sensitive-admin", "products"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const out = new Map<string, { decision: string; audience: string | null; source: string }>();
      for (let from = 0; from < 50000; from += 1000) {
        const { data, error } = await (supabase as any).from("product_image_sensitivity")
          .select("product_id, decision, audience, source").range(from, from + 999);
        if (error) throw error;
        for (const r of data ?? []) out.set(r.product_id, r);
        if (!data || data.length < 1000) break;
      }
      return out;
    },
  });
}

/** Badge + menu sur la carte produit du catalogue (admins uniquement). */
export function AdminCardSensitivity({ productId }: { productId: string }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data } = useAdminProductDecisions(isAdmin);
  const setManual = useServerFn(setSensitiveManual);
  const [busy, setBusy] = useState(false);
  if (!isAdmin) return null;
  const row = data?.get(productId);
  const status = row ? statusOf(row.decision, row.audience) : "review";
  const choose = async (c: Choice) => {
    setBusy(true);
    try { await setManual({ data: { productId, choice: c } }); toast.success(c === "auto" ? "Décision manuelle retirée." : `Produit : ${STATUS_LABEL[c]} (Manuel)`); refreshAll(qc); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(false); }
  };
  return (
    <div className="absolute bottom-2 left-2 z-10" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      <ClassifyMenu
        current={status}
        onChoose={choose}
        busy={busy}
        allowAuto={row?.source === "MANUAL"}
        trigger={
          <button type="button" aria-label="Classification image" className="rounded-full bg-background/95 shadow-sm">
            {busy ? <span className="flex px-2 py-0.5"><Loader2 className="h-3 w-3 animate-spin" /></span>
              : <StatusPill status={row ? status : "review"} />}
          </button>
        }
      />
      {row && <span className="ml-1 rounded-full bg-background/90 px-1.5 py-0.5 text-[9px] text-muted-foreground">{row.source === "AI" ? "IA texte" : row.source === "MANUAL" ? "Manuel" : "Règle"}</span>}
      {!row && <span className="ml-1 rounded-full bg-background/90 px-1.5 py-0.5 text-[9px] text-muted-foreground">Non analysé</span>}
    </div>
  );
}

/** Panneau fiche produit : classification image par image (admins uniquement). */
export function AdminProductImagesPanel({ productId }: { productId: string }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const fetchIt = useServerFn(getProductImageClassification);
  const setImg = useServerFn(setImageManual);
  const setProd = useServerFn(setSensitiveManual);
  const requeue = useServerFn(requeueVision);
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["sensitive-admin", "product", productId],
    enabled: isAdmin,
    queryFn: () => fetchIt({ data: { productId } }),
  });
  if (!isAdmin) return null;
  const run = async (key: string, fn: () => Promise<unknown>, msg: string) => {
    setBusy(key);
    try { await fn(); toast.success(msg); refreshAll(qc); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(null); }
  };
  const prodStatus = data?.product ? statusOf(data.product.decision, data.product.audience) : "review";
  return (
    <section className="mx-3 my-3 rounded-xl border border-primary/30 bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-semibold"><ShieldCheck className="h-4 w-4 text-primary" /> Classification des images (admin)</p>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={busy === "rq"}
          onClick={() => run("rq", () => requeue({ data: { productId } }), "Images envoyées à OpenAI Vision (file d'attente).")}>
          <RefreshCw className="h-3 w-3" /> Vérifier avec Vision
        </Button>
      </div>
      {isLoading && <Loader2 className="mt-2 h-4 w-4 animate-spin" />}
      {data && (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 p-2">
            <span className="text-xs text-muted-foreground">Produit :</span>
            <StatusPill status={data.product ? prodStatus : "review"} />
            <span className="text-[11px] text-muted-foreground">{data.product ? (data.product.source === "MANUAL" ? "Manuel" : data.product.source === "AI" ? "IA texte" : data.product.rule_id ? "Règle validée" : "Règle") : "Non analysé"}</span>
            <ClassifyMenu current={prodStatus} busy={busy === "p"} allowAuto={data.product?.source === "MANUAL"}
              onChoose={(c) => run("p", () => setProd({ data: { productId, choice: c } }), "Classification produit enregistrée.")} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {data.images.filter((im: any) => im.current).map((im: any, i: number) => {
              const st = statusOf(im.final_decision, im.final_audience);
              return (
                <div key={im.id} className="overflow-hidden rounded-lg border">
                  <img src={im.image_url} alt={`Image ${i + 1}`} className="aspect-square w-full bg-muted object-contain" loading="lazy" />
                  <div className="space-y-1 p-2">
                    <p className="text-[11px] font-semibold">Image {i + 1}</p>
                    <StatusPill status={st} />
                    <p className="text-[10px] text-muted-foreground">Source : {SOURCE_LABEL[im.final_source] ?? im.final_source}</p>
                    {im.vision_status !== "SKIPPED" && (
                      <p className="text-[10px] text-muted-foreground">
                        Vision : {im.vision_status}{im.vision_decision ? ` → ${STATUS_LABEL[statusOf(im.vision_decision, im.vision_audience)]}` : ""}
                        {im.vision_cached ? " (cache)" : ""}
                      </p>
                    )}
                    {im.vision_reason && <p className="line-clamp-2 text-[10px]">{im.vision_reason}</p>}
                    {im.last_error && <p className="text-[10px] text-destructive">{im.last_error}</p>}
                    <ClassifyMenu current={st} busy={busy === im.id} allowAuto={!!im.manual_decision}
                      onChoose={(c) => run(im.id, () => setImg({ data: { id: im.id, choice: c } }), c === "auto" ? "Décision manuelle retirée." : `Image ${i + 1} : ${STATUS_LABEL[c]} (Manuel)`)} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
