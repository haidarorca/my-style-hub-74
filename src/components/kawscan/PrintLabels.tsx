import { useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import type { KawscanProduct } from "@/lib/kawscan/api";
import { PAPER_FORMATS, SHEET_LAYOUTS, formatKawscanPrice, unitLabel, type PaperFormat } from "@/lib/kawscan/constants";
import { barcodeDataUrl, qrDataUrl } from "@/lib/kawscan/render";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function PrintLabels({
  products,
  currency,
}: {
  products: KawscanProduct[];
  currency: string;
}) {
  const [format, setFormat] = useState("A4");
  const [perPage, setPerPage] = useState("8");
  const [selected, setSelected] = useState<string[]>([]);
  const [images, setImages] = useState<Record<string, string>>({});

  const chosen = useMemo(
    () => products.filter((p) => selected.includes(p.id)),
    [products, selected],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      for (const p of chosen) {
        if (images[p.id]) {
          next[p.id] = images[p.id];
          continue;
        }
        next[p.id] = p.is_internal_code
          ? await qrDataUrl(p.code, 320)
          : barcodeDataUrl(p.code);
      }
      if (!cancelled) setImages(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen.map((p) => p.id).join(",")]);

  const paper = PAPER_FORMATS[format as PaperFormat];
  const layout = SHEET_LAYOUTS[Number(perPage)];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 print:hidden">
        <div className="space-y-2">
          <Label>Format papier</Label>
          <Select value={format} onValueChange={setFormat}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(PAPER_FORMATS).map(([key, f]) => <SelectItem key={key} value={key}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Étiquettes par page</Label>
          <Select value={perPage} onValueChange={setPerPage}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.keys(SHEET_LAYOUTS).map((n) => <SelectItem key={n} value={n}>{n} par page</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button className="w-full" disabled={chosen.length === 0} onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Imprimer ({chosen.length})
          </Button>
        </div>
      </div>

      <div className="rounded-lg border print:hidden">
        <div className="flex items-center gap-2 border-b p-3">
          <Checkbox
            checked={selected.length === products.length && products.length > 0}
            onCheckedChange={(v) => setSelected(v ? products.map((p) => p.id) : [])}
          />
          <span className="text-sm font-medium">Tout sélectionner</span>
        </div>
        <div className="max-h-72 divide-y overflow-y-auto">
          {products.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-3 p-3 text-sm">
              <Checkbox
                checked={selected.includes(p.id)}
                onCheckedChange={(v) =>
                  setSelected((s) => (v ? [...s, p.id] : s.filter((x) => x !== p.id)))
                }
              />
              <span className="flex-1 truncate">{p.name || p.code}</span>
              <span className="font-semibold">{formatKawscanPrice(p.price, currency)}</span>
            </label>
          ))}
          {products.length === 0 && <p className="p-4 text-sm text-muted-foreground">Aucun produit.</p>}
        </div>
      </div>

      {/* Feuille d'impression */}
      <div id="kawscan-print-sheet" className="hidden print:block">
        <div
          style={{
            width: `${paper.width}mm`,
            display: "grid",
            gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
            gap: "4mm",
            padding: "6mm",
          }}
        >
          {chosen.map((p) => (
            <div
              key={p.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: "2mm",
                padding: "3mm",
                textAlign: "center",
                breakInside: "avoid",
              }}
            >
              {p.show_name_on_label && p.name && (
                <div style={{ fontSize: "10pt", fontWeight: 600, marginBottom: "1mm" }}>{p.name}</div>
              )}
              {images[p.id] && (
                <img src={images[p.id]} alt="" style={{ width: "100%", maxHeight: "26mm", objectFit: "contain" }} />
              )}
              <div style={{ fontSize: "7pt", letterSpacing: "0.5px" }}>{p.code}</div>
              {p.show_price_on_label && (
                <div style={{ fontSize: "13pt", fontWeight: 800, marginTop: "1mm" }}>
                  {formatKawscanPrice(p.promo_active && p.promo_price != null ? p.promo_price : p.price, currency)}
                  {p.unit !== "piece" && (
                    <span style={{ fontSize: "8pt", fontWeight: 500 }}> / {unitLabel(p.unit)}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: ${format}; margin: 0; }
          body * { visibility: hidden; }
          #kawscan-print-sheet, #kawscan-print-sheet * { visibility: visible; }
          #kawscan-print-sheet { position: absolute; left: 0; top: 0; }
        }
      `}</style>
    </div>
  );
}
