import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Check, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCjDetail } from "@/lib/cj-center.functions";

const LABELS: Record<string, string> = {
  images: "Images", sku: "SKU", price: "Prix", stock: "Stock", weight: "Poids",
  dimensions: "Dimensions", variants: "Variantes", description: "Description",
};

export function Completeness({ c }: { c: Record<string, boolean> }) {
  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(c).map(([k, ok]) => (
        <span key={k} className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] ${ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
          {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />} {LABELS[k] ?? k}
        </span>
      ))}
    </div>
  );
}

const fmt = (n: number | null | undefined, d = 2) => (n === null || n === undefined ? "—" : String(Number(n.toFixed(d))));

export function CjProductDetail({
  pid,
  onClose,
  onImport,
  onSync,
}: {
  pid: string | null;
  onClose: () => void;
  onImport: (pid: string, name: string | null, image: string | null) => void;
  onSync: (pid: string) => void;
}) {
  const detailFn = useServerFn(getCjDetail);
  const { data, isLoading } = useQuery({
    queryKey: ["cj-detail", pid],
    queryFn: () => detailFn({ data: { pid: pid! } }),
    enabled: !!pid,
    staleTime: 10 * 60_000,
  });
  const d = data?.detail;
  return (
    <Dialog open={!!pid} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6 text-sm">{d?.name ?? pid}</DialogTitle>
        </DialogHeader>
        {isLoading && <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin" /></div>}
        {data && !data.ok && <p className="text-sm text-destructive">{data.error}</p>}
        {d && (
          <div className="space-y-4 text-xs">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {[d.image, ...d.gallery.filter((g: string) => g !== d.image)].filter(Boolean).slice(0, 20).map((src: string) => (
                <img key={src} src={src} alt="" loading="lazy" className="h-24 w-24 shrink-0 rounded-md border object-cover" />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Info k="PID" v={d.pid} />
              <Info k="SKU" v={d.sku ?? "—"} />
              <Info k="Prix d'achat" v={d.minPrice === null ? "—" : d.minPrice === d.maxPrice ? `${d.minPrice} USD` : `${d.minPrice} – ${d.maxPrice} USD`} />
              <Info k="Stock total CJ" v={d.totalStock === null ? "inconnu" : String(d.totalStock)} />
              <Info k="Variantes" v={String(d.variantCount)} />
              <Info k="Options CJ" v={d.optionNames ?? "—"} />
              <Info k="Catégorie" v={d.category ?? "—"} />
              <Info k="Dans KawZone" v={data.exists ? "Déjà importé" : "Nouveau"} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Completeness c={d.completeness} />
              <Badge variant="outline">Données {d.score}%</Badge>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[760px] text-[11px]">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="p-1.5">Image</th><th className="p-1.5">Options</th><th className="p-1.5">SKU / VID</th>
                    <th className="p-1.5">Prix</th><th className="p-1.5">Stock</th><th className="p-1.5">Poids kg</th>
                    <th className="p-1.5">L×l×h cm</th><th className="p-1.5">CBM</th>
                  </tr>
                </thead>
                <tbody>
                  {d.variants.map((v: any) => (
                    <tr key={v.vid} className="border-t">
                      <td className="p-1.5">{v.image ? <img src={v.image} alt="" loading="lazy" className="h-10 w-10 rounded object-cover" /> : "—"}</td>
                      <td className="p-1.5">{v.options ? Object.entries(v.options).map(([k, val]) => `${k}: ${val}`).join(" · ") : v.key ?? "—"}</td>
                      <td className="p-1.5"><div>{v.sku ?? "—"}</div><div className="text-muted-foreground">{v.vid}</div></td>
                      <td className="p-1.5">{v.price ?? "—"}</td>
                      <td className="p-1.5">{v.stock ?? "inconnu"}</td>
                      <td className="p-1.5">{fmt(v.weightKg, 4)}</td>
                      <td className="p-1.5">{v.lengthCm && v.widthCm && v.heightCm ? `${v.lengthCm}×${v.widthCm}×${v.heightCm}` : "—"}</td>
                      <td className="p-1.5">{v.cbm ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              {data.exists ? (
                <Button size="sm" variant="outline" onClick={() => onSync(d.pid)}>Synchroniser ce produit</Button>
              ) : (
                <Button size="sm" onClick={() => onImport(d.pid, d.name, d.image)}>Importer en brouillon</Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-[10px] text-muted-foreground">{k}</p>
      <p className="break-all font-medium">{v}</p>
    </div>
  );
}
