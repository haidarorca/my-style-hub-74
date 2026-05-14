import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, Trash2, Store, ShoppingBag } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/use-cart";
import { useAuth } from "@/hooks/use-auth";
import { buildWhatsAppMessage, whatsappUrl, type WhatsAppLine } from "@/lib/whatsapp";

export const Route = createFileRoute("/cart")({
  component: CartPage,
});

function CartPage() {
  const { user } = useAuth();
  const { items, updateQuantity, removeItem } = useCart();

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-md px-4 py-16 text-center">
          <ShoppingBag className="mx-auto h-12 w-12 text-muted-foreground" />
          <h1 className="mt-3 text-lg font-bold">Connectez-vous</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pour voir votre panier.</p>
          <Link to="/login">
            <Button className="mt-4 rounded-full">Se connecter</Button>
          </Link>
        </main>
      </div>
    );
  }

  // Group by vendor
  const groups = new Map<string, { shopName: string; vendorId: string; items: typeof items }>();
  for (const it of items) {
    const p = (it as any).products;
    if (!p) continue;
    const profile = p.profiles;
    const shopName = profile?.shop_name || profile?.full_name || "Boutique";
    const key = p.vendor_id;
    if (!groups.has(key)) groups.set(key, { shopName, vendorId: key, items: [] });
    groups.get(key)!.items.push(it);
  }

  const unitPrice = (it: any) => Number(it.product_variants?.price_override ?? it.products?.price ?? 0);
  const grandTotal = items.reduce((s, it: any) => s + unitPrice(it) * it.quantity, 0);

  const onCheckout = () => {
    const lines: WhatsAppLine[] = items.map((it: any) => ({
      shopName: it.products?.profiles?.shop_name || it.products?.profiles?.full_name || "Boutique",
      code: it.products?.code ?? "",
      name: it.products?.name ?? "",
      size: it.product_variants?.size ?? null,
      color: it.product_variants?.color ?? null,
      quantity: it.quantity,
      unitPrice: unitPrice(it),
    }));
    const msg = buildWhatsAppMessage(lines);
    window.open(whatsappUrl(msg), "_blank");
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-3 py-4">
        <h1 className="mb-3 text-lg font-bold">Mon panier</h1>

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Votre panier est vide.
          </div>
        ) : (
          <div className="space-y-4">
            {Array.from(groups.values()).map((g) => (
              <section key={g.vendorId} className="overflow-hidden rounded-xl bg-card shadow-soft">
                <header className="flex items-center gap-2 border-b border-border bg-accent/40 px-3 py-2">
                  <Store className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">{g.shopName}</span>
                </header>
                <ul>
                  {g.items.map((it: any) => {
                    const img = it.products?.product_images?.[0]?.url;
                    const price = unitPrice(it);
                    return (
                      <li key={it.id} className="flex gap-3 border-b border-border p-3 last:border-0">
                        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                          {img && <img src={img} alt={it.products.name} className="h-full w-full object-cover" />}
                        </div>
                        <div className="flex flex-1 flex-col">
                          <p className="line-clamp-2 text-sm">{it.products.name}</p>
                          <p className="text-xs text-muted-foreground">Code : {it.products.code}</p>
                          {(it.product_variants?.size || it.product_variants?.color) && (
                            <p className="text-xs text-muted-foreground">
                              {it.product_variants.size && <>Taille : {it.product_variants.size}</>}
                              {it.product_variants.size && it.product_variants.color && " · "}
                              {it.product_variants.color && <>Couleur : {it.product_variants.color}</>}
                            </p>
                          )}
                          <div className="mt-auto flex items-end justify-between pt-2">
                            <p className="text-sm font-bold text-primary">
                              {price.toLocaleString("fr-FR")} FCFA
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => removeItem(it.id)}
                                className="text-muted-foreground hover:text-destructive"
                                aria-label="Supprimer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                              <div className="inline-flex items-center rounded-md border border-border">
                                <button
                                  className="flex h-7 w-7 items-center justify-center"
                                  onClick={() => updateQuantity(it.id, it.quantity - 1)}
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </button>
                                <span className="w-8 text-center text-sm font-semibold">{it.quantity}</span>
                                <button
                                  className="flex h-7 w-7 items-center justify-center"
                                  onClick={() => updateQuantity(it.id, it.quantity + 1)}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>

      {items.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur pb-safe">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-3 py-3">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-lg font-extrabold text-primary">
                {grandTotal.toLocaleString("fr-FR")} FCFA
              </p>
            </div>
            <Button className="h-12 rounded-full px-6 text-sm font-semibold" onClick={onCheckout}>
              Passer la commande (WhatsApp)
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
