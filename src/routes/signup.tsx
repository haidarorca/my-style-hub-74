import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { MapPin, Loader2, Eye, EyeOff, Home, ArrowLeft } from "lucide-react";
import { BackButton } from "@/components/layout/BackButton";
import { useI18n } from "@/hooks/use-i18n";
import { EditableLabel } from "@/components/admin/EditableLabel";
import {
  sendSignupVerificationCode,
  verifySignupAndCreateAccount,
} from "@/lib/signup-verification.functions";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
  head: () => ({
    meta: [
      { title: "Créer un compte — Kawzone" },
      { name: "description", content: "Créez votre compte Kawzone gratuitement et profitez de la marketplace au Sénégal." },
      { name: "robots", content: "noindex, follow" },
    ],
  }),
});

function SignupPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const sendCode = useServerFn(sendSignupVerificationCode);
  const verifyCode = useServerFn(verifySignupAndCreateAccount);

  const [step, setStep] = useState<"form" | "verify">("form");
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

  const [code, setCode] = useState("");
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [resendLoading, setResendLoading] = useState(false);

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
    if (password.length < 6) {
      toast.error("Le mot de passe doit faire au moins 6 caractères.");
      return;
    }
    setLoading(true);
    try {
      await sendCode({ data: { email: email.trim().toLowerCase() } });
      setLastSentAt(Date.now());
      setStep("verify");
      toast.success("Code envoyé. Vérifiez votre email (et dossier spam).");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Envoi du code échoué.");
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    if (lastSentAt && Date.now() - lastSentAt < 60_000) {
      const remaining = Math.ceil((60_000 - (Date.now() - lastSentAt)) / 1000);
      toast.error(`Veuillez patienter ${remaining}s avant un nouvel envoi.`);
      return;
    }
    setResendLoading(true);
    try {
      await sendCode({ data: { email: email.trim().toLowerCase() } });
      setLastSentAt(Date.now());
      toast.success("Nouveau code envoyé.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Envoi du code échoué.");
    } finally {
      setResendLoading(false);
    }
  };

  const onVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(code)) {
      toast.error("Saisissez le code à 4 chiffres reçu par email.");
      return;
    }
    if (!sex) return;
    setLoading(true);
    try {
      await verifyCode({
        data: {
          email: email.trim().toLowerCase(),
          code,
          password,
          fullName,
          phone: phone || null,
          sex,
          address: address || null,
          latitude: coords?.lat ?? null,
          longitude: coords?.lng ?? null,
        },
      });
      // Sign in directly
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signErr) {
        toast.success("Compte créé ! Connectez-vous.");
        navigate({ to: "/login" });
      } else {
        toast.success("Compte créé !");
        navigate({ to: "/" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Vérification échouée.");
    } finally {
      setLoading(false);
    }
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

        {step === "form" ? (
          <>
            <h1 className="mt-4 text-2xl font-bold">Créer un compte</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Rejoins-nous pour shopper et personnaliser tes produits. Vous pouvez aussi commander sans compte.
            </p>

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
                {loading ? "Envoi du code…" : <EditableLabel uiKey="signup.submit" defaultLabel="Recevoir mon code" defaultSize="md" />}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Déjà un compte ?{" "}
              <Link to="/login" className="font-semibold text-primary">Se connecter</Link>
            </p>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setStep("form")}
              className="mt-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Modifier mes infos
            </button>
            <h1 className="mt-2 text-2xl font-bold">Confirmez votre email</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Un code à 4 chiffres a été envoyé à <strong>{email}</strong>. Saisissez-le pour finaliser votre compte.
            </p>

            <form onSubmit={onVerify} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="code">Code de confirmation</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="text-center font-mono text-2xl tracking-[0.6em]"
                  placeholder="••••"
                  autoComplete="one-time-code"
                />
              </div>

              <Button type="submit" disabled={loading} className="w-full" size="lg">
                {loading ? "Création du compte…" : "Créer mon compte"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                disabled={resendLoading}
                onClick={onResend}
                className="w-full"
              >
                {resendLoading ? "Envoi…" : "Renvoyer le code"}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
