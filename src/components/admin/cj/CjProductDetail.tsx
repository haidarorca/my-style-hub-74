import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCjDetail } from "@/lib/cj-center.functions";

const LABELS: Record<string, string> = { images: "images", sku: "SKU", price: "prix", stock: "stock", weight: "poids", dimensions: "dimensions", variants: "variantes", description: "description" };
const fmt = (n: number | null | undefined, d = 2) => n == null ? "—" : String(Number(n.toFixed(d)));

export function CjProductDetail({ pid, onClose, onImport, onSync }: { pid: string | null; onClose: () => void; onImport: (pid: string, name: string | null, image: string | null) => void; onSync: (pid: string) => void }) {
  const detailFn = useServerFn(getCjDetail);
  const { data, isLoading } = useQuery({
    queryKey: ["cj-detail", pid],
    queryFn: () => {
      if (!pid) throw new Error("Produit introuvable.");
      return detailFn({ data: { pid } });
    },
    enabled: Boolean(pid), staleTime: 10 * 60_000,
  });
  const d = data?.detail;
  const missing = d ? Object.entries(d.completeness).filter(([, ok]) => !ok).map(([key]) => LABELS[key] ?? key) : [];

  return <Dialog open={Boolean(pid)} onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="h-[92dvh] max-h-[92dvh] w-[calc(100%-1rem)] max-w-5xl overflow-y-auto p-0 sm:h-auto sm:max-h-[92vh]">
      <DialogHeader className="border-b p-4 pr-12 sm:p-5"><DialogTitle className="line-clamp-2 text-base sm:text-lg">{d?.name ?? "Aperçu du produit"}</DialogTitle></DialogHeader>
      {isLoading && <div className="grid min-h-80 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>}
      {data && !data.ok && <div className="p-5 text-sm text-destructive">{data.error}</div>}
      {d && <div className="space-y-5 p-4 sm:p-5">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(260px,.85fr)]">
          <div className="space-y-2">
            <div className="aspect-[4/3] overflow-hidden rounded-md bg-muted/40">{d.image ? <img src={d.image} alt={d.name ?? "Produit CJ"} className="h-full w-full object-contain" /> : null}</div>
            <div className="flex gap-2 overflow-x-auto pb-1">{d.gallery.filter((src: string) => src !== d.image).slice(0, 12).map((src: string) => <img key={src} src={src} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-md border object-cover" />)}</div>
          </div>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2"><Badge variant={data.exists ? "secondary" : "default"}>{data.exists ? "Déjà importé" : "Nouveau"}</Badge><QualityBadge score={d.score} missing={missing} /></div>
            <div className="grid grid-cols-2 gap-3"><Info label="Prix CJ" value={d.minPrice == null ? "À vérifier" : d.minPrice === d.maxPrice ? `${d.minPrice} USD` : `${d.minPrice} – ${d.maxPrice} USD`} /><Info label="Stock CJ" value={d.totalStock == null ? "À vérifier" : String(d.totalStock)} /><Info label="Variantes" value={String(d.variantCount)} /><Info label="Poids max" value={d.maxWeightKg == null ? "À vérifier" : `${fmt(d.maxWeightKg, 4)} kg`} /></div>
            <div><p className="text-xs text-muted-foreground">Catégorie</p><p className="text-sm font-medium">{d.category ?? "Non renseignée"}</p></div>
            {missing.length ? <div className="rounded-md border border-warning/40 bg-warning/10 p-3"><p className="flex items-center gap-2 text-sm font-medium"><AlertTriangle className="h-4 w-4 text-warning" />Données manquantes</p><p className="mt-1 text-xs text-muted-foreground">{missing.join(" · ")}</p></div> : <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 p-3 text-sm font-medium"><CheckCircle2 className="h-4 w-4 text-success" />Données complètes</div>}
            {data.exists ? <Button className="w-full" variant="outline" onClick={() => onSync(d.pid)}><RefreshCw className="h-4 w-4" />Synchroniser ce produit</Button> : <Button className="w-full" onClick={() => onImport(d.pid, d.name, d.image)}><Download className="h-4 w-4" />Ajouter à la sélection</Button>}
          </div>
        </div>

        <Accordion type="multiple" defaultValue={["description", "variants"]} className="border-t">
          <AccordionItem value="description"><AccordionTrigger>Description</AccordionTrigger><AccordionContent><p className="max-h-44 overflow-y-auto whitespace-pre-line text-sm leading-6 text-muted-foreground">{d.description || "Aucune description fournie par CJ."}</p></AccordionContent></AccordionItem>
          <AccordionItem value="variants"><AccordionTrigger>Variantes ({d.variantCount})</AccordionTrigger><AccordionContent><div className="space-y-2">{d.variants.map((v: any) => <div key={v.vid} className="grid grid-cols-[48px_minmax(0,1fr)_auto] gap-3 rounded-md border p-2 text-xs">
            <div className="h-12 w-12 overflow-hidden rounded bg-muted">{v.image ? <img src={v.image} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}</div>
            <div className="min-w-0"><p className="truncate font-medium">{v.options ? Object.entries(v.options).map(([key, value]) => `${key}: ${value}`).join(" · ") : v.key ?? "Option non renseignée"}</p><p className="mt-1 text-muted-foreground">SKU {v.sku ?? "—"}</p><p className="mt-1 text-muted-foreground">{fmt(v.weightKg, 4)} kg · {v.lengthCm && v.widthCm && v.heightCm ? `${v.lengthCm} × ${v.widthCm} × ${v.heightCm} cm` : "dimensions —"} · CBM {v.cbm ?? "—"}</p></div>
            <div className="text-right"><p className="font-semibold">{v.price ?? "—"} USD</p><p className="mt-1 text-muted-foreground">Stock {v.stock ?? "—"}</p></div>
          </div>)}</div></AccordionContent></AccordionItem>
          <AccordionItem value="technical"><AccordionTrigger>Informations techniques</AccordionTrigger><AccordionContent><div className="grid gap-2 text-xs sm:grid-cols-2"><Tech label="PID" value={d.pid} /><Tech label="SKU produit" value={d.sku ?? "—"} /><Tech label="Noms des options CJ" value={d.optionNames ?? "—"} /><Tech label="Qualité des données" value={`${d.score}%`} /></div><div className="mt-3 space-y-1">{d.variants.map((v: any) => <div key={v.vid} className="grid gap-1 border-b py-2 text-xs sm:grid-cols-2"><span>{v.sku ?? "Sans SKU"}</span><span className="break-all text-muted-foreground">VID {v.vid}</span></div>)}</div></AccordionContent></AccordionItem>
        </Accordion>
      </div>}
    </DialogContent>
  </Dialog>;
}

function QualityBadge({ score, missing }: { score: number; missing: string[] }) {
  if (!missing.length) return <Badge variant="outline" className="border-success/50 text-success"><CheckCircle2 className="h-3 w-3" />Complet</Badge>;
  if (score < 50) return <Badge variant="destructive"><XCircle className="h-3 w-3" />Import impossible</Badge>;
  return <Badge variant="outline" className="border-warning/60"><AlertTriangle className="h-3 w-3 text-warning" />Données manquantes</Badge>;
}
function Info({ label, value }: { label: string; value: string }) { return <div className="border-b pb-2"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></div>; }
function Tech({ label, value }: { label: string; value: string }) { return <div className="rounded-md bg-muted/50 p-2"><p className="text-muted-foreground">{label}</p><p className="break-all font-medium">{value}</p></div>; }