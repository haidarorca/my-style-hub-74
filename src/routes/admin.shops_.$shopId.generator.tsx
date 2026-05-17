import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, RefreshCw, Send, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  analyzeSourceProduct, getExchangeRate, publishGeneratedProduct,
} from "@/lib/admin-generator.functions";
import { getAdminShop } from "@/lib/admin-shops.functions";

export const Route = createFileRoute("/admin/shops_/$shopId/generator")({
  component: GeneratorPage,
});

type Currency = "CNY" | "USD" | "EUR" | "XOF";

function GeneratorPage() {
  const { shopId } = Route.useParams();
  const router = useRouter();
  const fetchShop = useServerFn(getAdminShop);
  const analyzeFn = useServerFn(analyzeSourceProduct);
  const fxFn = useServerFn(getExchangeRate);
  const publishFn = useServerFn(publishGeneratedProduct);

  const { data: shop } = useQuery({
    queryKey: ["admin-shop", shopId],
    queryFn: () => fetchShop({ data: { id: shopId } }),
  });

  // Step 1: Input
  const [rawText, setRawText] = useState("");
  const [currency, setCurrency] = useState<Currency>("CNY");
  const [margin, setMargin] = useState<string>("1.5"); // multiplier on top of converted price

  // Step 2: Preview / edit
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sourcePrice, setSourcePrice] = useState<string>("");
  const [priceXof, setPriceXof] = useState<string>("");
  const [imageUrls, setImageUrls] = useState<string>(""); // textarea, 1 per line
  const [categoryId, setCategoryId] = useState<string>("");
  const [fxRate, setFxRate] = useState<number | null>(null);
  const [fxFetchedAt, setFxFetchedAt] = useState<string | null>(null);

  type VariantRow = {
    size: string; color: string; color_hex: string;
    stock: string; price_override: string; image_url: string;
  };
  const emptyVariant = (): VariantRow => ({
    size: "", color: "", color_hex: "", stock: "0", price_override: "", image_url: "",
  });
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const addVariant = () => setVariants((v) => [...v, emptyVariant()]);
  const removeVariant = (i: number) => setVariants((v) => v.filter((_, idx) => idx !== i));
  const updateVariant = (i: number, patch: Partial<VariantRow>) =>
    setVariants((v) => v.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  // Categories (flat list of level 3, with parents path)
  const { data: cats } = useQuery({
    queryKey: ["all-categories-flat"],
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("id, name, level, parent_id")
        .order("name");
      return data ?? [];
    },
  });
  const catOptions = useMemo(() => {
    const map = new Map((cats ?? []).map((c) => [c.id, c]));
    const path = (id: string): string => {
      const c = map.get(id);
      if (!c) return "";
      return c.parent_id ? `${path(c.parent_id)} › ${c.name}` : c.name;
    };
    return (cats ?? [])
      .filter((c) => c.level === 3)
      .map((c) => ({ id: c.id, label: path(c.id) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [cats]);

  // Auto-refresh FX whenever currency changes (and on mount when XOF target)
  useEffect(() => {
    if (currency === "XOF") {
      setFxRate(1);
      setFxFetchedAt(new Date().toISOString());
      return;
    }
    fxFn({ data: { from: currency, to: "XOF" } })
      .then((r) => { setFxRate(r.rate); setFxFetchedAt(r.fetched_at); })
      .catch((e: Error) => toast.error("Devises : " + e.message));
  }, [currency, fxFn]);

  // Recompute price_xof when source/margin/rate changes
  useEffect(() => {
    const src = Number(sourcePrice);
    const m = Number(margin);
    if (!fxRate || !Number.isFinite(src) || !Number.isFinite(m) || src <= 0) return;
    const xof = Math.round(src * fxRate * m);
    setPriceXof(String(xof));
  }, [sourcePrice, margin, fxRate]);

  const analyzeMut = useMutation({
    mutationFn: () => analyzeFn({ data: { raw_text: rawText, source_currency: currency } }),
    onSuccess: (r) => {
      setName(r.name_fr);
      setDescription(r.description_fr);
      setSourcePrice(String(r.source_price));
      setImageUrls(r.image_urls.join("\n"));
      if (r.suggested_category_id) setCategoryId(r.suggested_category_id);
      if (r.suggested_variants && r.suggested_variants.length > 0) {
        setVariants(
          r.suggested_variants.map((v) => ({
            size: v.size ?? "",
            color: v.color ?? "",
            color_hex: v.color_hex ?? "",
            stock: String(v.stock ?? 0),
            price_override: "",
            image_url: v.image_url ?? "",
          })),
        );
      }
      toast.success(
        `Analyse terminée${r.suggested_variants.length > 0 ? ` · ${r.suggested_variants.length} variante(s) détectée(s)` : ""}.`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const buildPublishPayload = () => {
    const urls = imageUrls.split("\n").map((s) => s.trim()).filter(Boolean);
    const px = Number(priceXof);
    if (!code.trim()) throw new Error("Code produit requis.");
    if (!name.trim()) throw new Error("Nom requis.");
    if (urls.length === 0) throw new Error("Au moins une URL d'image.");
    if (!Number.isFinite(px) || px <= 0) throw new Error("Prix FCFA invalide.");

    const cleanVariants = variants
      .map((v) => {
        const size = v.size.trim();
        const color = v.color.trim();
        if (!size && !color) return null;
        const hex = v.color_hex.trim();
        const validHex = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "";
        const stockNum = Number(v.stock);
        const priceNum = v.price_override.trim() ? Number(v.price_override) : null;
        const img = v.image_url.trim();
        return {
          size,
          color,
          color_hex: validHex,
          stock: Number.isFinite(stockNum) && stockNum >= 0 ? Math.floor(stockNum) : 0,
          price_override: priceNum !== null && Number.isFinite(priceNum) && priceNum >= 0 ? priceNum : null,
          image_url: /^https?:\/\//.test(img) ? img : "",
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    return {
      shop_id: shopId,
      code: code.trim(),
      name: name.trim(),
      description: description.trim() || null,
      price_xof: px,
      category_id: categoryId || null,
      image_urls: urls,
      variants: cleanVariants,
    };
  };

  const publishMut = useMutation({
    mutationFn: async () => publishFn({ data: buildPublishPayload() }),
    onSuccess: () => {
      toast.success("Produit publié dans la boutique.");
      router.navigate({ to: "/admin/shops" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 pb-12">
      <div className="flex items-center gap-2">
        <Button asChild size="sm" variant="ghost">
          <Link to="/admin/shops"><ArrowLeft className="mr-1 h-4 w-4" /> Retour</Link>
        </Button>
        <h1 className="text-lg font-bold">
          Générateur — {shop?.shop_name ?? "…"}
        </h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">1. Collez la source</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Devise source</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CNY">CNY (¥)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="EUR">EUR (€)</SelectItem>
                  <SelectItem value="XOF">XOF (FCFA)</SelectItem>
                </SelectContent>
              </Select>
              {fxRate !== null && currency !== "XOF" && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  1 {currency} = {fxRate.toFixed(2)} FCFA
                  {fxFetchedAt && ` · ${new Date(fxFetchedAt).toLocaleDateString()}`}
                </p>
              )}
            </div>
            <div>
              <Label>Marge × (multiplicateur)</Label>
              <Input
                type="number" step="0.1" min={1}
                value={margin}
                onChange={(e) => setMargin(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">1.5 = +50 % sur prix converti</p>
            </div>
          </div>
          <div>
            <Label>Texte source (titre, prix, description, URLs d'images…)</Label>
            <Textarea
              rows={8}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Collez ici tout ce que vous avez copié du site source (Taobao, 1688, AliExpress…). L'IA extraira le nom, prix, description et images."
            />
          </div>
          <Button
            type="button"
            disabled={analyzeMut.isPending || rawText.trim().length < 5}
            onClick={() => analyzeMut.mutate()}
            className="w-full"
          >
            {analyzeMut.isPending ? (
              <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Analyse…</>
            ) : (
              <><Sparkles className="mr-2 h-4 w-4" /> Analyser avec l'IA</>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">2. Vérifiez et complétez</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Code produit *</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ex: SHOP-001" />
          </div>
          <div>
            <Label>Nom (FR) *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Description (FR)</Label>
            <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Prix source ({currency})</Label>
              <Input
                type="number" min={0} step="0.01"
                value={sourcePrice}
                onChange={(e) => setSourcePrice(e.target.value)}
              />
            </div>
            <div>
              <Label>Prix de vente (FCFA) *</Label>
              <Input
                type="number" min={0}
                value={priceXof}
                onChange={(e) => setPriceXof(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Catégorie</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Choisir une catégorie" /></SelectTrigger>
              <SelectContent>
                {catOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>URLs des images (une par ligne) *</Label>
            <Textarea
              rows={4}
              value={imageUrls}
              onChange={(e) => setImageUrls(e.target.value)}
              placeholder="https://...
https://..."
            />
            {imageUrls.trim() && (
              <div className="mt-2 flex flex-wrap gap-2">
                {imageUrls.split("\n").map((u) => u.trim()).filter(Boolean).slice(0, 8).map((u, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={u} alt="" className="h-16 w-16 rounded border object-cover" onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.3"; }} />
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Variantes (taille / couleur)</span>
            <Button type="button" size="sm" variant="outline" onClick={addVariant}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {variants.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Aucune variante. Cliquez sur « Ajouter » ou laissez l'IA en détecter à partir du texte source.
            </p>
          ) : (
            variants.map((v, i) => (
              <div key={i} className="rounded-lg border p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Variante #{i + 1}</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => removeVariant(i)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Taille</Label>
                    <Input value={v.size} onChange={(e) => updateVariant(i, { size: e.target.value })} placeholder="M, 42, 10x15" />
                  </div>
                  <div>
                    <Label className="text-xs">Couleur</Label>
                    <Input value={v.color} onChange={(e) => updateVariant(i, { color: e.target.value })} placeholder="Rouge" />
                  </div>
                  <div>
                    <Label className="text-xs">Hex</Label>
                    <div className="flex items-center gap-1">
                      <Input
                        type="color"
                        className="h-9 w-12 p-1"
                        value={v.color_hex || "#000000"}
                        onChange={(e) => updateVariant(i, { color_hex: e.target.value })}
                      />
                      <Input
                        value={v.color_hex}
                        onChange={(e) => updateVariant(i, { color_hex: e.target.value })}
                        placeholder="#ff0000"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Stock</Label>
                    <Input
                      type="number" min={0}
                      value={v.stock}
                      onChange={(e) => updateVariant(i, { stock: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Prix override (FCFA)</Label>
                    <Input
                      type="number" min={0}
                      value={v.price_override}
                      onChange={(e) => updateVariant(i, { price_override: e.target.value })}
                      placeholder="(optionnel)"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Image (URL)</Label>
                    <Input
                      value={v.image_url}
                      onChange={(e) => updateVariant(i, { image_url: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                </div>
                {v.image_url && /^https?:\/\//.test(v.image_url) && (
                  <img
                    src={v.image_url}
                    alt=""
                    className="h-16 w-16 rounded border object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.3"; }}
                  />
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Button
        type="button"
        className="w-full"
        disabled={publishMut.isPending}
        onClick={() => publishMut.mutate()}
      >
        {publishMut.isPending ? (
          <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Publication…</>
        ) : (
          <><Send className="mr-2 h-4 w-4" /> Publier dans la boutique</>
        )}
      </Button>
    </div>
  );
}
