import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Coins, History, Save, Plus, Pencil, RefreshCw } from "lucide-react";
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
type HistoryRow = CurrencyRate & { author?: string | null };

const fmtFcfa = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} FCFA`;

function CurrenciesPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [editing, setEditing] = useState<Record<string, { rate: string; margin: string; note: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editMeta, setEditMeta] = useState<Row | null>(null);
  const [recompute, setRecompute] = useState<{ code: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data: cs } = await (supabase as any)
        .from("currencies").select("*").order("display_order", { ascending: true });
      const { data: rs } = await (supabase as any)
        .from("currency_rates").select("*").order("effective_from", { ascending: false });
      const rates = (rs as any[]) || [];
      const authorIds = Array.from(new Set(rates.map((r) => r.created_by).filter(Boolean)));
      const authors: Record<string, string> = {};
      if (authorIds.length) {
        const { data: profs } = await (supabase as any)
          .from("profiles").select("id, full_name, email").in("id", authorIds);
        for (const p of (profs as any[]) || []) {
          authors[p.id] = p.full_name || p.email || p.id.slice(0, 8);
        }
      }
      const enriched: HistoryRow[] = rates.map((r) => ({
        ...r, author: r.created_by ? (authors[r.created_by] || "—") : "—",
      }));
      const latest: Record<string, { rate: number; margin: number }> = {};
      for (const r of rates) {
        if (!latest[r.currency_code]) latest[r.currency_code] = { rate: Number(r.rate_to_base), margin: Number(r.safety_margin_pct) };
      }
      const built: Row[] = ((cs as Currency[]) || []).map((c) => ({
        ...c, rate: latest[c.code]?.rate ?? null, margin: latest[c.code]?.margin ?? null,
      }));
      setRows(built);
      setHistory(enriched);
      const ed: typeof editing = {};
      for (const b of built) {
        ed[b.code] = { rate: b.rate?.toString() ?? "", margin: b.margin?.toString() ?? "0", note: "" };
      }
      setEditing(ed);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function saveRate(code: string) {
    const e = editing[code];
    const rate = Number(e?.rate); const margin = Number(e?.margin || 0);
    if (!rate || rate <= 0) { toast.error("Taux invalide"); return; }
    setSaving(code);
    try {
      const { error } = await (supabase as any).rpc("set_currency_rate", {
        _code: code, _rate: rate, _margin: margin, _note: e?.note || null,
      });
      if (error) throw error;
      toast.success(`Taux ${code} mis à jour`);
      await load();
    } catch (err: any) { toast.error(err.message || "Erreur"); }
    finally { setSaving(null); }
  }

  async function toggleActive(code: string, isActive: boolean) {
    const { error } = await (supabase as any).rpc("update_currency", { _code: code, _is_active: isActive });
    if (error) { toast.error(error.message); return; }
    toast.success("Mis à jour"); load();
  }

  const filteredHistory = useMemo(
    () => historyFilter === "all" ? history : history.filter((h) => h.currency_code === historyFilter),
    [history, historyFilter],
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Coins className="h-6 w-6 shrink-0 text-primary" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold">Devises &amp; taux de change</h1>
            <p className="text-xs text-muted-foreground">FCFA reste la devise comptable. Saisie manuelle uniquement.</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Nouvelle devise
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map((c) => {
            const e = editing[c.code] || { rate: "", margin: "0", note: "" };
            return (
              <Card key={c.code}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    <span className="text-xl">{c.symbol}</span>
                    <span className="truncate">{c.name}</span>
                    <Badge variant="outline" className="text-[10px]">{c.code}</Badge>
                    {c.is_base && <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Base</Badge>}
                    {!c.is_active && <Badge variant="secondary" className="text-[10px]">Désactivée</Badge>}
                    <Button size="icon" variant="ghost" className="ml-auto h-7 w-7" onClick={() => setEditMeta(c)} title="Modifier">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {c.is_base ? (
                    <p className="text-xs text-muted-foreground">Devise de base — non modifiable. Taux : 1, marge : 0%.</p>
                  ) : (
                    <>
                      <div className="grid gap-3 sm:grid-cols-4">
                        <div>
                          <Label className="text-xs">Taux → FCFA</Label>
                          <Input type="number" step="0.0001" min="0" value={e.rate}
                            onChange={(ev) => setEditing((p) => ({ ...p, [c.code]: { ...e, rate: ev.target.value } }))} />
                          <p className="mt-1 text-[10px] text-muted-foreground">1 {c.code} = X FCFA</p>
                        </div>
                        <div>
                          <Label className="text-xs">Marge sécurité (%)</Label>
                          <Input type="number" step="0.1" min="0" max="100" value={e.margin}
                            onChange={(ev) => setEditing((p) => ({ ...p, [c.code]: { ...e, margin: ev.target.value } }))} />
                        </div>
                        <div className="sm:col-span-2">
                          <Label className="text-xs">Note (optionnel)</Label>
                          <Input placeholder="Ex: ajustement taux marché" value={e.note}
                            onChange={(ev) => setEditing((p) => ({ ...p, [c.code]: { ...e, note: ev.target.value } }))} />
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
                        <Button size="sm" variant="outline" onClick={() => setRecompute({ code: c.code })}>
                          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Recalculer les produits
                        </Button>
                        {c.rate != null && (
                          <span className="ml-auto text-xs text-muted-foreground">
                            Ex. 100 {c.code} = <b>{Math.round(100 * (c.rate ?? 0) * (1 + (c.margin ?? 0) / 100)).toLocaleString("fr-FR")}</b> FCFA
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Historique global */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            <History className="h-4 w-4" /> Historique des taux
            <div className="ml-auto">
              <Select value={historyFilter} onValueChange={setHistoryFilter}>
                <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les devises</SelectItem>
                  {rows.filter((r) => !r.is_base).map((r) => (
                    <SelectItem key={r.code} value={r.code}>{r.code} — {r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Mobile : cartes */}
          <div className="space-y-2 sm:hidden max-h-[480px] overflow-y-auto">
            {filteredHistory.map((h) => (
              <div key={h.id} className="rounded-md border bg-muted/30 p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{h.currency_code}</span>
                  <span className="text-muted-foreground">{new Date(h.effective_from).toLocaleString("fr-FR")}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="font-mono text-[10px]">Taux {Number(h.rate_to_base)}</Badge>
                  <Badge variant="outline" className="font-mono text-[10px]">Marge {Number(h.safety_margin_pct)}%</Badge>
                  <span className="text-muted-foreground">par {h.author ?? "—"}</span>
                </div>
                {h.note && <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{h.note}</p>}
              </div>
            ))}
            {filteredHistory.length === 0 && <p className="py-3 text-center text-xs text-muted-foreground">Aucun historique</p>}
          </div>
          {/* Desktop : tableau */}
          <div className="hidden sm:block overflow-x-auto max-h-[480px] overflow-y-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur text-muted-foreground">
                <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:font-medium [&>th]:text-left">
                  <th style={{ width: 160 }}>Date</th>
                  <th style={{ width: 80 }}>Devise</th>
                  <th style={{ width: 140 }}>Utilisateur</th>
                  <th style={{ width: 100 }} className="text-right">Taux</th>
                  <th style={{ width: 80 }} className="text-right">Marge</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((h) => (
                  <tr key={h.id} className="border-t [&>td]:px-2 [&>td]:py-1.5 align-top">
                    <td className="whitespace-nowrap">{new Date(h.effective_from).toLocaleString("fr-FR")}</td>
                    <td><Badge variant="outline" className="text-[10px]">{h.currency_code}</Badge></td>
                    <td className="whitespace-nowrap">{h.author ?? "—"}</td>
                    <td className="text-right font-mono">{Number(h.rate_to_base)}</td>
                    <td className="text-right font-mono">{Number(h.safety_margin_pct)}%</td>
                    <td className="whitespace-pre-wrap break-words text-muted-foreground">{h.note ?? "—"}</td>
                  </tr>
                ))}
                {filteredHistory.length === 0 && (
                  <tr><td colSpan={6} className="py-3 text-center text-muted-foreground">Aucun historique</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Comment ça marche</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-xs text-muted-foreground">
          <p>• Chaque vendeur saisit ses prix dans sa devise principale.</p>
          <p>• Conversion automatique vers FCFA avec le taux courant + marge de sécurité, snapshot figé sur le produit.</p>
          <p>• Modifier un taux ne recalcule rien : utiliser <b>Recalculer les produits</b> pour appliquer.</p>
          <p>• Les commandes existantes ne sont jamais modifiées (snapshots figés au moment de l'achat).</p>
          <p>• Côté client, le sélecteur de devise dans le header convertit uniquement l'affichage (sans marge).</p>
        </CardContent>
      </Card>

      <CreateCurrencyDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} />
      <EditCurrencyDialog row={editMeta} onClose={() => setEditMeta(null)} onSaved={load} />
      <RecomputeDialog code={recompute?.code ?? null} onClose={() => setRecompute(null)} onApplied={load} />
    </div>
  );
}

/* ─────── Create currency ─────── */
function CreateCurrencyDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ code: "", name: "", symbol: "", decimals: "0", display_order: "100", rate: "", margin: "0", is_active: true });
  const [saving, setSaving] = useState(false);

  function reset() { setForm({ code: "", name: "", symbol: "", decimals: "0", display_order: "100", rate: "", margin: "0", is_active: true }); }

  async function submit() {
    const code = form.code.trim().toUpperCase();
    if (code.length !== 3) { toast.error("Code ISO en 3 lettres"); return; }
    if (!form.name.trim()) { toast.error("Nom requis"); return; }
    if (!form.symbol.trim()) { toast.error("Symbole requis"); return; }
    const rate = Number(form.rate);
    if (code !== "XOF" && (!rate || rate <= 0)) { toast.error("Taux requis"); return; }
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("create_currency", {
        _code: code, _name: form.name.trim(), _symbol: form.symbol.trim(),
        _decimals: Number(form.decimals) || 0, _display_order: Number(form.display_order) || 100,
        _rate: code === "XOF" ? null : rate, _margin: Number(form.margin) || 0, _is_active: form.is_active,
      });
      if (error) throw error;
      toast.success(`Devise ${code} créée`);
      reset(); onClose(); onCreated();
    } catch (err: any) { toast.error(err.message || "Erreur"); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nouvelle devise</DialogTitle>
          <DialogDescription>Crée une devise utilisable par les vendeurs sans intervention développeur.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Code ISO</Label>
              <Input maxLength={3} placeholder="USD" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <Label className="text-xs">Symbole</Label>
              <Input placeholder="$" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Nom</Label>
            <Input placeholder="Dollar américain" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Décimales</Label>
              <Select value={form.decimals} onValueChange={(v) => setForm({ ...form, decimals: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Ordre d'affichage</Label>
              <Input type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Taux → FCFA</Label>
              <Input type="number" step="0.0001" min="0" placeholder="585" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Marge sécurité (%)</Label>
              <Input type="number" step="0.1" min="0" max="100" value={form.margin} onChange={(e) => setForm({ ...form, margin: e.target.value })} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label className="text-xs">Active</Label>
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────── Edit currency meta ─────── */
function EditCurrencyDialog({ row, onClose, onSaved }: { row: Row | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", symbol: "", decimals: "0", display_order: "100", is_active: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (row) setForm({
      name: row.name ?? "", symbol: row.symbol ?? "",
      decimals: String(row.decimals ?? 0), display_order: String(row.display_order ?? 100),
      is_active: row.is_active,
    });
  }, [row]);

  async function submit() {
    if (!row) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("update_currency", {
        _code: row.code, _name: form.name, _symbol: form.symbol,
        _decimals: Number(form.decimals) || 0, _display_order: Number(form.display_order) || 100,
        _is_active: form.is_active,
      });
      if (error) throw error;
      toast.success("Devise mise à jour"); onClose(); onSaved();
    } catch (err: any) { toast.error(err.message || "Erreur"); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Modifier {row?.code}</DialogTitle>
          <DialogDescription>Le code ISO n'est pas modifiable. Pour changer le taux, utilisez la carte devise.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Nom</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Symbole</Label>
              <Input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Décimales</Label>
              <Select value={form.decimals} onValueChange={(v) => setForm({ ...form, decimals: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Ordre</Label>
              <Input type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label className="text-xs">Active</Label>
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} disabled={row?.is_base} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────── Recompute products ─────── */
type PreviewRow = { product_id: string; name: string; code: string; origin_price: number; old_price: number; new_price: number };

function RecomputeDialog({ code, onClose, onApplied }: { code: string | null; onClose: () => void; onApplied: () => void }) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<PreviewRow[]>([]);

  useEffect(() => {
    if (!code) { setPreview([]); return; }
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await (supabase as any).rpc("preview_currency_recompute", { _code: code });
        if (error) throw error;
        setPreview((data || []) as PreviewRow[]);
      } catch (err: any) { toast.error(err.message || "Erreur"); }
      finally { setLoading(false); }
    })();
  }, [code]);

  const totals = useMemo(() => {
    let oldT = 0, newT = 0;
    for (const r of preview) { oldT += Number(r.old_price) || 0; newT += Number(r.new_price) || 0; }
    return { oldT, newT, diff: newT - oldT, pct: oldT > 0 ? ((newT - oldT) / oldT) * 100 : 0 };
  }, [preview]);

  async function apply() {
    if (!code) return;
    setApplying(true);
    try {
      const { data, error } = await (supabase as any).rpc("apply_currency_recompute", { _code: code });
      if (error) throw error;
      toast.success(`${data ?? 0} produits recalculés`);
      onClose(); onApplied();
    } catch (err: any) { toast.error(err.message || "Erreur"); }
    finally { setApplying(false); }
  }

  return (
    <Dialog open={!!code} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Recalculer les produits en {code}</DialogTitle>
          <DialogDescription>
            Aucune commande existante ne sera modifiée. Seuls les produits encore au catalogue sont recalculés au nouveau taux + marge.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Calcul…
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/40 p-3 text-xs sm:grid-cols-4">
              <div><p className="text-muted-foreground">Produits</p><p className="font-bold">{preview.length}</p></div>
              <div><p className="text-muted-foreground">Ancien total</p><p className="font-bold">{fmtFcfa(totals.oldT)}</p></div>
              <div><p className="text-muted-foreground">Nouveau total</p><p className="font-bold">{fmtFcfa(totals.newT)}</p></div>
              <div>
                <p className="text-muted-foreground">Différence</p>
                <p className={`font-bold ${totals.diff >= 0 ? "text-emerald-700" : "text-destructive"}`}>
                  {totals.diff >= 0 ? "+" : ""}{fmtFcfa(totals.diff)} ({totals.pct.toFixed(2)}%)
                </p>
              </div>
            </div>
            {preview.length > 0 && (
              <div className="max-h-[320px] overflow-y-auto overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/80 text-muted-foreground">
                    <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:font-medium [&>th]:text-left">
                      <th>Code</th><th>Produit</th>
                      <th className="text-right">Ancien</th><th className="text-right">Nouveau</th><th className="text-right">Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r) => {
                      const d = Number(r.new_price) - Number(r.old_price);
                      return (
                        <tr key={r.product_id} className="border-t [&>td]:px-2 [&>td]:py-1.5">
                          <td className="font-mono text-[10px]">{r.code}</td>
                          <td className="truncate max-w-[260px]">{r.name}</td>
                          <td className="text-right font-mono">{fmtFcfa(Number(r.old_price))}</td>
                          <td className="text-right font-mono">{fmtFcfa(Number(r.new_price))}</td>
                          <td className={`text-right font-mono ${d >= 0 ? "text-emerald-700" : "text-destructive"}`}>
                            {d >= 0 ? "+" : ""}{fmtFcfa(d)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {preview.length === 0 && (
              <p className="py-3 text-center text-xs text-muted-foreground">Aucun produit utilisant {code}.</p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={apply} disabled={applying || loading || preview.length === 0}>
            {applying && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Confirmer le recalcul
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
