import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { createVendor, deleteVendor } from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin/vendors")({
  component: VendorsPage,
});

type VendorRow = {
  user_id: string;
  profiles: {
    email: string | null; full_name: string | null;
    shop_name: string | null; phone: string | null;
  } | null;
};

function VendorsPage() {
  const qc = useQueryClient();
  const create = useServerFn(createVendor);
  const del = useServerFn(deleteVendor);

  const { data: vendors, isLoading } = useQuery({
    queryKey: ["admin", "vendors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, profiles:profiles!inner(email, full_name, shop_name, phone)")
        .eq("role", "vendeur");
      if (error) throw error;
      return (data ?? []) as unknown as VendorRow[];
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", full_name: "", shop_name: "", phone: "" });
  const [busy, setBusy] = useState(false);

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
                    <div className="truncate text-xs text-muted-foreground">{v.profiles?.email} {v.profiles?.phone ? `• ${v.profiles.phone}` : ""}</div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(v.user_id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
