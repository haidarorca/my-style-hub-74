import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ProtectionMode = "none" | "gps" | "code" | "gps_code";

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export const SESSION_ERRORS = new Set([
  "session_required",
  "session_ended",
  "session_expired",
  "location_required",
  "out_of_zone",
]);

export const SESSION_MESSAGES: Record<string, string> = {
  out_of_zone: "Vous devez être dans la boutique pour consulter ses prix.",
  gps_imprecise:
    "Votre position est trop imprécise. Activez la localisation (GPS) de votre téléphone, placez-vous près d'une entrée ou d'une fenêtre, puis réessayez.",
  location_required: "Autorisez la localisation pour consulter les prix de cette boutique.",
  location_denied:
    "La localisation est refusée. Autorisez-la dans les réglages de votre navigateur, puis réessayez.",
  bad_code: "Code incorrect ou expiré. Demandez le code actuel au personnel du magasin.",
  code_required: "Entrez le code fourni par le personnel du magasin.",
  too_many_attempts: "Trop d'essais. Patientez quelques minutes puis réessayez.",
  session_expired: "Session terminée. Réactivez-la pour consulter les prix.",
  session_ended: "Session terminée. Réactivez-la pour consulter les prix.",
  session_required: "Activez votre session pour consulter les prix.",
  zone_not_configured: "La boutique n'a pas encore défini sa zone. Adressez-vous au personnel.",
};

export type Fix = { lat: number; lng: number; acc: number };

/** État réel de la permission (si le navigateur l'expose). */
async function permissionState(): Promise<PermissionState | "unknown"> {
  try {
    const p = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    return p?.state ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** Lit la position la plus précise possible sur quelques secondes. */
export function readPosition(timeoutMs = 12000): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return reject(new Error("location_required"));
    let best: Fix | null = null;
    const done = () => {
      navigator.geolocation.clearWatch(id);
      clearTimeout(t);
      if (best) resolve(best);
      else reject(new Error("location_required"));
    };
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const f = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
        if (!best || f.acc < best.acc) best = f;
        if (f.acc <= 25) done();
      },
      (e) => {
        navigator.geolocation.clearWatch(id);
        clearTimeout(t);
        if (best) return resolve(best);
        if (e.code === 2) return reject(new Error("gps_unavailable"));
        if (e.code === 3) return reject(new Error("gps_timeout"));
        // PERMISSION_DENIED : distinguer un refus ponctuel d'un blocage définitif.
        void permissionState().then((st) =>
          reject(new Error(st === "denied" ? "location_denied" : "location_dismissed")),
        );
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs },
    );
    const t = setTimeout(done, timeoutMs);
  });
}

const tokenKey = (slug: string) => `kawscan.session.${slug}`;
const attemptKey = () => {
  try {
    let k = sessionStorage.getItem("kawscan.attempt");
    if (!k) {
      k = crypto.randomUUID();
      sessionStorage.setItem("kawscan.attempt", k);
    }
    return k;
  } catch {
    return "anon";
  }
};

export function useKawscanSession(slug: string) {
  const [mode, setMode] = useState<ProtectionMode | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [ended, setEnded] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token;

  useEffect(() => {
    void rpc("kawscan_store_protection", { _slug: slug }).then(({ data }) => {
      const d = data as { mode?: string; is_manager?: boolean } | null;
      // Propriétaire/employé connecté : accès direct, aucune session client créée.
      const m = (d?.is_manager ? "none" : (d?.mode ?? "none")) as ProtectionMode;
      setMode(m);
      // Chaque ouverture exige une nouvelle vérification : aucune ancienne session réutilisée.
      try {
        sessionStorage.removeItem(tokenKey(slug));
        localStorage.removeItem(tokenKey(slug));
      } catch {
        /* ignore */
      }
    });
  }, [slug]);

  const end = useCallback(
    (reason: string) => {
      setToken(null);
      setExpiresAt(null);
      setEnded(reason);
      try {
        sessionStorage.removeItem(tokenKey(slug));
      } catch {
        /* ignore */
      }
    },
    [slug],
  );

  const start = useCallback(
    async (opts: { fix?: Fix; code?: string }) => {
      const { data, error } = await rpc("kawscan_session_start", {
        _slug: slug,
        _lat: opts.fix?.lat ?? null,
        _lng: opts.fix?.lng ?? null,
        _acc: opts.fix?.acc ?? null,
        _code: opts.code ?? null,
        _attempt_key: attemptKey(),
      });
      if (error) return "failed";
      const d = data as { error?: string; token?: string; expires_at?: string };
      if (d.error) return d.error;
      if (d.token && d.expires_at) {
        const e = new Date(d.expires_at).getTime();
        setToken(d.token);
        setExpiresAt(e);
        setEnded(null);
        try {
          sessionStorage.setItem(tokenKey(slug), JSON.stringify({ t: d.token, e }));
        } catch {
          /* ignore */
        }
      }
      return null;
    },
    [slug],
  );

  // Expiration locale + suivi de position pendant une session GPS.
  useEffect(() => {
    if (!token || !expiresAt) return;
    const timer = setTimeout(() => end("session_expired"), Math.max(0, expiresAt - Date.now()));
    let stop = false;
    let watchId: number | null = null;
    let last: Fix | null = null;
    const needsGps = mode === "gps" || mode === "gps_code";
    if (needsGps && navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (p) => (last = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
        () => undefined,
        { enableHighAccuracy: true, maximumAge: 10000 },
      );
    }
    const ping = async () => {
      if (stop) return;
      const { data } = await rpc("kawscan_session_ping", {
        _slug: slug,
        _session: tokenRef.current,
        _lat: last?.lat ?? null,
        _lng: last?.lng ?? null,
        _acc: last?.acc ?? null,
      });
      const d = data as { error?: string } | null;
      if (d?.error && SESSION_ERRORS.has(d.error)) end(d.error);
    };
    const iv = setInterval(() => void ping(), needsGps ? 30000 : 60000);
    return () => {
      stop = true;
      clearTimeout(timer);
      clearInterval(iv);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [token, expiresAt, mode, slug, end]);

  return { mode, token, expiresAt, ended, start, end, ready: mode === "none" || (!!mode && !!token) };
}
