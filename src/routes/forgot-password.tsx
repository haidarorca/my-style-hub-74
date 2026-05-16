import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Home, Mail, CheckCircle2 } from "lucide-react";
import { BackButton } from "@/components/layout/BackButton";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [lastSentAt, setLastSentAt] = useState<number>(0);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      toast.error("Email invalide");
      return;
    }
    // Anti-spam: 60s cooldown between requests
    const now = Date.now();
    if (now - lastSentAt < 60_000) {
      const wait = Math.ceil((60_000 - (now - lastSentAt)) / 1000);
      toast.error(`Veuillez patienter ${wait}s avant de réessayer`);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(clean, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setLastSentAt(Date.now());
    setSent(true);
    toast.success("Email de réinitialisation envoyé");
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

        <h1 className="mt-4 text-2xl font-bold">Mot de passe oublié</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Entrez votre adresse email. Vous recevrez un lien sécurisé pour réinitialiser votre mot de passe.
        </p>

        {sent ? (
          <div className="mt-6 rounded-xl border border-border bg-card p-4 text-sm">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <p className="font-semibold">Email envoyé</p>
                <p className="mt-1 text-muted-foreground">
                  Si un compte existe pour <span className="font-medium text-foreground">{email}</span>, vous recevrez un email avec un lien sécurisé. Vérifiez aussi vos spams.
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Le lien expire après une courte période pour votre sécurité.
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button asChild variant="outline" className="flex-1">
                <Link to="/login">Retour à la connexion</Link>
              </Button>
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => {
                  setSent(false);
                  setEmail("");
                }}
              >
                Renvoyer
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
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
              {loading ? "Envoi…" : "Envoyer le lien de réinitialisation"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link to="/login" className="font-semibold text-primary">
                Retour à la connexion
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
