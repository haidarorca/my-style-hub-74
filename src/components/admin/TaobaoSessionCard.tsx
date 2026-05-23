import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, QrCode, ShieldCheck, ShieldAlert, LogOut, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getTaobaoSessionStatusFn,
  disconnectTaobaoSessionFn,
  testTaobaoSessionFn,
} from "@/lib/taobao-session.functions";

type Status = Awaited<ReturnType<typeof getTaobaoSessionStatusFn>>;

function fmt(d: string | null): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }); } catch { return d; }
}

export function TaobaoSessionCard() {
  const getStatus = useServerFn(getTaobaoSessionStatusFn);
  const disconnect = useServerFn(disconnectTaobaoSessionFn);
  const testSession = useServerFn(testTaobaoSessionFn);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrPhase, setQrPhase] = useState<string>("");
  const [qrError, setQrError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    try { setStatus(await getStatus()); } catch (e) {
      console.error("[session] status error", e);
    } finally { setLoading(false); }
  }, [getStatus]);

  useEffect(() => { void refresh(); }, [refresh]);

  const closeStream = useCallback(() => {
    try { esRef.current?.close(); } catch { /* ignore */ }
    esRef.current = null;
    try { abortRef.current?.abort(); } catch { /* ignore */ }
    abortRef.current = null;
  }, []);

  useEffect(() => () => closeStream(), [closeStream]);

  // Use fetch + ReadableStream (EventSource cannot send Authorization header)
  const startQr = useCallback(async () => {
    setQrOpen(true);
    setQrImage(null);
    setQrError(null);
    setQrPhase("connexion à Bright Data…");
    closeStream();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Non authentifié");
      const res = await fetch("/api/admin/taobao-qr-stream", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
        signal: ac.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          let event = "message";
          let data = "";
          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (!data) continue;
          let payload: any = null;
          try { payload = JSON.parse(data); } catch { /* ignore */ }
          if (event === "status") setQrPhase(String(payload?.phase ?? ""));
          else if (event === "qr") {
            setQrImage(`data:image/png;base64,${payload?.image ?? ""}`);
            setQrPhase("Scannez avec l'application Taobao mobile");
          } else if (event === "success") {
            toast.success(`Session Taobao connectée${payload?.nickname ? ` (${payload.nickname})` : ""}`);
            setQrOpen(false);
            void refresh();
            closeStream();
            return;
          } else if (event === "expired") {
            setQrError(payload?.message ?? "QR code expiré");
            return;
          } else if (event === "error") {
            setQrError(payload?.message ?? "Erreur");
            return;
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setQrError(e instanceof Error ? e.message : String(e));
    } finally {
      closeStream();
    }
  }, [closeStream, refresh]);

  const handleDisconnect = useCallback(async () => {
    if (!confirm("Supprimer la session Taobao enregistrée ?")) return;
    setBusy(true);
    try { await disconnect({}); toast.success("Session supprimée"); await refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }, [disconnect, refresh]);

  const handleTest = useCallback(async () => {
    setBusy(true);
    try {
      const r = await testSession({});
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      await refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }, [testSession, refresh]);

  const connected = status?.status === "connected";

  return (
    <>
      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <QrCode className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Session Taobao</h3>
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : connected ? (
                <Badge variant="default" className="gap-1"><ShieldCheck className="h-3 w-3" /> Connecté</Badge>
              ) : (
                <Badge variant="destructive" className="gap-1"><ShieldAlert className="h-3 w-3" /> {status?.status ?? "déconnecté"}</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Cookies chiffrés stockés côté serveur. Mot de passe jamais transmis.
            </p>
            {status && (
              <ul className="text-xs text-muted-foreground mt-2 space-y-0.5">
                <li>Compte : <span className="font-mono">{status.nickname ?? "—"}</span></li>
                <li>Connecté le : {fmt(status.connectedAt)}</li>
                <li>Expire le : {fmt(status.expiresAt)}</li>
                <li>Dernier test : {fmt(status.lastCheckAt)}</li>
              </ul>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={startQr} disabled={busy}>
            <QrCode className="h-3.5 w-3.5" /> {connected ? "Reconnecter" : "Connecter via QR"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleTest} disabled={busy || !connected}>
            <RefreshCw className="h-3.5 w-3.5" /> Tester
          </Button>
          {connected && (
            <Button size="sm" variant="ghost" onClick={handleDisconnect} disabled={busy}>
              <LogOut className="h-3.5 w-3.5" /> Déconnecter
            </Button>
          )}
        </div>
      </Card>

      <Dialog open={qrOpen} onOpenChange={(o) => { if (!o) closeStream(); setQrOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connexion Taobao</DialogTitle>
            <DialogDescription>
              Ouvrez l'app Taobao sur votre téléphone → "Scanner" et visez le QR ci-dessous.
              N'utilisez PAS votre compte personnel — créez un compte dédié à l'import.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            {qrImage ? (
              <img src={qrImage} alt="QR Taobao" className="h-64 w-64 rounded-lg border bg-white p-2" />
            ) : (
              <div className="h-64 w-64 flex items-center justify-center rounded-lg border bg-muted">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
            <p className="text-xs text-center text-muted-foreground">{qrPhase}</p>
            {qrError && <p className="text-xs text-center text-destructive">{qrError}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
