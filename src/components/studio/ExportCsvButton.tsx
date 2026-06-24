// ============================================================
// ExportCsvButton — KawZone Studio
// Phase 2 : Export des résultats en CSV
// ============================================================

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StudioViewConfig } from "@/lib/studio/studio.types";
import { exportCsv } from "@/lib/studio/studio.functions";

interface ExportCsvButtonProps {
  config: StudioViewConfig;
  disabled?: boolean;
}

export function ExportCsvButton({ config, disabled }: ExportCsvButtonProps) {
  const handleExport = async () => {
    try {
      const result = await exportCsv({
        data: {
          templateKey: config.templateKey,
          columns: config.columns,
          filters: config.filters,
          sort: config.sort,
        },
      });

      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export CSV échoué:", e);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={disabled}>
      <Download className="h-3.5 w-3.5 mr-1.5" />
      Export CSV
    </Button>
  );
}
