import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Plus, Store } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { createStore, listMyStores, subscriptionState } from "@/lib/kawscan/api";
import { KAWSCAN_CURRENCIES } from "@/lib/kawscan/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/kawscan/app/")({
  component: MyStores,
});

const STATE_LABELS: Record<string, string> = {
  active: "Abonnement actif",
  suspended: "Accès suspendu",
  expired: "Abonnement expiré",
  not_started: "Abonnement à venir",
  disabled: "Désactivé",
};

function MyStores() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("XOF");

  const stores = useQuery({ queryKey: ["kawscan-my-stores"], queryFn: listMyStores });

  const create = useMutation({
    mutationFn: () => createStore({ name, currency_code: currency, owner_id: user!.id }),
    onSuccess: () => {
      toast.success("Magasin créé. Essai actif pendant 30 jours.");
      setOpen(false);
      setName("");
      void qc.invalidateQueries({ queryKey: ["kawscan-my-stores"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mes magasins</h1>
          <p className="text-sm text-muted-foreground">Gérez les prix affichés dans vos points de vente.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Magasin</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nouveau magasin</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="store-name">Nom du magasin</Label>
                <Input id="store-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Superette ABC" />
              </div>
              <div className="space-y-2">
                <Label>Devise</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KAWSCAN_CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.code} ({c.symbol})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
                Créer le magasin
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {stores.isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}

      {stores.data?.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Store className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-medium">Aucun magasin</p>
          <p className="text-sm text-muted-foreground">Créez votre premier magasin pour commencer.</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {stores.data?.map((s) => {
          const state = subscriptionState(s.subscription, s.is_active);
          return (
            <Link
              key={s.id}
              to="/kawscan/app/store/$storeId"
              params={{ storeId: s.id }}
              className="rounded-xl border bg-background p-4 transition-colors hover:border-primary"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.currency_code}</p>
                </div>
                <Badge variant={state === "active" ? "default" : "secondary"}>{STATE_LABELS[state]}</Badge>
              </div>
              <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Package className="h-4 w-4" /> {s.product_count} produit{s.product_count > 1 ? "s" : ""}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
