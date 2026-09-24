/**
 * Classification « Images sensibles » AU NIVEAU DU PRODUIT — admin uniquement.
 * Toutes les images du produit suivent cette décision manuelle. Aucune IA.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronDown, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { setSensitiveManual } from "@/lib/sensitive.functions";
import {
  setAdminSensitiveFilter, setAdminSensitiveView, useAdminSensitiveView, useSensitiveImage,
  type AdminSensitiveFilter, type SensitiveStatus,
} from "@/lib/sensitive-images";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LABEL: Record<SensitiveStatus, string> = {
  normal: "Non sensible",
  homme: "Sensible — Homme",
  femme: "Sensible — Femme",
  review: "À vérifier",
};

function tone(s: SensitiveStatus) {
  return s === "normal"
    ? "border-success/40 bg-success/10 text-success"
    : s === "review"
    ? "border-warning/50 bg-warning/10 text-warning"
    : "border-destructive bg-destructive text-destructive-foreground";
}

/** Menu déroulant de classification du produit (admin). */
export function ProductSensitivitySelect({ productId, status, className }: { productId: string; status: SensitiveStatus; className?: string }) {
  const { isAdmin } = useAuth();
  const fn = useServerFn(setSensitiveManual);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (!isAdmin) return null;
  async function choose(c: SensitiveStatus) {
    setBusy(true);
    try {
      await fn({ data: { productId, choice: c } });
      await qc.invalidateQueries({ queryKey: ["sensitive-images"] });
      toast.success(`Produit classé : ${LABEL[c]}`);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-sm", tone(status), className)}
          aria-label="Classification images sensibles du produit"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
          {LABEL[status]}
          <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
        <DropdownMenuLabel className="text-xs">Classification du produit</DropdownMenuLabel>
        {(["normal", "homme", "femme", "review"] as const).map((c) => (
          <DropdownMenuItem key={c} onSelect={() => choose(c)} className={cn("text-sm", status === c && "font-semibold")}>
            {status === c ? "● " : "○ "}{LABEL[c]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Pastille + menu pour la liste « Validation des produits ». */
export function ProductSensitivityCell({ productId, categoryId }: { productId: string; categoryId?: string | null }) {
  const s = useSensitiveImage(categoryId ?? null, productId, null);
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      Images sensibles :
      {s.pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ProductSensitivitySelect productId={productId} status={s.status} />}
    </div>
  );
}

/** Barre admin « Voir les images sensibles » + filtre (page d'accueil / catalogue). */
export function AdminSensitiveBar() {
  const { isAdmin } = useAuth();
  const { on, filter } = useAdminSensitiveView();
  if (!isAdmin) return null;
  const opts: Array<[AdminSensitiveFilter, string]> = [
    ["all", "Tous"], ["normal", "Non sensibles"], ["homme", "Sensibles Homme"], ["femme", "Sensibles Femme"], ["review", "À vérifier"],
  ];
  return (
    <div className="my-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-destructive/50 bg-destructive/5 p-2 text-xs">
      <button
        type="button"
        onClick={() => setAdminSensitiveView(!on)}
        className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-semibold", on ? "border-destructive bg-destructive text-destructive-foreground" : "border-border bg-card text-foreground")}
      >
        {on ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        {on ? "Masquer les images sensibles" : "Voir les images sensibles"}
      </button>
      {on && opts.map(([k, l]) => (
        <button key={k} type="button" onClick={() => setAdminSensitiveFilter(k)}
          className={cn("rounded-full border px-2.5 py-1", filter === k ? "border-foreground bg-foreground text-background" : "border-border bg-card")}>
          {l}
        </button>
      ))}
      <span className="text-muted-foreground">Admin uniquement</span>
    </div>
  );
}
