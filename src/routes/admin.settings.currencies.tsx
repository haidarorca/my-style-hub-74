import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Coins, History, Save } from "lucide-react";
import { toast } from "sonner";
import type { Currency, CurrencyRate } from "@/lib/currencies";

export const Route = createFileRoute("/admin/settings/currencies")({
  component: () => (
    <PermissionGate superOnly>
      <CurrenciesPage />
    </PermissionGate>
  ),
});

type Row = Currency & { rate: number | null; margin: number | null };

function CurrenciesPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [history, setHistory] = useState<CurrencyRate[]>([]);
  const [editing, setEditing] = useState<Record<string, { rate: string; margin: string; note: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data: cs } = await (supabase as any)
        .from("currencies").select("*").order("display_order", { ascending: true });
      const { data: rs } = await (supabase as any)
        .from("currency_rates")
        .select("*")
        .order("effective_from", { ascending: false });
      const latest: Record<string, { rate: number; margin: number }> = {};
      for (const r of (rs as any[]) || []) {
        if (!latest[r.currency_code]) latest[r.currency_code] = { rate: Number(r.rate_to_base), margin: Number(r.safety_margin_pct) };
      }
      const built: Row[] = ((cs as Currency[]) || []).map((c) => ({
        ...c,
        rate: latest[c.code]?.rate ?? null,
        margin: latest[c.code]?.margin ?? null,
      }));
      setRows(built);
      setHistory((rs as CurrencyRate[]) || []);
      const ed: typeof editing = {};
      for (const b of built) {
        ed[b.code] = {
          rate: b.rate?.toString() ?? "",
          margin: b.margin?.toString() ?? "0",
          note: "",
        };
      }
      setEditing(ed);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function saveRate(code: string) {
    const e = editing[code];
    const rate = Number(e?.rate);
    const margin = Number(e?.margin || 0);
    if (!rate || rate <= 0) { toast.error("Taux invalide"); return; }
    setSaving(code);
    try {
      const { error } = await (supabase as any).rpc("set_currency_rate", {
        _code: code, _rate: rate, _margin: margin, _note: e?.note || null,
      });
      if (error) throw error;
      toast.success(`Taux ${code} mis à jour`);
      await load();
    } catch (err: any) {
      toast.error(err.message || "Erreur");
    } finally { setSaving(null); }
  }

  async function toggleActive(code: string, isActive: boolean) {
    const { error } = await (supabase as any).from("currencies").update({ is_active: isActive }).eq("code", code);
    if (error) { toast.error(error.message); return; }
    toast.success("Mis à jour");
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Coins className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold">Devises & taux de change</h1>
          <p className="text-xs text-muted-foreground">
            FCFA est la devise comptable de référence. Tous les taux sont saisis manuellement.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map((c) => {
            const e = editing[c.code] || { rate: "", margin: "0", note: "" };
            const hist = history.filter((h) => h.currency_code === c.code).slice(0, 10);
            return (
              <Card key={c.code}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span className="text-xl">{c.symbol}</span>
                    <span>{c.name}</span>
                    <Badge variant="outline" className="text-[10px]">{c.code}</Badge>
                    {c.is_base && <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Base</Badge>}
                    {!c.is_active && <Badge variant="secondary" className="text-[10px]">Désactivée</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {c.is_base ? (
                    <p className="text-xs text-muted-foreground">
                      Devise de base — non modifiable. Taux : 1, marge : 0%.
                    </p>
                  ) : (
                    <>
                      <div className="grid gap-3 sm:grid-cols-4">
                        <div>
                          <Label className="text-xs">Taux → FCFA</Label>
                          <Input
                            type="number" step="0.0001" min="0"
                            value={e.rate}
                            onChange={(ev) => setEditing((p) => ({ ...p, [c.code]: { ...e, rate: ev.target.value } }))}
                          />
                          <p className="mt-1 text-[10px] text-muted-foreground">1 {c.code} = X FCFA</p>
                        </div>
                        <div>
                          <Label className="text-xs">Marge sécurité (%)</Label>
                          <Input
                            type="number" step="0.1" min="0" max="100"
                            value={e.margin}
                            onChange={(ev) => setEditing((p) => ({ ...p, [c.code]: { ...e, margin: ev.target.value } }))}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Label className="text-xs">Note (optionnel)</Label>
                          <Input
                            placeholder="Ex: ajustement taux marché"
                            value={e.note}
                            onChange={(ev) => setEditing((p) => ({ ...p, [c.code]: { ...e, note: ev.target.value } }))}
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" onClick={() => saveRate(c.code)} disabled={saving === c.code}>
                          {saving === c.code ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
                          Enregistrer nouveau taux
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => toggleActive(c.code, !c.is_active)}>
                          {c.is_active ? "Désactiver" : "Activer"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setOpenHistory((p) => (p === c.code ? null : c.code))}>
                          <History className="mr-1 h-3.5 w-3.5" />
                          Historique ({hist.length})
                        </Button>
                        {c.rate != null && (
                          <span className="ml-auto text-xs text-muted-foreground">
                            Actuel : <b>{c.rate}</b> · marge <b>{c.margin}%</b> · ex. 100 {c.code} ={" "}
                            <b>{Math.round(100 * (c.rate ?? 0) * (1 + (c.margin ?? 0) / 100))}</b> FCFA
                          </span>
                        )}
                      </div>
                      {openHistory === c.code && (
                        <div className="rounded-md border bg-muted/30 p-2">
                          <table className="w-full text-xs">
                            <thead className="text-muted-foreground">
                              <tr><th className="px-1 text-left">Date</th><th className="text-right">Taux</th><th className="text-right">Marge</th><th className="text-left">Note</th></tr>
                            </thead>
                            <tbody>
                              {hist.map((h) => (
                                <tr key={h.id} className="border-t">
                                  <td className="px-1 py-1">{new Date(h.effective_from).toLocaleString("fr-FR")}</td>
                                  <td className="text-right">{Number(h.rate_to_base)}</td>
                                  <td className="text-right">{Number(h.safety_margin_pct)}%</td>
                                  <td>{h.note ?? "—"}</td>
                                </tr>
                              ))}
                              {hist.length === 0 && (<tr><td colSpan={4} className="py-2 text-center text-muted-foreground">Aucun historique</td></tr>)}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Comment ça marche</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-xs text-muted-foreground">
          <p>• Chaque vendeur saisit ses prix dans sa devise principale (RMB, USD, EUR, TRY ou FCFA).</p>
          <p>• Le système convertit automatiquement vers FCFA avec le taux courant + la marge de sécurité configurée ici.</p>
          <p>• Les statistiques restent stockées en FCFA. Le sélecteur de devise en haut de page convertit l'affichage uniquement (sans marge).</p>
          <p>• Chaque modification de taux est historisée. Les prix produits déjà calculés ne sont pas recalculés rétroactivement.</p>
        </CardContent>
      </Card>
    </div>
  );
}
