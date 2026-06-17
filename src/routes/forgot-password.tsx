import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { sendPasswordResetCode, verifyPasswordResetCode } from "@/lib/password-reset.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Home, Mail, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { BackButton } from "@/components/layout/BackButton";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

type Step = "email" | "code";

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastSentAt, setLastSentAt] = useState<number>(0);

  const sendCode = useServerFn(sendPasswordResetCode);
  const verifyCode = useServerFn(verifyPasswordResetCode);

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      toast.error("Email invalide");
      return;
    }
    const now = Date.now();
    if (now - lastSentAt < 60_000) {
      const wait = Math.ceil((60_000 - (now - lastSentAt)) / 1000);
      toast.error(`Veuillez patienter ${wait}s avant de réessayer`);
      return;
    }
    setLoading(true);
    try {
      await sendCode({ data: { email: clean } });
      setLastSentAt(Date.now());
      setEmail(clean);
      setStep("code");
      toast.success("Code envoyé par email");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'envoi");
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(code)) {
      toast.error("Le code doit comporter 4 chiffres");
      return;
    }
    if (!password) {
      toast.error("Saisissez un nouveau mot de passe");
      return;
    }
    if (password !== confirm) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }
    setLoading(true);
    try {
      await verifyCode({ data: { email, code, newPassword: password } });
      toast.success("Mot de passe mis à jour");
      navigate({ to: "/login" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Code incorrect");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    const now = Date.now();
    if (now - lastSentAt < 60_000) {
      const wait = Math.ceil((60_000 - (now - lastSentAt)) / 1000);
      toast.error(`Patientez ${wait}s avant de renvoyer`);
      return;
    }
    setLoading(true);
    try {
      await sendCode({ data: { email } });
      setLastSentAt(Date.now());
      toast.success("Nouveau code envoyé");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pt-safe">
      <div className="page-container flex max-w-md flex-col py-4">
        <div className="flex items-center justify-between gap-2">
          <BackButton fallbackTo="/login" />
          <Link
            to="/"
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Home className="h-4 w-4" />
            <span>Accueil</span>
          </Link>
        </div>

        {step === "email" ? (
          <>
            <h1 className="mt-4 text-2xl font-bold">Mot de passe oublié</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Entrez votre adresse email. Vous recevrez un code à 4 chiffres pour réinitialiser votre mot de passe.
            </p>
            <form onSubmit={submitEmail} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9"
                    placeholder="vous@email.com"
                  />
                </div>
              </div>
              <Button type="submit" disabled={loading} className="w-full" size="lg">
                {loading ? "Envoi…" : "Envoyer le code"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                <Link to="/login" className="font-semibold text-primary">
                  Retour à la connexion
                </Link>
              </p>
            </form>
          </>
        ) : (
          <>
            <h1 className="mt-4 flex items-center gap-2 text-2xl font-bold">
              <ShieldCheck className="h-6 w-6 text-primary" />
              Code de vérification
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Un code à 4 chiffres a été envoyé à <span className="font-medium text-foreground">{email}</span>. Saisissez-le puis choisissez votre nouveau mot de passe.
            </p>
            <form onSubmit={submitCode} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="code">Code à 4 chiffres</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  required
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="text-center text-2xl tracking-[0.6em] font-semibold"
                  placeholder="••••"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw">Nouveau mot de passe</Label>
                <div className="relative">
                  <Input
                    id="pw"
                    type={show ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                    aria-label={show ? "Masquer" : "Afficher"}
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw2">Confirmer</Label>
                <Input
                  id="pw2"
                  type={show ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
                {confirm && confirm !== password && (
                  <p className="text-xs text-destructive">Les mots de passe ne correspondent pas</p>
                )}
              </div>
              <Button type="submit" disabled={loading} className="w-full" size="lg">
                {loading ? "Validation…" : "Valider et changer le mot de passe"}
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setStep("email");
                    setCode("");
                    setPassword("");
                    setConfirm("");
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Changer d'email
                </button>
                <button
                  type="button"
                  onClick={resend}
                  disabled={loading}
                  className="font-semibold text-primary disabled:opacity-50"
                >
                  Renvoyer le code
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
