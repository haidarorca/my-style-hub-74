import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Home, Mail, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { BackButton } from "@/components/layout/BackButton";

export const Route = createFileRoute("/verify-email")({
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);
  const [email, setEmail] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (!user) {
        navigate({ to: "/login" });
        return;
      }
      setEmail(user.email ?? "");
      setVerified(!!user.email_confirmed_at);
      setLoading(false);
    });
  }, [navigate]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const handleResend = async () => {
    if (!email) return;
    setResendCooldown(60);
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) {
      toast.error(error.message);
      setResendCooldown(0);
    } else {
      toast.success("Email de vérification renvoyé. Vérifiez votre boîte de réception.");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-safe">
      <div className="page-container flex max-w-md flex-col py-4">
        <div className="flex items-center justify-between gap-2">
          <BackButton fallbackTo="/account" />
          <Link
            to="/"
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Home className="h-4 w-4" />
            <span>Accueil</span>
          </Link>
        </div>

        <h1 className="mt-4 text-2xl font-bold">Vérifier mon email</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gérez la confirmation de votre adresse email.
        </p>

        {verified ? (
          <div className="mt-6 rounded-xl border border-green-500/30 bg-green-500/10 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-semibold text-green-800">Email vérifié</p>
                <p className="mt-1 text-xs text-green-700">
                  Votre adresse <span className="font-medium">{email}</span> est confirmée. Vous pouvez utiliser toutes les fonctionnalités du compte.
                </p>
              </div>
            </div>
            <Button asChild className="mt-4 w-full">
              <Link to="/account">Retour à mon compte</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Email non vérifié</p>
                <p className="mt-1 text-xs text-amber-700">
                  Votre adresse <span className="font-medium">{email}</span> n'est pas encore confirmée. Vérifiez votre boîte de réception (et vos spams) ou cliquez ci-dessous pour renvoyer le lien.
                </p>
              </div>
            </div>
            <Button
              onClick={handleResend}
              disabled={resendCooldown > 0}
              className="mt-4 w-full"
              size="lg"
            >
              {resendCooldown > 0 ? (
                `Réessayer dans ${resendCooldown}s`
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Renvoyer l'email de vérification
                </>
              )}
            </Button>
            <Button asChild variant="outline" className="mt-2 w-full">
              <Link to="/account">Retour à mon compte</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
