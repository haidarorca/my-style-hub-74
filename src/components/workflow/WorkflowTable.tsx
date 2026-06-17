import { WorkflowRow } from "./WorkflowRow";
import type { WorkflowRow as TWorkflowRow } from "@/types/workflow";

interface Props {
  rows: TWorkflowRow[];
  onViewDetail: (row: TWorkflowRow) => void;
  rowIndexMap?: Map<string, number>;
}

export function WorkflowTable({ rows, onViewDetail, rowIndexMap }: Props) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">Aucune commande dans ce groupe.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Header — Desktop uniquement */}
      <div
        className="hidden lg:grid items-center gap-2 px-3 py-1.5 text-[10px] uppercase font-semibold text-muted-foreground border-b"
        style={{ gridTemplateColumns: "50px 80px 1fr 90px 90px 90px 80px 28px" }}
      >
        <div>#</div>
        <div>ID</div>
        <div>Client</div>
        <div className="text-right">Produits</div>
        <div className="text-right">Frais</div>
        <div className="text-right">Paiement</div>
        <div className="text-right">Attente</div>
        <div></div>
      </div>

      {/* Rows avec numérotation globale */}
      {rows.map((row) => (
        <WorkflowRow
          key={row.order_id}
          row={row}
          position={rowIndexMap?.get(row.order_id) ?? 0}
          onViewDetail={onViewDetail}
        />
      ))}
    </div>
  );
}
