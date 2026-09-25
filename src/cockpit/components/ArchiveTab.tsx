import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Archive, RotateCcw, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import {
  listArchivedOrders, restoreOrders, setOrderRetention, archiveOrders, listActiveOrdersLite,
  getCockpitSettings, setDefaultRetention,
} from "@/lib/order-archive.functions";
import { RetentionSelect, retentionLabel, type RetentionValue } from "./RetentionSelect";
import { HardDeleteDialog } from "./HardDeleteDialog";

const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtMoney = (n: number | null) => `${Math.round(n ?? 0).toLocaleString("fr-FR")} FCFA`;
const STATUS_FR: Record<string, string> = { new: "Nouvelle", confirmed: "Confirmée", preparing: "En préparation", ready: "Prête", shipped: "Expédiée", delivered: "Livrée", cancelled: "Annulée", validated: "Validée" };

export function ArchiveTab() {
  const qc = useQueryClient();
  const { isSuperAdmin } = useAuth();
  const listFn = useServerFn(listArchivedOrders);
  const restoreFn = useServerFn(restoreOrders);
  const retFn = useServerFn(setOrderRetention);
  const settingsFn = useServerFn(getCockpitSettings);
  const setDefFn = useServerFn(setDefaultRetention);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [del, setDel] = useState<{ id: string; ref: string | null } | null>(null);

  const { data: rows = [], isLoading } = useQuery({ queryKey: ["cockpit-archives", q], queryFn: () => listFn({ data: { q } }) });
  const { data: settings } = useQuery({ queryKey: ["cockpit-settings"], queryFn: () => settingsFn() });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["cockpit-archives"] }); qc.invalidateQueries({ queryKey: ["cockpit-orders"] }); qc.invalidateQueries({ queryKey: ["cockpit-todo"] }); };

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSel = rows.length > 0 && rows.every((r) => sel.has(r.id));

  async function restore(ids: string[]) {
    try { const r = await restoreFn({ data: { ids } }); toast.success(`${r.restored} commande(s) restaurée(s)`); setSel(new Set()); refresh(); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function changeRetention(ids: string[], days: RetentionValue) {
    try { await retFn({ data: { ids, days } }); toast.success("Durée de conservation mise à jour"); refresh(); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-white p-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher dans les archives…" className="pl-8 h-9" />
        </div>
        <Button size="sm" onClick={() => setBulkOpen(true)}><Archive className="mr-1 h-4 w-4" />Archiver des commandes</Button>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Conservation par défaut :</span>
          <RetentionSelect
            value={settings ? (settings.default_retention_days as RetentionValue) : 30}
            onChange={async (v) => { if (v === undefined) return; await setDefFn({ data: { days: v } }); qc.invalidateQueries({ queryKey: ["cockpit-settings"] }); toast.success("Durée par défaut enregistrée"); }}
          />
        </div>
      </div>

      {sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2 text-sm">
          <span className="font-medium">{sel.size} sélectionnée(s)</span>
          <Button size="sm" variant="outline" onClick={() => restore([...sel])}><RotateCcw className="mr-1 h-3.5 w-3.5" />Restaurer</Button>
          <span className="text-xs text-muted-foreground">Conservation :</span>
          <RetentionSelect value={undefined} onChange={(v) => v !== undefined && changeRetention([...sel], v)} allowDefault />
        </div>
      )}

      <div className="rounded-lg border bg-white">
        <div className="flex items-center gap-2 border-b px-3 py-2 text-xs font-medium text-muted-foreground">
          <Checkbox checked={allSel} onCheckedChange={(c) => setSel(c ? new Set(rows.map((r) => r.id)) : new Set())} />
          <span className="flex-1">{rows.length} commande(s) archivée(s)</span>
        </div>
        {isLoading ? <div className="p-6 text-center text-sm text-muted-foreground">Chargement…</div>
          : rows.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">Aucune commande archivée</div>
          : rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 border-b px-3 py-2 text-sm last:border-0">
              <Checkbox checked={sel.has(r.id)} onCheckedChange={() => toggle(r.id)} />
              <div className="min-w-[160px] flex-1">
                <div className="font-mono font-semibold">{r.reference ?? r.id.slice(0, 8)}</div>
                <div className="text-xs text-muted-foreground">{r.customer_name ?? "—"} · {STATUS_FR[r.status] ?? r.status} · {fmtMoney(r.total)}</div>
              </div>
              <div className="text-xs">
                <div>Archivée le <b>{fmtDate(r.archived_at)}</b></div>
                <div className={r.purge_at ? "text-destructive" : "text-muted-foreground"}>
                  {r.purge_at ? <>Suppression prévue le <b>{fmtDate(r.purge_at)}</b></> : "Conservée sans limite"} · {retentionLabel(r.retention_days)}
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => restore([r.id])}><RotateCcw className="mr-1 h-3.5 w-3.5" />Restaurer</Button>
                {isSuperAdmin && (
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Supprimer définitivement" onClick={() => setDel({ id: r.id, ref: r.reference })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
      </div>

      <BulkArchiveDialog open={bulkOpen} onOpenChange={setBulkOpen} onDone={refresh} />
      {del && <HardDeleteDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} orderId={del.id} reference={del.ref} onDeleted={refresh} />}
    </div>
  );
}

function BulkArchiveDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const listFn = useServerFn(listActiveOrdersLite);
  const archiveFn = useServerFn(archiveOrders);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [days, setDays] = useState<RetentionValue | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const { data: rows = [] } = useQuery({ queryKey: ["cockpit-active-lite", q, status], queryFn: () => listFn({ data: { q, status } }), enabled: open });
  const allSel = useMemo(() => rows.length > 0 && rows.every((r) => sel.has(r.id)), [rows, sel]);

  async function go() {
    setBusy(true);
    try {
      const ids = [...sel];
      let total = 0;
      for (let i = 0; i < ids.length; i += 500) {
        const r = await archiveFn({ data: { ids: ids.slice(i, i + 500), ...(days !== undefined ? { days } : {}) } });
        total += r.archived;
      }
      toast.success(`${total} commande(s) archivée(s)`);
      setSel(new Set()); onOpenChange(false); onDone();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Archiver des commandes</DialogTitle></DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Référence, client, téléphone…" className="h-9 flex-1" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">Tous statuts</option>
            {Object.entries(STATUS_FR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 border-b pb-2 text-xs text-muted-foreground">
          <Checkbox checked={allSel} onCheckedChange={(c) => setSel(c ? new Set(rows.map((r) => r.id)) : new Set())} />
          Tout sélectionner ({rows.length}) — {sel.size} sélectionnée(s)
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          {rows.map((r) => (
            <label key={r.id} className="flex cursor-pointer items-center gap-3 border-b py-1.5 text-sm last:border-0">
              <Checkbox checked={sel.has(r.id)} onCheckedChange={() => setSel((s) => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} />
              <span className="font-mono w-36 shrink-0">{r.reference ?? r.id.slice(0, 8)}</span>
              <span className="flex-1 truncate">{r.customer_name ?? "—"}</span>
              <span className="text-xs text-muted-foreground">{STATUS_FR[r.status] ?? r.status}</span>
              <span className="w-24 text-right text-xs text-muted-foreground">{fmtDate(r.created_at)}</span>
            </label>
          ))}
        </div>
        <DialogFooter className="flex-wrap items-center gap-2 sm:justify-between">
          <div className="flex items-center gap-2 text-xs"><span className="text-muted-foreground">Conservation :</span><RetentionSelect value={days} onChange={setDays} allowDefault /></div>
          <Button disabled={busy || sel.size === 0} onClick={go}>{busy ? "Archivage…" : `Archiver ${sel.size} commande(s)`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
