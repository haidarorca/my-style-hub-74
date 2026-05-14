import { useEffect, useState } from "react";
import { z } from "zod";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { MapPin, Plus, Pencil, Trash2, Star, Crosshair, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/account")({
  component: AccountPage,
});

const addressSchema = z.object({
  label: z.string().trim().min(1, "Libellé requis").max(50),
  full_name: z.string().trim().min(2, "Nom trop court").max(100),
  phone: z.string().trim().min(7, "Numéro invalide").max(20).regex(/^[+0-9 ()-]+$/, "Numéro invalide"),
  phone_secondary: z.string().trim().max(20).regex(/^[+0-9 ()-]*$/, "Numéro invalide").optional().or(z.literal("")),
  phone_alt: z.string().trim().max(20).regex(/^[+0-9 ()-]*$/, "Numéro invalide").optional().or(z.literal("")),
  address: z.string().trim().min(3, "Adresse requise").max(300),
  city: z.string().trim().min(2, "Quartier/Ville requis").max(100),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

export interface Address {
  id: string;
  user_id: string;
  label: string;
  full_name: string;
  phone: string;
  phone_secondary: string | null;
  phone_alt: string | null;
  address: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
  is_default: boolean;
}

const emptyForm = {
  label: "Domicile",
  full_name: "",
  phone: "",
  phone_secondary: "",
  phone_alt: "",
  address: "",
  city: "",
  note: "",
  latitude: null as number | null,
  longitude: null as number | null,
};

function AccountPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Address | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.navigate({ to: "/login" });
  }, [loading, user, router]);

  const refresh = async () => {
    if (!user) return;
    setLoadingList(true);
    const { data } = await (supabase as any)
      .from("customer_addresses")
      .select("*")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    setAddresses((data ?? []) as Address[]);
    setLoadingList(false);
  };

  useEffect(() => { void refresh(); /* eslint-disable-next-line */ }, [user?.id]);

  const openNew = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      full_name: profile?.full_name ?? "",
      phone: profile?.phone ?? "",
    });
    setErrors({});
    setOpen(true);
  };

  const openEdit = (a: Address) => {
    setEditing(a);
    setForm({
      label: a.label,
      full_name: a.full_name,
      phone: a.phone,
      phone_secondary: a.phone_secondary ?? "",
      phone_alt: a.phone_alt ?? "",
      address: a.address,
      city: a.city,
      note: a.note ?? "",
      latitude: a.latitude,
      longitude: a.longitude,
    });
    setErrors({});
    setOpen(true);
  };

  const useGeolocation = () => {
    if (!navigator.geolocation) {
      toast.error("Géolocalisation non disponible");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({ ...f, latitude: pos.coords.latitude, longitude: pos.coords.longitude }));
        setLocating(false);
        toast.success("Position enregistrée");
      },
      () => {
        setLocating(false);
        toast.error("Impossible d'obtenir la position");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const save = async () => {
    if (!user) return;
    const parsed = addressSchema.safeParse(form);
    if (!parsed.success) {
      const e: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const k = i.path[0] as string;
        if (!e[k]) e[k] = i.message;
      }
      setErrors(e);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const payload = {
        ...parsed.data,
        note: parsed.data.note || null,
        phone_secondary: parsed.data.phone_secondary || null,
        phone_alt: parsed.data.phone_alt || null,
        latitude: form.latitude,
        longitude: form.longitude,
        user_id: user.id,
        is_default: editing ? editing.is_default : addresses.length === 0,
      };
      if (editing) {
        const { error } = await (supabase as any)
          .from("customer_addresses")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("customer_addresses").insert(payload);
        if (error) throw error;
      }
      toast.success("Adresse enregistrée");
      setOpen(false);
      await refresh();
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a: Address) => {
    if (!confirm("Supprimer cette adresse ?")) return;
    const { error } = await (supabase as any).from("customer_addresses").delete().eq("id", a.id);
    if (error) return toast.error("Erreur");
    toast.success("Supprimée");
    await refresh();
  };

  const setDefault = async (a: Address) => {
    if (!user) return;
    await (supabase as any)
      .from("customer_addresses")
      .update({ is_default: false })
      .eq("user_id", user.id);
    await (supabase as any)
      .from("customer_addresses")
      .update({ is_default: true })
      .eq("id", a.id);
    toast.success("Adresse par défaut mise à jour");
    await refresh();
  };

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Chargement…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-safe">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-3 py-4">
        <div className="mb-3 flex items-center gap-2">
          <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> Accueil
          </Link>
        </div>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-lg font-bold">Mes adresses</h1>
            <p className="text-xs text-muted-foreground">
              Enregistrez vos adresses pour commander en un clic.
            </p>
          </div>
          <Button onClick={openNew} size="sm" className="rounded-full">
            <Plus className="h-4 w-4" /> Ajouter
          </Button>
        </div>

        {loadingList ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : addresses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center">
            <MapPin className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              Aucune adresse enregistrée pour le moment.
            </p>
            <Button onClick={openNew} className="mt-4 rounded-full">
              <Plus className="h-4 w-4" /> Ajouter ma première adresse
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {addresses.map((a) => (
              <li key={a.id} className="rounded-xl border border-border bg-card p-3 shadow-soft">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{a.label}</span>
                      {a.is_default && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          <Star className="h-3 w-3" /> Par défaut
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm">{a.full_name}</p>
                    <p className="text-xs text-muted-foreground">{a.phone}{a.phone_secondary ? ` · ${a.phone_secondary}` : ""}{a.phone_alt ? ` · ${a.phone_alt}` : ""}</p>
                    <p className="mt-1 text-sm">{a.address}</p>
                    <p className="text-xs text-muted-foreground">{a.city}</p>
                    {a.note && <p className="mt-1 text-xs italic text-muted-foreground">« {a.note} »</p>}
                    {a.latitude != null && a.longitude != null && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        📍 {a.latitude.toFixed(5)}, {a.longitude.toFixed(5)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(a)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(a)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {!a.is_default && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-8 rounded-full text-xs"
                    onClick={() => setDefault(a)}
                  >
                    <Star className="h-3 w-3" /> Définir comme adresse principale
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier l'adresse" : "Nouvelle adresse"}</DialogTitle>
            <DialogDescription>Saisissez vos informations de livraison.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="a_label">Libellé *</Label>
              <Input id="a_label" placeholder="Domicile, Bureau…" value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })} maxLength={50} />
              {errors.label && <p className="mt-1 text-xs text-destructive">{errors.label}</p>}
            </div>
            <div>
              <Label htmlFor="a_name">Nom complet *</Label>
              <Input id="a_name" value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })} maxLength={100} />
              {errors.full_name && <p className="mt-1 text-xs text-destructive">{errors.full_name}</p>}
            </div>
            <div>
              <Label htmlFor="a_phone">Téléphone principal *</Label>
              <Input id="a_phone" type="tel" placeholder="+221 77 000 00 00" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={20} />
              <p className="mt-1 text-[11px] text-muted-foreground">WhatsApp si disponible</p>
              {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone}</p>}
            </div>
            <div>
              <Label htmlFor="a_phone2">Téléphone secondaire (optionnel)</Label>
              <Input id="a_phone2" type="tel" placeholder="+221 …" value={form.phone_secondary}
                onChange={(e) => setForm({ ...form, phone_secondary: e.target.value })} maxLength={20} />
              {errors.phone_secondary && <p className="mt-1 text-xs text-destructive">{errors.phone_secondary}</p>}
            </div>
            <div>
              <Label htmlFor="a_phone3">Téléphone alternatif (optionnel)</Label>
              <Input id="a_phone3" type="tel" placeholder="+221 …" value={form.phone_alt}
                onChange={(e) => setForm({ ...form, phone_alt: e.target.value })} maxLength={20} />
              <p className="mt-1 text-[11px] text-muted-foreground">Au cas où un numéro ne fonctionne pas</p>
              {errors.phone_alt && <p className="mt-1 text-xs text-destructive">{errors.phone_alt}</p>}
            </div>
            <div>
              <Label htmlFor="a_addr">Adresse *</Label>
              <Input id="a_addr" value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={300} />
              {errors.address && <p className="mt-1 text-xs text-destructive">{errors.address}</p>}
            </div>
            <div>
              <Label htmlFor="a_city">Quartier / Ville *</Label>
              <Input id="a_city" value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })} maxLength={100} />
              {errors.city && <p className="mt-1 text-xs text-destructive">{errors.city}</p>}
            </div>
            <div>
              <Button type="button" variant="outline" size="sm" onClick={useGeolocation} disabled={locating} className="w-full">
                <Crosshair className="h-4 w-4" />
                {locating ? "Localisation…" : form.latitude ? "Position enregistrée — actualiser" : "Utiliser ma position"}
              </Button>
            </div>
            <div>
              <Label htmlFor="a_note">Note (optionnel)</Label>
              <Textarea id="a_note" rows={2} value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={500} />
            </div>
            <Button onClick={save} disabled={saving} className="w-full">
              {saving ? "Enregistrement…" : "Enregistrer l'adresse"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
