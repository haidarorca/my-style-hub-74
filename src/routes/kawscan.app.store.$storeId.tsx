import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, Download, Pencil, Plus, QrCode, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { getStore, listProducts, subscriptionState, type KawscanProduct, type KawscanTier } from "@/lib/kawscan/api";
import { formatKawscanPrice, unitLabel } from "@/lib/kawscan/constants";
import { normalizeCode, storeScanUrl } from "@/lib/kawscan/codes";
import { qrDataUrl } from "@/lib/kawscan/render";
import { ProductForm } from "@/components/kawscan/ProductForm";
import { ScanDialog } from "@/components/kawscan/ScanDialog";
import { PrintLabels } from "@/components/kawscan/PrintLabels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/kawscan/app/store/$storeId")({
  component: StoreManage,
});

type FullProduct = KawscanProduct & { kawscan_price_tiers: KawscanTier[] };

function StoreManage() {
  const { storeId } = Route.useParams();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FullProduct | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scannedCode, setScannedCode] = useState<string | undefined>(undefined);
  const [qr, setQr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const store = useQuery({ queryKey: ["kawscan-store-manage", storeId], queryFn: () => getStore(storeId) });
  const products = useQuery({ queryKey: ["kawscan-products", storeId], queryFn: () => listProducts(storeId) });

  const scanUrl = store.data ? storeScanUrl(store.data.slug) : "";

  useEffect(() => {
    if (scanUrl) void qrDataUrl(scanUrl, 640).then(setQr);
  }, [scanUrl]);

  const filtered = useMemo(() => {
    const list = (products.data ?? []) as FullProduct[];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((p) => p.code.toLowerCase().includes(needle) || (p.name ?? "").toLowerCase().includes(needle));
  }, [products.data, q]);

  const currency = store.data?.currency_code ?? "XOF";
  const state = store.data ? subscriptionState(store.data.subscription, store.data.is_active) : "suspended";

  async function remove(id: string) {
    const { error } = await supabase.from("kawscan_products").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Produit supprimé");
    void qc.invalidateQueries({ queryKey: ["kawscan-products", storeId] });
  }

  function exportFile() {
    const rows = (products.data ?? []).map((p) => ({
      code: p.code,
      nom: p.name ?? "",
      unite: p.unit,
      prix: p.price,
      prix_promo: p.promo_active ? (p.promo_price ?? "") : "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Produits");
    XLSX.writeFile(wb, `kawscan-${store.data?.slug ?? "produits"}.xlsx`);
  }

  async function importFile(file: File) {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]!];
      if (!sheet) throw new Error("Fichier vide");
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      const payload = rows
        .map((r) => {
          const code = normalizeCode(String(r["code"] ?? r["Code"] ?? ""));
          const price = Number(r["prix"] ?? r["Prix"] ?? r["price"]);
          if (!code || !isFinite(price)) return null;
          return {
            store_id: storeId,
            code,
            name: String(r["nom"] ?? r["Nom"] ?? "") || null,
            unit: String(r["unite"] ?? r["Unite"] ?? "piece") || "piece",
            price,
          };
        })
        .filter(Boolean) as { store_id: string; code: string; name: string | null; unit: string; price: number }[];

      if (payload.length === 0) throw new Error("Aucune ligne valide. Colonnes attendues : code, nom, unite, prix.");

      const { error } = await supabase.from("kawscan_products").upsert(payload, { onConflict: "store_id,code" });
      if (error) throw error;
      toast.success(`${payload.length} produit(s) importé(s)`);
      void qc.invalidateQueries({ queryKey: ["kawscan-products", storeId] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (store.isLoading) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  if (!store.data) return <p className="text-sm text-muted-foreground">Magasin introuvable.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon"><Link to="/kawscan/app"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{store.data.name}</h1>
          <p className="text-xs text-muted-foreground">{scanUrl}</p>
        </div>
        {state !== "active" && <Badge variant="secondary">Accès inactif</Badge>}
      </div>

      <Tabs defaultValue="produits">
        <TabsList>
          <TabsTrigger value="produits">Produits</TabsTrigger>
          <TabsTrigger value="impression">Étiquettes</TabsTrigger>
          <TabsTrigger value="affiche">Affiche magasin</TabsTrigger>
        </TabsList>

        <TabsContent value="produits" className="space-y-4 pt-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-48 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un produit" className="pl-9" />
            </div>
            <Button onClick={() => { setEditing(null); setScannedCode(undefined); setFormOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Produit
            </Button>
            <Button variant="secondary" onClick={() => setScanOpen(true)}>
              <Camera className="mr-2 h-4 w-4" /> Scanner
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Importer
            </Button>
            <Button variant="outline" onClick={exportFile}>
              <Download className="mr-2 h-4 w-4" /> Exporter
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = "";
              }}
            />
          </div>

          <div className="divide-y rounded-xl border bg-background">
            {filtered.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.name || p.code}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.code} · {unitLabel(p.unit)}
                    {p.is_internal_code && " · code interne"}
                  </p>
                </div>
                <div className="text-right">
                  {p.promo_active && p.promo_price != null && (
                    <p className="text-xs text-muted-foreground line-through">{formatKawscanPrice(p.price, currency)}</p>
                  )}
                  <p className="font-semibold">
                    {formatKawscanPrice(p.promo_active && p.promo_price != null ? p.promo_price : p.price, currency)}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => { setEditing(p); setFormOpen(true); }}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => void remove(p.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">Aucun produit pour le moment.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="impression" className="pt-4">
          <PrintLabels products={(products.data ?? []) as FullProduct[]} currency={currency} />
        </TabsContent>

        <TabsContent value="affiche" className="pt-4">
          <div className="mx-auto max-w-sm rounded-2xl border bg-background p-6 text-center">
            <QrCode className="mx-auto h-5 w-5 text-primary" />
            <h2 className="mt-2 text-lg font-bold">{store.data.display_name || store.data.name}</h2>
            <p className="text-sm text-muted-foreground">Scannez pour voir les prix</p>
            {qr && <img src={qr} alt="QR code du magasin" className="mx-auto mt-4 w-56" />}
            <p className="mt-3 break-all text-[11px] text-muted-foreground">{scanUrl}</p>
            <Button
              className="mt-4 w-full"
              onClick={() => {
                const a = document.createElement("a");
                a.href = qr;
                a.download = `kawscan-${store.data!.slug}.png`;
                a.click();
              }}
              disabled={!qr}
            >
              <Download className="mr-2 h-4 w-4" /> Télécharger le QR
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      <ScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        onDetected={(code) => {
          const existing = (products.data ?? []).find((p) => p.code === code);
          setEditing(existing ?? null);
          setScannedCode(existing ? undefined : code);
          setFormOpen(true);
        }}
      />

      <ProductForm
        storeId={storeId}
        initialCode={scannedCode}
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSaved={() => void qc.invalidateQueries({ queryKey: ["kawscan-products", storeId] })}
      />
    </div>
  );
}
