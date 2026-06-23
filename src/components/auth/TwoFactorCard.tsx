import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, ShieldOff, Smartphone, KeyRound, Loader2, AlertTriangle, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  getTwoFactorStatus,
  setupTotp,
  confirmTotp,
  disableTotp,
  regenerateRecoveryCodes,
} from "@/lib/two-factor.functions";

type Mode = "idle" | "setup" | "confirming" | "disable" | "regen";

export function TwoFactorCard() {
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getTwoFactorStatus);
  const fetchSetup = useServerFn(setupTotp);
  const fetchConfirm = useServerFn(confirmTotp);
  const fetchDisable = useServerFn(disableTotp);
  const fetchRegen = useServerFn(regenerateRecoveryCodes);

  const { data: status, isLoading } = useQuery({
    queryKey: ["2fa-status"],
    queryFn: () => fetchStatus(),
  });

  const [mode, setMode] = useState<Mode>("idle");
  const [setupData, setSetupData] = useState<{ secret: string; qr_data_url: string } | null>(null);
  const [code, setCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  const startSetup = async () => {
    setBusy(true);
    try {
      const r = await fetchSetup();
      setSetupData({ secret: r.secret, qr_data_url: r.qr_data_url });
      setMode("confirming");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetchConfirm({ data: { code } });
      setRecoveryCodes(r.recovery_codes);
      setSetupData(null);
      setCode("");
      setMode("idle");
      qc.invalidateQueries({ queryKey: ["2fa-status"] });
      toast.success("2FA activé. Enregistrez vos codes de récupération !");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Code invalide");
    } finally {
      setBusy(false);
    }
  };

  const disable = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await fetchDisable({ data: { code: disableCode } });
      setDisableCode("");
      setMode("idle");
      qc.invalidateQueries({ queryKey: ["2fa-status"] });
      toast.success("2FA désactivé");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Code invalide");
    } finally {
      setBusy(false);
    }
  };

  const regen = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetchRegen({ data: { code: disableCode } });
      setRecoveryCodes(r.recovery_codes);
      setDisableCode("");
      setMode("idle");
      qc.invalidateQueries({ queryKey: ["2fa-status"] });
      toast.success("Nouveaux codes de récupération générés");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Code invalide");
    } finally {
      setBusy(false);
    }
  };

  const copyCodes = () => {
    if (!recoveryCodes) return;
    navigator.clipboard.writeText(recoveryCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <h2 className="text-sm font-semibold">Double authentification (2FA)</h2>
          <p className="text-xs text-muted-foreground">
            Renforce la sécurité avec un code temporaire généré par Google Authenticator, Authy, 1Password…
          </p>
        </div>
        {status?.enabled && (
          <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-700">
            Activé
          </span>
        )}
      </div>

      {/* Recovery codes display (after activation or regen) */}
      {recoveryCodes && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-900">
            <AlertTriangle className="h-3.5 w-3.5" />
            Codes de récupération — copiez et stockez-les en sécurité (affichés une seule fois)
          </div>
          <div className="grid grid-cols-2 gap-1 font-mono text-xs">
            {recoveryCodes.map((c) => (
              <code key={c} className="rounded bg-white px-2 py-1">{c}</code>
            ))}
          </div>
          <Button size="sm" variant="outline" className="mt-2 w-full" onClick={copyCodes}>
            {copied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
            {copied ? "Copié" : "Copier les codes"}
          </Button>
          <Button size="sm" variant="ghost" className="mt-1 w-full" onClick={() => setRecoveryCodes(null)}>
            J'ai sauvegardé mes codes
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
          <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Chargement…
        </div>
      ) : !status?.enabled ? (
        mode === "confirming" && setupData ? (
          <form onSubmit={confirm} className="space-y-3">
            <p className="text-xs text-muted-foreground">
              1. Ouvrez votre application d'authentification et scannez ce QR code :
            </p>
            <img src={setupData.qr_data_url} alt="QR code 2FA" className="mx-auto rounded-lg border" />
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Saisir le code manuellement</summary>
              <code className="mt-1 block break-all rounded bg-muted p-2 font-mono text-[11px]">
                {setupData.secret}
              </code>
            </details>
            <div className="space-y-1.5">
              <Label htmlFor="totp_confirm">2. Saisissez le code à 6 chiffres affiché</Label>
              <Input
                id="totp_confirm"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="text-center text-xl tracking-[0.4em] font-semibold"
                placeholder="••••••"
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => { setMode("idle"); setSetupData(null); setCode(""); }}>
                Annuler
              </Button>
              <Button type="submit" disabled={busy || code.length !== 6} className="flex-1">
                {busy ? "Vérification…" : "Activer"}
              </Button>
            </div>
          </form>
        ) : (
          <Button onClick={startSetup} disabled={busy} className="w-full" variant="outline">
            <Smartphone className="mr-2 h-4 w-4" />
            {busy ? "Préparation…" : "Activer la 2FA"}
          </Button>
        )
      ) : (
        <div className="space-y-2 text-xs">
          {status.confirmed_at && (
            <p className="text-muted-foreground">
              Activée le {new Date(status.confirmed_at).toLocaleDateString("fr-FR")}
            </p>
          )}
          {mode === "disable" ? (
            <form onSubmit={disable} className="space-y-2">
              <Label htmlFor="totp_disable" className="text-xs">Code 2FA (ou code de récupération)</Label>
              <Input
                id="totp_disable"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
                placeholder="123456 ou XXXXX-XXXXX"
                required
              />
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" className="flex-1" onClick={() => { setMode("idle"); setDisableCode(""); }}>Annuler</Button>
                <Button type="submit" variant="destructive" size="sm" disabled={busy} className="flex-1">
                  Désactiver
                </Button>
              </div>
            </form>
          ) : mode === "regen" ? (
            <form onSubmit={regen} className="space-y-2">
              <Label htmlFor="totp_regen" className="text-xs">Code 2FA actuel</Label>
              <Input
                id="totp_regen"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
              />
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" className="flex-1" onClick={() => { setMode("idle"); setDisableCode(""); }}>Annuler</Button>
                <Button type="submit" size="sm" disabled={busy} className="flex-1">Régénérer codes</Button>
              </div>
            </form>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setMode("regen")}>
                <KeyRound className="mr-1 h-3 w-3" /> Nouveaux codes
              </Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setMode("disable")}>
                <ShieldOff className="mr-1 h-3 w-3" /> Désactiver
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
