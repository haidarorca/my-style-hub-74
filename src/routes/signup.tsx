import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { MapPin, Loader2, Eye, EyeOff, Home } from "lucide-react";
import { BackButton } from "@/components/layout/BackButton";
import { useI18n } from "@/hooks/use-i18n";
import { EditableLabel } from "@/components/admin/EditableLabel";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [sex, setSex] = useState<"homme" | "femme" | "">("");
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const handleGeolocate = () => {
    if (!navigator.geolocation) {
      toast.error("Géolocalisation indisponible sur ce navigateur.");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        toast.success("Position détectée");
        setGeoLoading(false);
      },
      (err) => {
        toast.error("Impossible de récupérer la position : " + err.message);
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sex) {
      toast.error("Merci de sélectionner ton sexe.");
      return;
    }
    if (!address.trim() && !coords) {
      toast.error("Merci de fournir une adresse ou ta position.");
      return;
    }
    setLoading(true);

    const redirectUrl = `${window.location.origin}/`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: fullName },
      },
    });
    if (error || !data.user) {
      setLoading(false);
      toast.error(error?.message ?? "Inscription échouée.");
      return;
    }

    // Update profile with sex, address, coords, phone
    const { error: profErr } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        sex,
        phone,
        address: address || null,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
      })
      .eq("id", data.user.id);

    setLoading(false);
    if (profErr) {
      toast.error("Compte créé, mais profil incomplet : " + profErr.message);
    } else {
      toast.success("Compte créé !");
    }
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-background pt-safe">
      <div className="page-container flex max-w-md flex-col py-4">
        <div className="flex items-center justify-between gap-2">
          <BackButton fallbackTo="/" />
          <Link
            to="/"
            aria-label={t("nav.home")}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Home className="h-4 w-4" />
            <span>{t("nav.home")}</span>
          </Link>
        </div>
        <h1 className="mt-4 text-2xl font-bold">Créer un compte</h1>
        <p className="mt-1 text-sm text-muted-foreground">Rejoins-nous pour shopper et personnaliser tes produits. Vous pouvez aussi commander sans compte.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Nom complet</Label>
            <Input id="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Mot de passe</Label>
            <div className="relative">
              <Input id="password" type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className="pr-10" />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Téléphone</Label>
            <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+221…" />
          </div>

          <div className="space-y-2">
            <Label>Sexe *</Label>
            <RadioGroup value={sex} onValueChange={(v) => setSex(v as "homme" | "femme")} className="grid grid-cols-2 gap-2">
              <Label htmlFor="sex-h" className="flex cursor-pointer items-center gap-2 rounded-xl border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-accent">
                <RadioGroupItem id="sex-h" value="homme" />
                <span>Homme</span>
              </Label>
              <Label htmlFor="sex-f" className="flex cursor-pointer items-center gap-2 rounded-xl border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-accent">
                <RadioGroupItem id="sex-f" value="femme" />
                <span>Femme</span>
              </Label>
            </RadioGroup>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="address">Adresse de livraison *</Label>
            <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rue, quartier, ville…" />
            <Button type="button" variant="outline" size="sm" onClick={handleGeolocate} disabled={geoLoading} className="w-full">
              {geoLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPin className="mr-2 h-4 w-4" />}
              {coords ? `Position détectée (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})` : "Utiliser ma position"}
            </Button>
          </div>

          <Button type="submit" disabled={loading} className="w-full" size="lg">
            {loading ? "Création…" : <EditableLabel uiKey="signup.submit" defaultLabel="Créer mon compte" defaultSize="md" />}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Déjà un compte ?{" "}
          <Link to="/login" className="font-semibold text-primary">Se connecter</Link>
        </p>
      </div>
    </div>
  );
}
