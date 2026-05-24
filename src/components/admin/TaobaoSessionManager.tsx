/**
 * TaobaoSessionManager.tsx
 * ------------------------
 * Gestion de la session Taobao via Bright Data Browser CDP.
 * - Connecte a Bright Data
 * - Affiche QR code pour login
 * - Sauvegarde/restaure les cookies
 * - Affiche l'etat de la session
 */

import { useState, useCallback } from "react";
import {
  QrCode, Loader2, ShieldCheck, ShieldX, Trash2,
  LogIn, Cookie, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  connectBrightData,
  getTaobaoQRCode,
  checkLoginStatus,
  isSessionValid,
  loadSessionCookies,
  clearSession,
  disconnect,
  type CDPSession,
} from "@/lib/taobao-cdp";
import { toast } from "sonner";

interface Props {
  onSessionReady?: (session: CDPSession) => void;
}

export function TaobaoSessionManager({ onSessionReady }: Props) {
  const [session, setSession] = useState<CDPSession | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checking, setChecking] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const s = await connectBrightData();
      setSession(s);
      toast.success("Connecte a Bright Data Browser");

      // Check if already logged in
      setChecking(true);
      const hasSession = isSessionValid();
      if (hasSession) {
        const cookies = loadSessionCookies();
        if (cookies.length > 0) {
          toast.info(`Session precedente trouvee (${cookies.length} cookies)`);
        }
      }

      // Get QR code for login
      const { qrUrl: qr, error } = await getTaobaoQRCode(s);
      if (qr) {
        setQrUrl(qr);
        toast.info("Scannez le QR code avec l'app Taobao");
      } else {
        toast.error(error || "QR code non disponible");
      }
      setChecking(false);
      onSessionReady?.(s);
    } catch (e: any) {
      toast.error(e.message || "Erreur connexion");
    }
    setConnecting(false);
  };

  const handleCheckLogin = async () => {
    if (!session) return;
    setChecking(true);
    try {
      const loggedIn = await checkLoginStatus(session);
      setIsLoggedIn(loggedIn);
      if (loggedIn) {
        toast.success("Connecte a Taobao !");
        setQrUrl(null);
      } else {
        toast.info("Non connecte - scannez le QR code");
      }
    } catch (e: any) {
      toast.error(e.message);
    }
    setChecking(false);
  };

  const handleDisconnect = () => {
    if (session) disconnect(session);
    setSession(null);
    setQrUrl(null);
    setIsLoggedIn(false);
    toast.success("Deconnecte");
  };

  const handleClearSession = () => {
    clearSession();
    setIsLoggedIn(false);
    toast.success("Session supprimee");
  };

  return (
    <Card className={isLoggedIn ? "border-emerald-300 bg-emerald-50/30" : session ? "border-blue-300" : ""}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isLoggedIn ? (
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
            ) : session ? (
              <QrCode className="h-5 w-5 text-blue-600" />
            ) : (
              <ShieldX className="h-5 w-5 text-muted-foreground" />
            )}
            <span className="text-sm font-semibold">
              {isLoggedIn ? "Connecte a Taobao" : session ? "Session active" : "Session Taobao"}
            </span>
          </div>
          <Badge variant={isLoggedIn ? "default" : session ? "secondary" : "outline"} className="text-[10px]">
            {isLoggedIn ? "Connecte" : session ? "En attente QR" : "Non connecte"}
          </Badge>
        </div>

        {!session ? (
          <Button onClick={handleConnect} disabled={connecting} className="w-full gap-2">
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            {connecting ? "Connexion..." : "Connecter session Taobao"}
          </Button>
        ) : (
          <>
            {qrUrl && !isLoggedIn && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground text-center">
                  Scannez ce QR code avec l&apos;app Taobao mobile
                </p>
                <div className="flex justify-center">
                  <img src={qrUrl} alt="QR Code Taobao" className="w-40 h-40 border rounded-lg" />
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {!isLoggedIn && (
                <Button onClick={handleCheckLogin} disabled={checking} variant="outline" size="sm" className="flex-1 gap-1">
                  {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  Verifier connexion
                </Button>
              )}
              <Button onClick={handleDisconnect} variant="outline" size="sm" className="gap-1">
                Deconnecter
              </Button>
              <Button onClick={handleClearSession} variant="ghost" size="sm" className="text-destructive gap-1">
                <Trash2 className="h-3.5 w-3.5" /> Effacer
              </Button>
            </div>

            {isSessionValid() && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Cookie className="h-3 w-3" />
                <span>{loadSessionCookies().length} cookies sauvegardes</span>
                <Clock className="h-3 w-3 ml-2" />
                <span>Valide 24h</span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
