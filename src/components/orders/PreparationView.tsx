import { useMemo, useState } from "react";
import {
  Package, Printer, FileSpreadsheet, Copy, ChevronDown, Eye, Store,
  Download, ImageIcon, CheckCircle2, FileText, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { PrepGroup, PrepResult, PrepCustomization } from "@/lib/preparation.functions";

const TONES = [
  "bg-blue-500/5 border-blue-500/30",
  "bg-emerald-500/5 border-emerald-500/30",
  "bg-amber-500/5 border-amber-500/30",
  "bg-violet-500/5 border-violet-500/30",
  "bg-rose-500/5 border-rose-500/30",
  "bg-cyan-500/5 border-cyan-500/30",
  "bg-orange-500/5 border-orange-500/30",
  "bg-fuchsia-500/5 border-fuchsia-500/30",
];

function toneFor(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return TONES[Math.abs(h) % TONES.length];
}

type Props = {
  data: PrepResult;
  onMarkInPreparation?: () => void;
  markPending?: boolean;
};

export function PreparationView({ data, onMarkInPreparation, markPending }: Props) {
  const [customsOpen, setCustomsOpen] = useState<PrepGroup | null>(null);
  const [ordersOpen, setOrdersOpen] = useState<PrepGroup | null>(null);
  const [zoomImg, setZoomImg] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const mode = data.mode;
  const totalUnits = useMemo(
    () => data.groups.reduce((s, g) => s + g.total_quantity, 0),
    [data.groups],
  );

  const allCustomImages = useMemo(() => {
    const urls: string[] = [];
    for (const g of data.groups) {
      for (const c of g.customizations) if (c.image_url) urls.push(c.image_url);
    }
    return urls;
  }, [data.groups]);

  const handlePrint = () => window.print();

  const handleCopy = async () => {
    const lines: string[] = [];
    lines.push(`Préparation groupée — ${data.orders.length} commande(s) · ${totalUnits} pièce(s)`);
    lines.push("");
    for (const g of data.groups) {
      const vendor = mode === "admin" && g.vendor_shop_name ? ` [${g.vendor_shop_name}]` : "";
      lines.push(`■ ${g.product_name}${vendor} (${g.product_code}) — total ${g.total_quantity}`);
      for (const v of g.variants) {
        const sc = [v.size, v.color].filter(Boolean).join(" / ") || "Standard";
        lines.push(`   - ${sc} × ${v.quantity}`);
      }
      if (g.customizations.length > 0) {
        lines.push(`   ✎ ${g.customizations.length} personnalisation(s)`);
      }
      lines.push("");
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("Résumé copié");
    } catch {
      toast.error("Copie impossible");
    }
  };

  const handleExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const rows: any[] = [];
      for (const g of data.groups) {
        if (g.variants.length === 0 && g.customizations.length === 0) {
          rows.push({
            ...(mode === "admin" ? { Vendeur: g.vendor_shop_name ?? "" } : {}),
            Produit: g.product_name,
            Code: g.product_code,
            Taille: "",
            Couleur: "",
            Quantité: g.total_quantity,
            Personnalisé: "",
          });
        }
        for (const v of g.variants) {
          rows.push({
            ...(mode === "admin" ? { Vendeur: g.vendor_shop_name ?? "" } : {}),
            Produit: g.product_name,
            Code: g.product_code,
            Taille: v.size ?? "",
            Couleur: v.color ?? "",
            Quantité: v.quantity,
            Personnalisé: "",
          });
        }
        for (const c of g.customizations) {
          rows.push({
            ...(mode === "admin" ? { Vendeur: g.vendor_shop_name ?? "" } : {}),
            Produit: g.product_name,
            Code: g.product_code,
            Taille: "",
            Couleur: "",
            Quantité: c.quantity,
            Personnalisé: `#${c.order_short} · ${c.customer_name ?? ""} · ${c.text ?? ""}`,
          });
        }
      }
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Préparation");
      XLSX.writeFile(wb, `preparation-${Date.now()}.xlsx`);
    } catch (e) {
      toast.error("Export Excel impossible");
    }
  };

  const handleDownloadAllImages = async () => {
    if (allCustomImages.length === 0) {
      toast.message("Aucune image personnalisation");
      return;
    }
    setDownloading(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      let i = 1;
      for (const url of allCustomImages) {
        try {
          const res = await fetch(url, { mode: "cors" });
          if (!res.ok) continue;
          const blob = await res.blob();
          const ext = (blob.type.split("/")[1] || "jpg").split("+")[0];
          zip.file(`personnalisation-${String(i).padStart(3, "0")}.${ext}`, blob);
          i++;
        } catch {
          // skip
        }
      }
      const out = await zip.generateAsync({ type: "blob" });
      const u = URL.createObjectURL(out);
      const a = document.createElement("a");
      a.href = u;
      a.download = `personnalisations-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(u);
      toast.success(`${i - 1} image(s) téléchargée(s)`);
    } catch {
      toast.error("Téléchargement impossible");
    } finally {
      setDownloading(false);
    }
  };

  if (data.groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
        <Package className="mx-auto mb-2 h-8 w-8 opacity-50" />
        Aucune commande à préparer. Seuls les statuts <strong>Nouvelle</strong> et <strong>Confirmée</strong> sont inclus.
        {data.skipped_orders > 0 && (
          <p className="mt-2 text-xs">
            {data.skipped_orders} commande(s) ignorée(s) (statut non éligible).
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="sticky top-0 z-20 -mx-3 flex flex-wrap items-center gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur print:hidden">
        <div className="mr-auto text-xs text-muted-foreground">
          <strong className="text-foreground">{data.orders.length}</strong> commande(s) ·{" "}
          <strong className="text-foreground">{totalUnits}</strong> pièce(s) ·{" "}
          <strong className="text-foreground">{data.groups.length}</strong> produit(s)
          {data.skipped_orders > 0 && (
            <span className="ml-2 text-amber-600">
              · {data.skipped_orders} ignorée(s)
            </span>
          )}
        </div>
        {onMarkInPreparation && (
          <Button size="sm" variant="default" onClick={onMarkInPreparation} disabled={markPending}>
            {markPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            <span className="hidden sm:inline">Marquer en préparation</span>
            <span className="sm:hidden">Préparer</span>
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={handlePrint}>
          <Printer className="h-4 w-4" />
          <span className="hidden sm:inline">Imprimer / PDF</span>
        </Button>
        <Button size="sm" variant="outline" onClick={handleExcel}>
          <FileSpreadsheet className="h-4 w-4" />
          <span className="hidden sm:inline">Excel</span>
        </Button>
        <Button size="sm" variant="outline" onClick={handleCopy}>
          <Copy className="h-4 w-4" />
          <span className="hidden sm:inline">Copier</span>
        </Button>
        {allCustomImages.length > 0 && (
          <Button size="sm" variant="outline" onClick={handleDownloadAllImages} disabled={downloading}>
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span className="hidden sm:inline">Images ({allCustomImages.length})</span>
          </Button>
        )}
      </div>

      {/* Groups */}
      <ul className="space-y-3">
        {data.groups.map((g) => (
          <ProductGroupCard
            key={g.key}
            group={g}
            mode={mode}
            onShowCustoms={() => setCustomsOpen(g)}
            onShowOrders={() => setOrdersOpen(g)}
            onZoom={setZoomImg}
          />
        ))}
      </ul>

      {/* Customizations dialog */}
      <Dialog open={!!customsOpen} onOpenChange={(o) => !o && setCustomsOpen(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Personnalisations · {customsOpen?.product_name}
            </DialogTitle>
          </DialogHeader>
          {customsOpen && (
            <ul className="space-y-3">
              {customsOpen.customizations.map((c, i) => (
                <CustomizationItem key={i} c={c} onZoom={setZoomImg} />
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      {/* Orders dialog */}
      <Dialog open={!!ordersOpen} onOpenChange={(o) => !o && setOrdersOpen(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Commandes concernées · {ordersOpen?.product_name}</DialogTitle>
          </DialogHeader>
          {ordersOpen && (
            <ul className="space-y-2 text-sm">
              {ordersOpen.order_ids.map((oid) => {
                const o = data.orders.find((x) => x.id === oid);
                if (!o) return null;
                return (
                  <li key={oid} className="rounded-lg border p-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs">#{oid.slice(0, 8)}</span>
                      <Badge variant="outline" className="text-[10px]">{o.status}</Badge>
                    </div>
                    <div className="mt-1 text-sm font-semibold">{o.customer_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {o.customer_phone ?? ""} {o.city ? ` · ${o.city}` : ""}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      {/* Image zoom */}
      <Dialog open={!!zoomImg} onOpenChange={(o) => !o && setZoomImg(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Aperçu</DialogTitle></DialogHeader>
          {zoomImg && (
            <div className="space-y-3">
              <img src={zoomImg} alt="" className="max-h-[70vh] w-full object-contain" />
              <a href={zoomImg} target="_blank" rel="noreferrer" download>
                <Button className="w-full gap-2">
                  <Download className="h-4 w-4" /> Télécharger
                </Button>
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProductGroupCard({
  group, mode, onShowCustoms, onShowOrders, onZoom,
}: {
  group: PrepGroup;
  mode: "vendor" | "admin";
  onShowCustoms: () => void;
  onShowOrders: () => void;
  onZoom: (url: string) => void;
}) {
  const tone = toneFor(group.key);
  return (
    <li className={cn("overflow-hidden rounded-xl border-2", tone)}>
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="group flex w-full items-start gap-3 p-3 text-left hover:bg-background/40">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); if (group.product_image_url) onZoom(group.product_image_url); }}
            className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-muted"
          >
            {group.product_image_url ? (
              <img src={group.product_image_url} alt={group.product_name} loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-content-center"><ImageIcon className="h-5 w-5 text-muted-foreground" /></div>
            )}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold">{group.product_name}</h3>
              <Badge variant="outline" className="text-[10px]">{group.product_code}</Badge>
              {mode === "admin" && group.vendor_shop_name && (
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <Store className="h-3 w-3" /> {group.vendor_shop_name}
                </Badge>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span><strong className="text-foreground">{group.total_quantity}</strong> pièce(s)</span>
              <span>{group.variants.length} variante(s)</span>
              <span>{group.order_ids.length} commande(s)</span>
              {group.customizations.length > 0 && (
                <span className="text-primary font-medium">✎ {group.customizations.length} perso</span>
              )}
            </div>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-2 border-t bg-background/50 p-3">
            {group.variants.length > 0 && (
              <ul className="divide-y rounded-lg border bg-card">
                {group.variants.map((v) => (
                  <li key={v.key} className="flex items-center gap-3 p-2 text-xs">
                    <div className="flex flex-1 flex-wrap items-center gap-2">
                      {v.size && <Badge variant="outline">Taille {v.size}</Badge>}
                      {v.color && (
                        <Badge variant="outline" className="gap-1">
                          <span className="inline-block h-2.5 w-2.5 rounded-full border" style={{ backgroundColor: /^#/.test(v.color) ? v.color : undefined }} />
                          {v.color}
                        </Badge>
                      )}
                      {!v.size && !v.color && <span className="text-muted-foreground">Standard</span>}
                      <span className="text-muted-foreground">
                        {v.orders.length} commande(s)
                      </span>
                    </div>
                    <div className="rounded-full bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
                      × {v.quantity}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {group.customizations.length > 0 && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-primary">
                    ✎ {group.customizations.length} pièce(s) personnalisée(s)
                  </div>
                  <Button size="sm" variant="ghost" className="h-7" onClick={onShowCustoms}>
                    <Eye className="h-3.5 w-3.5" /> Voir
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onShowOrders}>
                <FileText className="h-3.5 w-3.5" /> Commandes concernées
              </Button>
              {group.customizations.length > 0 && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onShowCustoms}>
                  <ImageIcon className="h-3.5 w-3.5" /> Personnalisations
                </Button>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function CustomizationItem({ c, onZoom }: { c: PrepCustomization; onZoom: (url: string) => void }) {
  return (
    <li className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs">
          <span className="font-mono">#{c.order_short}</span>
          {c.customer_name && <span className="ml-2 font-semibold">{c.customer_name}</span>}
          {c.customer_phone && <span className="ml-2 text-muted-foreground">{c.customer_phone}</span>}
        </div>
        <Badge>× {c.quantity}</Badge>
      </div>
      {c.text && (
        <div className="mt-2 space-y-1 text-xs">
          <div>Texte : <span className="font-medium">{c.text}</span></div>
          {c.font && <div>Police : <span className="font-medium">{c.font}</span></div>}
          {c.color && (
            <div className="flex items-center gap-1">
              Couleur :
              <span className="inline-block h-3 w-3 rounded-full border" style={{ backgroundColor: c.color }} />
              <span className="font-mono">{c.color}</span>
            </div>
          )}
          <div className="mt-1 rounded bg-background p-2 text-base"
               style={{ fontFamily: c.font || undefined, color: c.color || undefined }}>
            {c.text}
          </div>
        </div>
      )}
      {c.image_url && (
        <div className="mt-2 flex items-end gap-2">
          <button onClick={() => onZoom(c.image_url!)} className="h-24 w-24 overflow-hidden rounded border bg-muted">
            <img src={c.image_url} alt="" loading="lazy" className="h-full w-full object-contain" />
          </button>
          <a href={c.image_url} target="_blank" rel="noreferrer" download>
            <Button size="sm" variant="outline" className="h-7">
              <Download className="h-3.5 w-3.5" /> Télécharger
            </Button>
          </a>
        </div>
      )}
    </li>
  );
}
