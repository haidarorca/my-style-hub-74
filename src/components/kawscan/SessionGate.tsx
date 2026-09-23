import { useState } from "react";
import { KeyRound, Loader2, MapPin, ShieldCheck } from "lucide-react";
import { readPosition, SESSION_MESSAGES, type Fix, type ProtectionMode } from "@/lib/kawscan/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Écran d'activation de session (magasin protégé). Contrôles réels faits côté serveur. */
export function SessionGate({
  storeName,
  mode,
  reason,
  start,
}: {
  storeName: string;
  mode: ProtectionMode;
  reason: string | null;
  start: (o: { fix?: Fix; code?: string }) => Promise<string | null>;
}) {
  const needsGps = mode === "gps" || mode === "gps_code";
  const needsCode = mode === "code" || mode === "gps_code";
  const [fix, setFix] = useState<Fix | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(reason ? (SESSION_MESSAGES[reason] ?? null) : null);

  const step: "gps" | "code" = needsGps && !fix ? "gps" : "code";

  async function locate() {
    setBusy(true);
    setMsg(null);
    try {
      const f = await readPosition();
      if (f.acc > 50) {
        setMsg(SESSION_MESSAGES.gps_imprecise!);
        return;
      }
      if (!needsCode) {
        const err = await start({ fix: f });
        if (err) setMsg(SESSION_MESSAGES[err] ?? "Impossible d'activer la session. Réessayez.");
      } else {
        setFix(f);
      }
    } catch (e) {
      setMsg(SESSION_MESSAGES[(e as Error).message] ?? SESSION_MESSAGES.location_required!);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    setBusy(true);
    setMsg(null);
    try {
      let f = fix ?? undefined;
      if (needsGps) {
        // Position rafraîchie au moment de valider le code.
        try {
          const nf = await readPosition(6000);
          if (nf.acc <= 50) f = nf;
        } catch {
          /* garder la position précédente */
        }
      }
      const err = await start({ fix: f, code });
      if (err) {
        setMsg(SESSION_MESSAGES[err] ?? "Impossible d'activer la session. Réessayez.");
        if (err === "out_of_zone" || err === "gps_imprecise") setFix(null);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-6 text-center">
      <ShieldCheck className="h-10 w-10 text-primary" />
      <div>
        <h1 className="text-xl font-semibold">{storeName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Activez votre session pour voir les prix.</p>
      </div>

      {step === "gps" ? (
        <div className="w-full max-w-xs space-y-3">
          <p className="text-sm">Nous vérifions que vous êtes bien dans la boutique.</p>
          <Button className="h-12 w-full" onClick={() => void locate()} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPin className="mr-2 h-4 w-4" />}
            Vérifier ma position
          </Button>
        </div>
      ) : (
        <form
          className="w-full max-w-xs space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submitCode();
          }}
        >
          <p className="text-sm">Entrez le code fourni par le personnel du magasin pour activer votre session.</p>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="Code"
            className="h-14 text-center text-2xl tracking-widest"
            aria-label="Code du magasin"
          />
          <Button type="submit" className="h-12 w-full" disabled={busy || code.length < 1}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
            Activer
          </Button>
        </form>
      )}

      {msg && <p role="alert" className="max-w-xs text-sm font-medium text-destructive">{msg}</p>}
    </div>
  );
}
