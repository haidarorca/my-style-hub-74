import { useEffect, useState } from "react";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { KawscanProduct, KawscanTier } from "@/lib/kawscan/api";
import { KAWSCAN_UNITS } from "@/lib/kawscan/constants";
import { generateInternalCode, normalizeCode } from "@/lib/kawscan/codes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Editing = (KawscanProduct & { kawscan_price_tiers?: KawscanTier[] }) | null;

export function ProductForm({
  storeId,
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  storeId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Editing;
  onSaved: () => void;
}) {
  const [code, setCode] = useState("");
  const [internal, setInternal] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("piece");
  const [price, setPrice] = useState("");
  const [promoActive, setPromoActive] = useState(false);
  const [promoPrice, setPromoPrice] = useState("");
  const [promoStart, setPromoStart] = useState("");
  const [promoEnd, setPromoEnd] = useState("");
  const [showName, setShowName] = useState(false);
  const [showPrice, setShowPrice] = useState(true);
  const [tiers, setTiers] = useState<{ label: string; price: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCode(editing?.code ?? "");
    setInternal(editing?.is_internal_code ?? false);
    setName(editing?.name ?? "");
    setUnit(editing?.unit ?? "piece");
    setPrice(editing ? String(editing.price) : "");
    setPromoActive(editing?.promo_active ?? false);
    setPromoPrice(editing?.promo_price != null ? String(editing.promo_price) : "");
    setPromoStart(editing?.promo_starts_at?.slice(0, 10) ?? "");
    setPromoEnd(editing?.promo_ends_at?.slice(0, 10) ?? "");
    setShowName(editing?.show_name_on_label ?? false);
    setShowPrice(editing?.show_price_on_label ?? true);
    setTiers((editing?.kawscan_price_tiers ?? []).map((t) => ({ label: t.label, price: String(t.price) })));
  }, [open, editing]);

  async function save() {
    const cleanCode = normalizeCode(code);
    if (!cleanCode) return toast.error("Le code du produit est obligatoire.");
    const numericPrice = Number(price);
    if (!isFinite(numericPrice) || numericPrice < 0) return toast.error("Prix invalide.");

    setSaving(true);
    try {
      const payload = {
        store_id: storeId,
        code: cleanCode,
        is_internal_code: internal,
        code_kind: internal ? "qr" : "barcode",
        name: name.trim() || null,
        unit,
        price: numericPrice,
        promo_active: promoActive,
        promo_price: promoActive && promoPrice ? Number(promoPrice) : null,
        promo_starts_at: promoActive && promoStart ? new Date(promoStart).toISOString() : null,
        promo_ends_at: promoActive && promoEnd ? new Date(promoEnd).toISOString() : null,
        show_name_on_label: showName,
        show_price_on_label: showPrice,
      };

      let productId = editing?.id;
      if (editing) {
        const { error } = await supabase.from("kawscan_products").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("kawscan_products").insert(payload).select("id").single();
        if (error) throw error;
        productId = (data as { id: string }).id;
      }

      if (productId) {
        await supabase.from("kawscan_price_tiers").delete().eq("product_id", productId);
        const rows = tiers
          .filter((t) => t.label.trim() && t.price !== "")
          .map((t, i) => ({ product_id: productId!, label: t.label.trim(), price: Number(t.price), position: i }));
        if (rows.length) {
          const { error } = await supabase.from("kawscan_price_tiers").insert(rows);
          if (error) throw error;
        }
      }

      toast.success(editing ? "Produit mis à jour" : "Produit ajouté");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      const msg = (e as { message?: string }).message ?? "Erreur";
      toast.error(msg.includes("duplicate") ? "Ce code existe déjà dans ce magasin." : msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifier le produit" : "Ajouter un produit"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="p-code">Code-barres / QR</Label>
            <div className="flex gap-2">
              <Input id="p-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="5449000000996" inputMode="text" />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCode(generateInternalCode());
                  setInternal(true);
                }}
              >
                <Wand2 className="mr-2 h-4 w-4" /> Générer
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Produit sans code-barres (tomate, légumes…) : générez un code interne à imprimer.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="p-name">Nom du produit (facultatif)</Label>
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tomate" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Unité de vente</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KAWSCAN_UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-price">Prix</Label>
              <Input id="p-price" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="1000" />
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="p-promo">Prix promotionnel</Label>
              <Switch id="p-promo" checked={promoActive} onCheckedChange={setPromoActive} />
            </div>
            {promoActive && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Input value={promoPrice} onChange={(e) => setPromoPrice(e.target.value)} placeholder="Prix promo" inputMode="decimal" />
                <Input type="date" value={promoStart} onChange={(e) => setPromoStart(e.target.value)} />
                <Input type="date" value={promoEnd} onChange={(e) => setPromoEnd(e.target.value)} />
              </div>
            )}
          </div>

          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <Label>Autres niveaux de prix</Label>
              <Button type="button" size="sm" variant="outline" onClick={() => setTiers((t) => [...t, { label: "", price: "" }])}>
                <Plus className="mr-1 h-3 w-3" /> Ajouter
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {tiers.map((t, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={t.label}
                    placeholder="Carton"
                    onChange={(e) => setTiers((arr) => arr.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  />
                  <Input
                    value={t.price}
                    placeholder="8000"
                    inputMode="decimal"
                    onChange={(e) => setTiers((arr) => arr.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))}
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => setTiers((arr) => arr.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {tiers.length === 0 && <p className="text-xs text-muted-foreground">Facultatif : 2 pièces, paquet, carton…</p>}
            </div>
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium">Étiquette imprimée</p>
            <div className="flex items-center justify-between">
              <Label htmlFor="p-showname" className="font-normal">Afficher le nom du produit</Label>
              <Switch id="p-showname" checked={showName} onCheckedChange={setShowName} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="p-showprice" className="font-normal">Afficher le prix</Label>
              <Switch id="p-showprice" checked={showPrice} onCheckedChange={setShowPrice} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => void save()} disabled={saving}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
