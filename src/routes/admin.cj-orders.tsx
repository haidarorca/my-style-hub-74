// ═══════════════════════════════════════════════════════════════
// Administration — Commandes CJdropshipping
//
// Trois blocs :
//   1. Adresse de réception CJ (notre entrepôt en Chine) ;
//   2. Liste des commandes KawZone contenant des articles CJ ;
//   3. Détail : méthodes logistiques CJ, création de la commande CJ,
//      synchronisation du statut et du suivi, journal des échanges.
//
// Aucun paiement CJ n'est déclenché depuis cet écran.
// ═══════════════════════════════════════════════════════════════
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Truck, Warehouse, RefreshCw, Send } from "lucide-react";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getCjWarehouseAddress,
  saveCjWarehouseAddress,
  listCjOrders,
  getCjOrderOverview,
  getCjOrderLog,
  quoteCjLogistics,
  createCjOrder,
  syncCjOrder,
  checkCjOrderStock,
  countCjStockIssues,
  type CjWarehouseAddress,
  type CjLogisticOption,
} from "@/lib/cj-orders.functions";

export const Route = createFileRoute("/admin/cj-orders")({
  component: () => (
    <PermissionGate perm="orders">
      <CjOrdersPage />
    </PermissionGate>
  ),
  head: () => ({
    meta: [
      { title: "Commandes CJdropshipping — KawZone Admin" },
      {
        name: "description",
        content:
          "Création et suivi des commandes CJdropshipping vers l'entrepôt KawZone en Chine.",
      },
      { property: "og:title", content: "Commandes CJdropshipping — KawZone Admin" },
      {
        property: "og:description",
        content: "Création et suivi des commandes fournisseur CJ depuis l'administration KawZone.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const fmt = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "—";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-xs font-medium break-all">{value ?? "—"}</span>
    </div>
  );
}

/* ── Bloc 1 : adresse de réception CJ ── */
function WarehouseCard() {
  const qc = useQueryClient();
  const getFn = useServerFn(getCjWarehouseAddress);
  const saveFn = useServerFn(saveCjWarehouseAddress);
  const [draft, setDraft] = useState<Partial<CjWarehouseAddress> | null>(null);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ["cj-warehouse"],
    queryFn: () => getFn(),
  });

  const value = draft ?? data ?? {};
  const set = (k: keyof CjWarehouseAddress, v: string) =>
    setDraft({ ...(draft ?? data ?? {}), [k]: v });

  const onSave = async () => {
    setSaving(true);
    try {
      await saveFn({ data: { ...(draft ?? {}), is_active: true } });
      setDraft(null);
      await qc.invalidateQueries({ queryKey: ["cj-warehouse"] });
      toast.success("Adresse de réception enregistrée");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const fields: Array<[keyof CjWarehouseAddress, string, string]> = [
    ["label", "Nom de l'entrepôt", "Entrepôt KawZone Guangzhou"],
    ["contact_name", "Destinataire", "Nom du réceptionnaire"],
    ["phone", "Téléphone", "+86 ..."],
    ["province", "Province", "Guangdong"],
    ["city", "Ville", "Guangzhou"],
    ["county", "District (optionnel)", "Baiyun"],
    ["address", "Adresse", "Rue, bâtiment, numéro"],
    ["address2", "Complément (optionnel)", "Étage, bureau"],
    ["zip", "Code postal", "510000"],
    ["email", "E-mail (optionnel)", "entrepot@..."],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Warehouse className="h-4 w-4" /> Adresse de réception CJ (entrepôt Chine)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          C'est cette adresse qui est envoyée à CJ comme destination. L'adresse du
          client sénégalais reste sur la commande KawZone et n'est jamais transmise à CJ.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map(([key, label, ph]) => (
            <div key={key} className="space-y-1">
              <Label className="text-xs">{label}</Label>
              <Input
                value={(value as any)[key] ?? ""}
                placeholder={ph}
                onChange={(e) => set(key, e.target.value)}
              />
            </div>
          ))}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Notes internes</Label>
          <Textarea
            rows={2}
            value={(value as any).notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>
        <Button onClick={onSave} disabled={saving || !draft}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Enregistrer l'adresse
        </Button>
      </CardContent>
    </Card>
  );
}

/* ── Bloc 3 : détail d'une commande ── */
function OrderDetail({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const overviewFn = useServerFn(getCjOrderOverview);
  const logFn = useServerFn(getCjOrderLog);
  const quoteFn = useServerFn(quoteCjLogistics);
  const createFn = useServerFn(createCjOrder);
  const syncFn = useServerFn(syncCjOrder);
  const stockFn = useServerFn(checkCjOrderStock);

  const [options, setOptions] = useState<CjLogisticOption[] | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [sandbox, setSandbox] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<unknown>(null);

  const { data: o } = useQuery({
    queryKey: ["cj-order", orderId],
    queryFn: () => overviewFn({ data: { order_id: orderId } }),
  });
  const { data: logs } = useQuery({
    queryKey: ["cj-order-log", orderId],
    queryFn: () => logFn({ data: { order_id: orderId } }),
  });

  const refresh = async () => {
    // Rafraîchissement non bloquant : l'écran reste utilisable pendant la mise à jour.
    void qc.invalidateQueries({ queryKey: ["cj-order", orderId] });
    void qc.invalidateQueries({ queryKey: ["cj-order-log", orderId] });
    void qc.invalidateQueries({ queryKey: ["cj-orders"] });
  };

  const onQuote = async () => {
    setBusy("quote");
    try {
      const r = await quoteFn({ data: { order_id: orderId } });
      setLastResponse(r);
      setOptions(r.options);
      if (r.options.length === 0) {
        toast.warning("CJ ne propose aucune méthode pour cette destination", {
          description: r.message ?? "Réponse vide",
        });
      } else {
        setSelected(r.options[0]!.logisticName);
        toast.success(`${r.options.length} méthode(s) proposée(s) par CJ`);
      }
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec");
    } finally {
      setBusy(null);
    }
  };

  const onCreate = async () => {
    setBusy("create");
    try {
      const r = await createFn({
        data: { order_id: orderId, logistic_name: selected, sandbox },
      });
      setLastResponse(r);
      if (r.ok) toast.success(r.message && r.message.includes("rattachée") ? r.message : "Commande transmise à CJ");
      else if (r.stock_issues?.length) toast.error("Problème de stock — action requise", { description: "Rien n'a été envoyé à CJ." });
      else toast.error("CJ a refusé la commande", { description: r.message ?? "" });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec");
    } finally {
      setBusy(null);
    }
  };

  const onStock = async () => {
    setBusy("stock");
    try {
      const r = await stockFn({ data: { order_id: orderId } });
      setLastResponse(r);
      if (r.issues.length === 0) toast.success("Stock CJ disponible pour tous les articles");
      else toast.warning(`${r.issues.length} article(s) posent problème`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec");
    } finally {
      setBusy(null);
    }
  };

  const onSync = async () => {
    setBusy("sync");
    try {
      const r = await syncFn({ data: { order_id: orderId } });
      setLastResponse(r);
      if (r.ok) toast.success("Statut CJ actualisé");
      else toast.error(r.message ?? "Échec");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec");
    } finally {
      setBusy(null);
    }
  };

  if (!o) return <div className="p-4 text-sm text-muted-foreground">Chargement…</div>;

  return (
    <div className="space-y-4">
      {o.cj_stock_issues && o.cj_stock_issues.length > 0 && !o.cj_order_id && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm">
          <p className="font-semibold text-destructive">
            Attention — commande {o.reference ?? o.order_id.slice(0, 8)} : problème de stock, action requise
          </p>
          <ul className="mt-1 space-y-0.5">
            {o.cj_stock_issues.map((i) => (
              <li key={i.item_id}>
                {i.product_name}{i.variant ? ` — ${i.variant}` : ""} :{" "}
                {i.reason === "rupture" ? "rupture chez CJ" : i.reason === "insuffisant" ? `${i.stock} disponible(s) pour ${i.requested} commandé(s)` : "CJ injoignable, stock non confirmé"}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">Rien n'a été envoyé ni payé chez CJ. Décidez : contacter le client, remplacer, retirer, attendre ou annuler.</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Button size="sm" variant="outline" onClick={onStock} disabled={busy !== null}>
          {busy === "stock" ? "Vérification…" : "Vérifier le stock CJ"}
        </Button>
        <span className="text-muted-foreground">
          Stock : {o.cj_stock_status === "ok" ? "disponible" : o.cj_stock_status === "issue" ? "problème" : o.cj_stock_status === "unknown" ? "non confirmé" : "jamais vérifié"}
          {o.cj_stock_checked_at ? ` (${fmt(o.cj_stock_checked_at)})` : ""}
        </span>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Commande {o.reference ?? o.order_id.slice(0, 8)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Row label="Client" value={o.customer_name} />
          <Row label="Paiement client (statut KawZone)" value={o.status} />
          <Row
            label="CJ"
            value={
              o.cj_order_id ? (
                <Badge variant="default">Créée</Badge>
              ) : (
                <Badge variant="secondary">Non créée</Badge>
              )
            }
          />
          <Row label="CJ Order ID" value={o.cj_order_id} />
          <Row label="CJ Order Code" value={o.cj_order_code} />
          <Row label="CJ Order Number" value={o.cj_order_number} />
          <Row label="CJ Status" value={o.cj_order_status} />
          <Row label="CJ Paiement" value={o.cj_payment_status ?? "—"} />
          <Row label="Méthode CJ" value={o.cj_logistic_name} />
          <Row label="Suivi CJ" value={o.cj_tracking_number} />
          <Row label="Transporteur CJ" value={o.cj_tracking_provider} />
          <Row
            label="Lien de suivi CJ"
            value={
              o.cj_tracking_url ? (
                <a className="underline" href={o.cj_tracking_url} target="_blank" rel="noreferrer">
                  ouvrir
                </a>
              ) : null
            }
          />
          <Row label="Créée chez CJ le" value={fmt(o.cj_created_at)} />
          <Row label="Payée chez CJ le" value={fmt(o.cj_paid_at)} />
          <Row label="Expédiée par CJ le" value={fmt(o.cj_shipped_at)} />
          <Row label="Dernière synchronisation" value={fmt(o.cj_synced_at)} />
          <Row label="Dernière erreur CJ" value={o.cj_last_error} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Articles CJ de la commande</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {o.items.map((i) => (
            <div key={i.id} className="rounded border p-2 text-xs">
              <div className="font-medium">
                {i.product_name} {i.variant_label_snapshot ? `— ${i.variant_label_snapshot}` : ""} × {i.quantity}
              </div>
              <div className="text-muted-foreground">
                CJ Product ID : {i.cj_product_id ?? "—"} · CJ Variant ID : {i.cj_variant_id ?? "—"} ·
                SKU CJ : {i.cj_variant_sku ?? "—"}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="h-4 w-4" /> Envoi vers CJ
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" onClick={onQuote} disabled={busy !== null}>
            {busy === "quote" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            1. Demander les méthodes logistiques à CJ
          </Button>

          {options && options.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs">Méthode renvoyée par CJ</Label>
              <select
                className="w-full rounded border bg-background p-2 text-sm"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {options.map((opt) => (
                  <option key={opt.logisticName} value={opt.logisticName}>
                    {opt.logisticName} — {opt.logisticPrice ?? "?"} USD · {opt.logisticAging ?? "?"}
                  </option>
                ))}
              </select>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={sandbox}
              onChange={(e) => setSandbox(e.target.checked)}
            />
            Commande de TEST (bac à sable CJ, aucune expédition réelle)
          </label>

          <Button
            onClick={onCreate}
            disabled={busy !== null || !selected || !!o.cj_order_id}
          >
            {busy === "create" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Send className="mr-2 h-4 w-4" />
            2. Créer la commande chez CJ
          </Button>

          <Button variant="outline" onClick={onSync} disabled={busy !== null || !o.cj_order_id}>
            {busy === "sync" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <RefreshCw className="mr-2 h-4 w-4" />
            3. Actualiser le statut et le suivi CJ
          </Button>

          <p className="text-xs text-muted-foreground">
            Aucun paiement CJ n'est déclenché depuis cet écran.
          </p>

          {lastResponse != null && (
            <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-[10px]">
              {JSON.stringify(lastResponse, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Journal des échanges CJ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(logs ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground">Aucun échange enregistré.</p>
          )}
          {(logs ?? []).map((l: any) => (
            <div key={l.id} className="rounded border p-2 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="font-medium">{l.action}</span>
                <Badge variant={l.success ? "default" : "destructive"}>
                  {l.success ? "OK" : "Échec"}
                </Badge>
              </div>
              <div className="text-muted-foreground">
                {l.endpoint} · HTTP {l.http_status ?? "—"} · code CJ {l.cj_code ?? "—"} ·{" "}
                {l.latency_ms ?? "—"} ms · {fmt(l.created_at)}
              </div>
              {l.cj_message && <div className="text-muted-foreground">{l.cj_message}</div>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function CjOrdersPage() {
  const listFn = useServerFn(listCjOrders);
  const [selected, setSelected] = useState<string | null>(null);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["cj-orders"],
    queryFn: () => listFn(),
  });

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold">Commandes CJdropshipping</h1>
        <p className="text-sm text-muted-foreground">
          Création manuelle des commandes fournisseur CJ, après confirmation du
          paiement client.
        </p>
      </div>

      <WarehouseCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Commandes contenant des articles CJ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}
          {!isLoading && (orders ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Aucune commande CJ pour le moment.</p>
          )}
          {(orders ?? []).map((o) => (
            <button
              key={o.order_id}
              onClick={() => setSelected(o.order_id)}
              className={`w-full rounded border p-3 text-left text-sm hover:bg-muted ${
                selected === o.order_id ? "border-primary" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{o.reference ?? o.order_id.slice(0, 8)}</span>
                {o.cj_order_id ? (
                  <Badge>CJ : {o.cj_order_status ?? "créée"}</Badge>
                ) : (
                  <Badge variant="secondary">CJ : non créée</Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {o.customer_name ?? "—"} · {o.cj_eligible_lines}/{o.total_lines} article(s) CJ ·{" "}
                {fmt(o.created_at)}
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      {selected && <OrderDetail orderId={selected} />}
    </div>
  );
}
