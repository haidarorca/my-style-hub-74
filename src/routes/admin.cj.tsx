// ═══════════════════════════════════════════════════════════════
// Administration — Connexion CJdropshipping
//
// Écran de diagnostic uniquement : état de la connexion, test réel,
// lecture d'un produit de test. Aucune importation à cette étape.
// Le jeton n'est jamais affiché ni transmis au navigateur.
// ═══════════════════════════════════════════════════════════════
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plug, Loader2, CheckCircle2, XCircle, PackageSearch } from "lucide-react";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getCjConnectionState,
  testCjConnection,
  readCjTestProduct,
} from "@/lib/cj.functions";
import { importCjProduct } from "@/lib/cj-import.functions";

export const Route = createFileRoute("/admin/cj")({
  component: () => (
    <PermissionGate perm="orders">
      <CjConnectionPage />
    </PermissionGate>
  ),
  head: () => ({
    meta: [
      { title: "Connexion CJdropshipping — KawZone Admin" },
      { name: "description", content: "Diagnostic de la connexion à l'API CJdropshipping." },
    ],
  }),
});

const fmtDate = (v: string | null) =>
  v ? new Date(v).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "—";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-xs font-medium">{value}</span>
    </div>
  );
}

function CjConnectionPage() {
  const qc = useQueryClient();
  const stateFn = useServerFn(getCjConnectionState);
  const testFn = useServerFn(testCjConnection);
  const productFn = useServerFn(readCjTestProduct);
  const importFn = useServerFn(importCjProduct);

  const [testing, setTesting] = useState(false);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pid, setPid] = useState("");
  const [result, setResult] = useState<any>(null);

  const { data: state, isLoading } = useQuery({
    queryKey: ["cj-connection-state"],
    queryFn: () => stateFn(),
  });

  async function runTest() {
    setTesting(true);
    setResult(null);
    try {
      const r = await testFn();
      setResult({ kind: "connexion", ...r });
      r.ok ? toast.success("Connexion CJ réussie") : toast.error(r.error ?? "Échec");
      qc.invalidateQueries({ queryKey: ["cj-connection-state"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setTesting(false);
    }
  }

  async function runProduct() {
    setReading(true);
    setResult(null);
    try {
      const r = await productFn({ data: { pid: pid.trim() || null } });
      setResult({ kind: "produit", ...r });
      r.ok ? toast.success("Produit CJ récupéré") : toast.error(r.error ?? "Échec");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setReading(false);
    }
  }

  async function runImport(update: boolean) {
    const id = pid.trim();
    if (!id) {
      toast.error("Indiquez l'identifiant du produit CJ à importer.");
      return;
    }
    setImporting(true);
    setResult(null);
    try {
      const r = await importFn({ data: { pid: id, update } });
      setResult({ kind: update ? "mise à jour" : "import", ...r });
      r.ok ? toast.success("Produit importé en brouillon") : toast.error(r.error ?? "Échec");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Plug className="h-5 w-5" />
        <h1 className="text-lg font-bold">Connexion CJdropshipping</h1>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">État de la connexion</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Row
                label="Statut"
                value={
                  state?.is_connected ? (
                    <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Connecté</Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <XCircle className="h-3 w-3" /> Non connecté
                    </Badge>
                  )
                }
              />
              <Row
                label="Identifiants enregistrés"
                value={state?.credentials_configured ? "Oui" : "Non"}
              />
              <Row label="Dernière vérification" value={fmtDate(state?.last_checked_at ?? null)} />
              <Row label="Expiration du jeton" value={fmtDate(state?.access_token_expiry ?? null)} />
              <Row
                label="Expiration du jeton de renouvellement"
                value={fmtDate(state?.refresh_token_expiry ?? null)}
              />
              <Row label="Dernier service appelé" value={state?.last_endpoint ?? "—"} />
              <Row
                label="Temps de réponse"
                value={state?.last_latency_ms != null ? `${state.last_latency_ms} ms` : "—"}
              />
              <Row label="Appels du dernier test" value={state?.api_calls_count ?? 0} />
              <Row
                label="Dernière erreur"
                value={
                  state?.last_error ? (
                    <span className="text-destructive">{state.last_error}</span>
                  ) : (
                    "Aucune"
                  )
                }
              />
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={runTest} disabled={testing}>
          {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plug className="mr-2 h-4 w-4" />}
          Tester la connexion
        </Button>
        <div className="flex gap-2">
          <Input
            className="w-56"
            placeholder="Identifiant produit CJ (facultatif)"
            value={pid}
            onChange={(e) => setPid(e.target.value)}
          />
          <Button variant="outline" onClick={runProduct} disabled={reading}>
            {reading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PackageSearch className="mr-2 h-4 w-4" />
            )}
            Lire un produit de test
          </Button>
          <Button variant="outline" onClick={() => runImport(false)} disabled={importing}>
            {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Importer en brouillon
          </Button>
          <Button variant="ghost" onClick={() => runImport(true)} disabled={importing}>
            Mettre à jour
          </Button>
        </div>
      </div>

      {result && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Résultat brut ({result.kind}) — {result.ok ? "succès" : "échec"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[420px] overflow-auto rounded-lg bg-muted p-3 text-[11px] leading-relaxed">
              {JSON.stringify(result, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
