import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Truck, Plus, Pencil, Trash2, Power, Loader2 } from "lucide-react";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCountries } from "@/hooks/use-countries";
import {
  listShippingServices,
  upsertShippingService,
  deleteShippingService,
  type ShippingService,
} from "@/lib/shipping-services.functions";

export const Route = createFileRoute("/admin/shipping-services")({
  component: () => (
    <PermissionGate perm="orders">
      <ShippingServicesPage />
    </PermissionGate>
  ),
});

function ShippingServicesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listShippingServices);
  const delFn = useServerFn(deleteShippingService);
  const [editing, setEditing] = useState<ShippingService | "new" | null>(null);
  const { data: countries = [] } = useCountries({ onlyEnabled: false });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-shipping-services"],
    queryFn: () =>
      listFn({
        data: { source_country_id: null, destination_country_id: null, only_enabled: false },
      }),
  });

  const countryName = (id: string | null) =>
    id ? countries.find((c: { id: string; name: string }) => c.id === id)?.name ?? "—" : "Tous";

  async function onDelete(id: string) {
    if (!confirm("Supprimer ce service de transport ?")) return;
    try {
      await delFn({ data: { id } });
      toast.success("Supprimé");
      qc.invalidateQueries({ queryKey: ["admin-shipping-services"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Truck className="h-5 w-5 text-primary" /> Services de transport
          </h1>
          <p className="text-xs text-muted-foreground">
            Prix par kg et délais par route (pays source → pays destination).
          </p>
        </div>
        <Button onClick={() => setEditing("new")} size="sm">
          <Plus className="mr-1 h-4 w-4" /> Nouveau service
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Services configurés</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
            </div>
          ) : !data?.length ? (
            <p className="text-sm text-muted-foreground">
              Aucun service. Créez-en un pour la route Chine → Sénégal par exemple.
            </p>
          ) : (
            <ul className="divide-y">
              {data.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      {!s.is_enabled && <Badge variant="outline">Désactivé</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {countryName(s.source_country_id)} → {countryName(s.destination_country_id)} ·{" "}
                      {Number(s.price_per_kg).toLocaleString("fr-FR")} FCFA /{" "}
                      {s.pricing_unit === "kg" ? "kg" : "m³"}
                      {(s.delay_min_days != null || s.delay_max_days != null) && (
                        <>
                          {" · "}
                          {s.delay_min_days ?? "?"}–{s.delay_max_days ?? "?"} jours
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setEditing(s)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onDelete(s.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {editing && (
        <ServiceEditDialog
          service={editing === "new" ? null : editing}
          countries={countries}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["admin-shipping-services"] });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ServiceEditDialog({
  service,
  countries,
  onClose,
  onSaved,
}: {
  service: ShippingService | null;
  countries: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const upsertFn = useServerFn(upsertShippingService);
  const [form, setForm] = useState({
    id: service?.id ?? null,
    name: service?.name ?? "",
    source_country_id: service?.source_country_id ?? null,
    destination_country_id: service?.destination_country_id ?? null,
    price_per_kg: service?.price_per_kg ?? 0,
    pricing_unit: (service?.pricing_unit ?? "kg") as "kg" | "m3",
    delay_min_days: service?.delay_min_days ?? null,
    delay_max_days: service?.delay_max_days ?? null,
    description: service?.description ?? "",
    is_enabled: service?.is_enabled ?? true,
    position: service?.position ?? 0,
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.name.trim()) {
      toast.error("Nom requis");
      return;
    }
    setSaving(true);
    try {
      await upsertFn({
        data: {
          ...form,
          name: form.name.trim(),
          price_per_kg: Number(form.price_per_kg),
          delay_min_days:
            form.delay_min_days == null || form.delay_min_days === ("" as any)
              ? null
              : Number(form.delay_min_days),
          delay_max_days:
            form.delay_max_days == null || form.delay_max_days === ("" as any)
              ? null
              : Number(form.delay_max_days),
          description: (form.description ?? "").toString().trim() || null,
        },
      });
      toast.success("Enregistré");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{service ? "Modifier le service" : "Nouveau service"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Nom</label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex. Fret avion express"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Pays source</label>
              <Select
                value={form.source_country_id ?? "__all__"}
                onValueChange={(v) =>
                  setForm({ ...form, source_country_id: v === "__all__" ? null : v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tous</SelectItem>
                  {countries.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Pays destination</label>
              <Select
                value={form.destination_country_id ?? "__all__"}
                onValueChange={(v) =>
                  setForm({ ...form, destination_country_id: v === "__all__" ? null : v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tous</SelectItem>
                  {countries.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Prix (FCFA)</label>
              <Input
                type="number"
                min="0"
                value={form.price_per_kg as number}
                onChange={(e) => setForm({ ...form, price_per_kg: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Unité</label>
              <Select
                value={form.pricing_unit}
                onValueChange={(v) => setForm({ ...form, pricing_unit: v as "kg" | "m3" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kg">par kg</SelectItem>
                  <SelectItem value="m3">par m³</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Délai min (jours)</label>
              <Input
                type="number"
                min="0"
                value={form.delay_min_days ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    delay_min_days: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Délai max (jours)</label>
              <Input
                type="number"
                min="0"
                value={form.delay_max_days ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    delay_max_days: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Description (optionnel)</label>
            <Textarea
              rows={2}
              value={form.description as string}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_enabled}
              onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })}
            />
            <Power className="h-3.5 w-3.5" /> Service actif
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Enregistrer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
