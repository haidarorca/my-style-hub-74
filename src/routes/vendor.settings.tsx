import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/vendor/settings")({
  component: VendorSettings,
});

function VendorSettings() {
  const { user, profile, refreshProfile } = useAuth();
  const [shopName, setShopName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setShopName(profile.shop_name ?? "");
      setPhone(profile.phone ?? "");
      setAddress(profile.address ?? "");
    }
  }, [profile]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ shop_name: shopName, phone, address })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error("Erreur : " + error.message);
      return;
    }
    await refreshProfile();
    toast.success("Boutique enregistrée");
  };

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="text-xl font-bold">Paramètres boutique</h1>

      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="space-y-1.5">
          <Label htmlFor="shop">Nom de la boutique</Label>
          <Input id="shop" value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="Ma boutique" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Téléphone</Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+225 ..." />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="addr">Adresse</Label>
          <Textarea id="addr" value={address} onChange={(e) => setAddress(e.target.value)} rows={3} />
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</Button>
        </div>
      </div>

      <Link to="/account" className="block text-center text-sm text-muted-foreground underline">
        Modifier mon compte
      </Link>
    </div>
  );
}
