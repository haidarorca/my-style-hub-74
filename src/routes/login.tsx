import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, Home } from "lucide-react";
import { BackButton } from "@/components/layout/BackButton";
import { EditableLabel } from "@/components/admin/EditableLabel";
import { useI18n } from "@/hooks/use-i18n";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Si déjà connecté (ou dès que la session est restaurée), rediriger vers l'accueil
  useEffect(() => {
    if (user) navigate({ to: "/" });
  }, [user, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("auth.signed_in_toast"));
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
        <h1 className="mt-4 text-2xl font-bold">{t("auth.login_title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("auth.login_subtitle")}</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <div className="relative">
              <Input id="password" type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="pr-10" />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? t("auth.hide_password") : t("auth.show_password")}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" disabled={loading} className="w-full" size="lg">
            {loading ? t("auth.signin_loading") : <EditableLabel uiKey="login.submit" defaultLabel={t("auth.signin")} defaultSize="md" />}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t("auth.no_account")}{" "}
          <Link to="/signup" className="font-semibold text-primary">{t("auth.create_account_cta")}</Link>
        </p>
      </div>
    </div>
  );
}
