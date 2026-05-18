import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getShopContactPolicy, updateShopContactPolicy } from "@/lib/support.functions";

const MODES = [
  { v: "direct", l: "Contact direct autorisé (par défaut)" },
  { v: "after_order_only", l: "Uniquement après commande" },
  { v: "internal_only", l: "Messagerie interne seulement" },
  { v: "admin_only", l: "Via admin uniquement" },
  { v: "blocked", l: "Bloqué (aucun contact direct)" },
];

interface ShopPolicy {
  id: string;
  shop_name: string | null;
  vendor_mode: "no_commission" | "commission";
  contact_mode: string;
  show_whatsapp: boolean;
  show_email: boolean;
  show_phone: boolean;
  show_address: boolean;
  vendor_contact_force_visible: boolean;
  hide_contact_publicly: boolean;
}

export function ShopContactSettings({ shopId }: { shopId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getShopContactPolicy);
  const updateFn = useServerFn(updateShopContactPolicy);

  const { data, isLoading } = useQuery({
    queryKey: ["shop-contact-policy", shopId],
    queryFn: () => getFn({ data: { shopId } }),
  });

  const [form, setForm] = useState<Partial<ShopPolicy>>({});
  useEffect(() => { if (data) setForm(data as ShopPolicy); }, [data]);

  const m = useMutation({
    mutationFn: () => updateFn({
      data: {
        shopId,
        contact_mode: form.contact_mode,
        show_whatsapp: form.show_whatsapp,
        show_email: form.show_email,
        show_phone: form.show_phone,
        show_address: form.show_address,
        vendor_contact_force_visible: form.vendor_contact_force_visible,
        hide_contact_publicly: form.hide_contact_publicly,
      },
    }),
    onSuccess: () => {
      toast.success("Réglages contact mis à jour");
      qc.invalidateQueries({ queryKey: ["shop-contact-policy", shopId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  const set = <K extends keyof ShopPolicy>(k: K, v: ShopPolicy[K]) => setForm((f) => ({ ...f, [k]: v }));
  const isCommission = form.vendor_mode === "commission";

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Réglages contact de cette boutique</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Les réglages ci-dessous remplacent les réglages globaux pour cette boutique uniquement.
      </p>

      <div>
        <Label>Mode de contact</Label>
        <Select value={form.contact_mode ?? "direct"} onValueChange={(v) => set("contact_mode", v as ShopPolicy["contact_mode"])}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{MODES.map((m) => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {isCommission && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label className="text-sm font-semibold text-amber-900">Boutique commission</Label>
              <p className="text-xs text-amber-700">Par défaut les coordonnées vendeur sont masquées. Activer pour les rendre visibles malgré la commission.</p>
            </div>
            <Switch
              checked={!!form.vendor_contact_force_visible}
              onCheckedChange={(v) => set("vendor_contact_force_visible", v)}
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        {[
          ["show_whatsapp", "Afficher WhatsApp"],
          ["show_phone", "Afficher téléphone"],
          ["show_email", "Afficher email"],
          ["show_address", "Afficher adresse"],
        ].map(([k, l]) => (
          <div key={k as string} className="flex items-center justify-between rounded-lg border p-2.5">
            <Label className="text-sm">{l}</Label>
            <Switch
              checked={Boolean(form[k as keyof ShopPolicy])}
              onCheckedChange={(v) => set(k as keyof ShopPolicy, v as never)}
            />
          </div>
        ))}
        <div className="flex items-center justify-between rounded-lg border p-2.5">
          <Label className="text-sm">Masquer tous les contacts publiquement</Label>
          <Switch checked={!!form.hide_contact_publicly} onCheckedChange={(v) => set("hide_contact_publicly", v)} />
        </div>
      </div>

      <Button onClick={() => m.mutate()} disabled={m.isPending} className="w-full gap-2">
        <Save className="h-4 w-4" /> {m.isPending ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </Card>
  );
}
