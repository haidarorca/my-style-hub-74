import { WorkflowRow } from "./WorkflowRow";
import type { WorkflowRow as TWorkflowRow } from "@/types/workflow";

interface Props {
  rows: TWorkflowRow[];
  onViewDetail: (row: TWorkflowRow) => void;
}

export function WorkflowTable({ rows, onViewDetail }: Props) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">Aucune commande ne correspond à ce filtre.</p>
        <p className="text-xs mt-1">Essayez un autre filtre ou vérifiez plus tard.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div
        className="grid items-center gap-2 px-3 py-1.5 text-[10px] uppercase font-semibold text-muted-foreground border-b"
        style={{ gridTemplateColumns: "28px 60px 80px 1fr 90px 90px 90px 80px 28px" }}
      >
        <div></div>
        <div>Type</div>
        <div>ID</div>
        <div>Client</div>
        <div className="text-right">Produits</div>
        <div className="text-right">Frais</div>
        <div className="text-right">Paiement</div>
        <div className="text-right">Attente</div>
        <div></div>
      </div>

      {/* Rows */}
      {rows.map((row) => (
        <WorkflowRow key={row.order_id} row={row} onViewDetail={onViewDetail} />
      ))}
    </div>
  );
}
