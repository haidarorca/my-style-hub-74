import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, Store, Pencil, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { createVendor, deleteVendor, updateVendor } from "@/lib/admin.functions";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { CountrySelect } from "@/components/CountrySelect";
import { useCountries, useCountryLabel } from "@/hooks/use-countries";

export const Route = createFileRoute("/admin/vendors")({
  component: () => <PermissionGate perm="vendors"><VendorsPage /></PermissionGate>,
});

type VendorProfile = {
  email: string | null; full_name: string | null;
  shop_name: string | null; phone: string | null;
  source_country_id: string | null;
  vendor_mode: "commission" | "no_commission";
  ships_internationally: boolean;
  allowed_destination_country_ids: string[] | null;
};
type VendorRow = { user_id: string; profiles: VendorProfile | null };

function VendorsPage() {
  const qc = useQueryClient();
  const create = useServerFn(createVendor);
  const update = useServerFn(updateVendor);
  const del = useServerFn(deleteVendor);

  const { data: vendors, isLoading } = useQuery({
    queryKey: ["admin", "vendors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, profiles:profiles!inner(email, full_name, shop_name, phone, source_country_id, vendor_mode, ships_internationally, allowed_destination_country_ids)")
        .eq("role", "vendeur");
      if (error) throw error;
      return (data ?? []) as unknown as VendorRow[];
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", full_name: "", shop_name: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<VendorRow | null>(null);

  async function handleCreate() {
    setBusy(true);
    try {
      await create({ data: { ...form, phone: form.phone || null } });
      toast.success("Vendeur créé");
      setOpen(false);
      setForm({ email: "", password: "", full_name: "", shop_name: "", phone: "" });
      qc.invalidateQueries({ queryKey: ["admin", "vendors"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer ce vendeur ?")) return;
    try {
      await del({ data: { user_id: id } });
      toast.success("Supprimé");
      qc.invalidateQueries({ queryKey: ["admin", "vendors"] });
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Vendeurs</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-1 h-4 w-4" /> Nouveau vendeur</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Créer un compte vendeur</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><label className="text-xs">Nom complet</label>
                <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div><label className="text-xs">Nom de la boutique</label>
                <Input value={form.shop_name} onChange={(e) => setForm({ ...form, shop_name: e.target.value })} /></div>
              <div><label className="text-xs">Email</label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><label className="text-xs">Téléphone</label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><label className="text-xs">Mot de passe (min 6)</label>
                <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={busy}>{busy ? "Création…" : "Créer"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Liste des vendeurs</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : !vendors || vendors.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun vendeur.</p>
          ) : (
            <ul className="divide-y">
              {vendors.map((v) => (
                <li key={v.user_id} className="flex items-center gap-3 py-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent">
                    <Store className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{v.profiles?.shop_name || v.profiles?.full_name || "—"}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {v.profiles?.email}
                      {" • "}
                      {v.profiles?.vendor_mode === "commission" ? "Avec commission" : "Sans commission"}
                      {" • "}
                      {v.profiles?.ships_internationally ? "International" : "Local seulement"}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setEditing(v)} aria-label="Modifier">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(v.user_id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <EditVendorDialog
        vendor={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ["admin", "vendors"] });
          qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && (q.queryKey.includes("display-prices") || q.queryKey.includes("display-price-lines")) });
        }}
        save={update}
      />
    </div>
  );
}

function EditVendorDialog({
  vendor, onClose, onSaved, save,
}: {
  vendor: VendorRow | null;
  onClose: () => void;
  onSaved: () => void;
  save: ReturnType<typeof useServerFn<typeof updateVendor>>;
}) {
  const isOpen = !!vendor;
  const [shopName, setShopName] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [mode, setMode] = useState<"commission" | "no_commission">("no_commission");
  const [intl, setIntl] = useState(false);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const { data: countries } = useCountries({ onlyEnabled: true });
  const labelOf = useCountryLabel();

  // hydrate when opening
  const lastIdRef = vendor?.user_id ?? "";
  if (vendor && lastIdRef !== (window as unknown as { __evd?: string }).__evd) {
    (window as unknown as { __evd?: string }).__evd = lastIdRef;
    const p = vendor.profiles;
    setShopName(p?.shop_name ?? "");
    setFullName(p?.full_name ?? "");
    setPhone(p?.phone ?? "");
    setSourceId(p?.source_country_id ?? null);
    setMode(p?.vendor_mode ?? "no_commission");
    setIntl(p?.ships_internationally ?? false);
    setAllowed(p?.allowed_destination_country_ids ?? []);
  }

  async function handleSave() {
    if (!vendor) return;
    if (!sourceId) { toast.error("Pays source obligatoire"); return; }
    if (intl && allowed.length === 0) {
      toast.error("Sélectionnez au moins un pays de livraison autorisé (ou désactivez l'international).");
      return;
    }
    setSaving(true);
    try {
      await save({ data: {
        user_id: vendor.user_id,
        shop_name: shopName || null,
        full_name: fullName || null,
        phone: phone || null,
        source_country_id: sourceId,
        vendor_mode: mode,
        ships_internationally: intl,
        allowed_destination_country_ids: allowed,
      }});
      toast.success("Vendeur mis à jour");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setSaving(false); }
  }

  const sourceCountry = countries?.find((c) => c.id === sourceId);
  const toggleAllowed = (id: string) =>
    setAllowed((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) { (window as unknown as { __evd?: string }).__evd = ""; onClose(); }}}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Modifier le vendeur</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Nom de la boutique</Label>
            <Input value={shopName} onChange={(e) => setShopName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Nom complet</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Téléphone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Pays source des produits *</Label>
            <CountrySelect value={sourceId} onChange={setSourceId} onlyEnabled placeholder="Choisir le pays source" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Mode commission *</Label>
            <div className="grid grid-cols-2 gap-2">
              <Label className="flex cursor-pointer items-center gap-2 rounded-lg border p-2 has-[:checked]:border-primary has-[:checked]:bg-accent">
                <input type="radio" name="mode-edit" checked={mode === "no_commission"} onChange={() => setMode("no_commission")} />
                <span className="text-xs font-medium">Sans commission</span>
              </Label>
              <Label className="flex cursor-pointer items-center gap-2 rounded-lg border p-2 has-[:checked]:border-primary has-[:checked]:bg-accent">
                <input type="radio" name="mode-edit" checked={mode === "commission"} onChange={() => setMode("commission")} />
                <span className="text-xs font-medium">Avec commission</span>
              </Label>
            </div>
          </div>

          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-semibold">Vente internationale</Label>
                <p className="text-[11px] text-muted-foreground">
                  Désactivé = livraison uniquement dans {sourceCountry ? labelOf(sourceCountry) : "le pays source"}.
                </p>
              </div>
              <Switch checked={intl} onCheckedChange={setIntl} />
            </div>

            {intl && (
              <div className="space-y-1.5 pt-2 border-t">
                <Label className="text-xs">Pays de livraison autorisés *</Label>
                <p className="text-[11px] text-muted-foreground">
                  Cochez chaque pays vers lequel le vendeur peut livrer.
                </p>
                <div className="max-h-48 overflow-auto rounded-md border divide-y">
                  {(countries ?? []).map((c) => {
                    const checked = allowed.includes(c.id);
                    return (
                      <label key={c.id} className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAllowed(c.id)}
                        />
                        <span className="text-base">{c.flag_emoji ?? "🏳️"}</span>
                        <span className="flex-1 truncate">{labelOf(c)}</span>
                      </label>
                    );
                  })}
                </div>
                {allowed.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {allowed.map((id) => {
                      const c = countries?.find((x) => x.id === id);
                      if (!c) return null;
                      return (
                        <span key={id} className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px]">
                          {c.flag_emoji} {c.name}
                          <button type="button" onClick={() => toggleAllowed(id)} aria-label="Retirer">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
