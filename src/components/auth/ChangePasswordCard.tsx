import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { checkPasswordStrength, PasswordStrengthMeter } from "./PasswordStrength";

export function ChangePasswordCard() {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState(0);

  const strength = checkPasswordStrength(next);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) {
      toast.error("Session invalide");
      return;
    }
    if (Date.now() < lockUntil) {
      const s = Math.ceil((lockUntil - Date.now()) / 1000);
      toast.error(`Trop de tentatives. Réessayez dans ${s}s`);
      return;
    }
    if (!strength.ok) {
      toast.error("Le nouveau mot de passe est trop faible");
      return;
    }
    if (next !== confirm) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }
    if (next === current) {
      toast.error("Le nouveau mot de passe doit être différent");
      return;
    }
    setLoading(true);

    // 1) Verify current password by attempting sign-in (no session disruption)
    const { error: signErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: current,
    });
    if (signErr) {
      setLoading(false);
      const tries = attempts + 1;
      setAttempts(tries);
      if (tries >= 5) {
        setLockUntil(Date.now() + 60_000);
        setAttempts(0);
        toast.error("Trop de tentatives. Verrouillé 60s.");
      } else {
        toast.error("Mot de passe actuel incorrect");
      }
      return;
    }

    // 2) Update password
    const { error: updErr } = await supabase.auth.updateUser({ password: next });
    setLoading(false);
    if (updErr) {
      toast.error(updErr.message);
      return;
    }
    setAttempts(0);
    setCurrent("");
    setNext("");
    setConfirm("");
    toast.success("Mot de passe mis à jour");
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <KeyRound className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Changer le mot de passe</h2>
          <p className="text-xs text-muted-foreground">
            Saisissez votre mot de passe actuel et un nouveau mot de passe fort.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="cur_pw">Mot de passe actuel</Label>
          <div className="relative">
            <Input
              id="cur_pw"
              type={show ? "text" : "password"}
              required
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
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
          <Label htmlFor="new_pw">Nouveau mot de passe</Label>
          <Input
            id="new_pw"
            type={show ? "text" : "password"}
            required
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <PasswordStrengthMeter password={next} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cf_pw">Confirmer le nouveau mot de passe</Label>
          <Input
            id="cf_pw"
            type={show ? "text" : "password"}
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {confirm && confirm !== next && (
            <p className="text-xs text-destructive">Les mots de passe ne correspondent pas</p>
          )}
        </div>

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Mise à jour…" : "Mettre à jour le mot de passe"}
        </Button>
      </form>
    </div>
  );
}
