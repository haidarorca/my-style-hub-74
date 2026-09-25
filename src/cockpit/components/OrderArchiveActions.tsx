import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Archive, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { archiveOrders } from "@/lib/order-archive.functions";
import { HardDeleteDialog } from "./HardDeleteDialog";
import { RetentionSelect, type RetentionValue } from "./RetentionSelect";

export function OrderArchiveActions({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const { isSuperAdmin } = useAuth();
  const archiveFn = useServerFn(archiveOrders);
  const [ref, setRef] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<RetentionValue | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [delOpen, setDelOpen] = useState(false);

  useEffect(() => {
    supabase.from("orders").select("reference").eq("id", orderId).maybeSingle()
      .then(({ data }) => setRef((data as { reference: string | null } | null)?.reference ?? null));
  }, [orderId]);

  async function doArchive() {
    setBusy(true);
    try {
      await archiveFn({ data: { ids: [orderId], ...(days !== undefined ? { days } : {}) } });
      toast.success("Commande archivée");
      qc.invalidateQueries({ queryKey: ["cockpit-orders"] });
      qc.invalidateQueries({ queryKey: ["cockpit-archives"] });
      qc.invalidateQueries({ queryKey: ["cockpit-todo"] });
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-2 space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          <Archive className="mr-1 h-3.5 w-3.5" /> Archiver
        </Button>
        {isSuperAdmin && (
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDelOpen(true)}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Supprimer définitivement
          </Button>
        )}
      </div>
      {open && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Conservation :</span>
          <RetentionSelect value={days} onChange={setDays} allowDefault />
          <Button size="sm" onClick={doArchive} disabled={busy}>{busy ? "…" : "Confirmer l'archivage"}</Button>
        </div>
      )}
      <HardDeleteDialog
        open={delOpen}
        onOpenChange={setDelOpen}
        orderId={orderId}
        reference={ref}
        onDeleted={() => {
          qc.invalidateQueries({ queryKey: ["cockpit-orders"] });
          qc.invalidateQueries({ queryKey: ["cockpit-archives"] });
          onDone();
        }}
      />
    </div>
  );
}
