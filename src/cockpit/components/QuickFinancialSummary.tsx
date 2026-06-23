// ═══════════════════════════════════════════════════════════════
// QuickFinancialSummary — Bandeau métier compact toujours visible.
// Affiche : articles, total produits, frais, payé, reste à payer.
// 100 % présentation.
// ═══════════════════════════════════════════════════════════════

import { fmtF } from "@/cockpit/lib/workflow";

interface Props {
  articleCount: number;
  productTotal: number;
  freight: number;
  paid: number;
  remaining: number;
}

export function QuickFinancialSummary({
  articleCount,
  productTotal,
  freight,
  paid,
  remaining,
}: Props) {
  const cells: { label: string; value: string; tone?: "default" | "danger" | "success" }[] = [
    { label: "Articles", value: String(articleCount) },
    { label: "Produits", value: fmtF(productTotal) },
    { label: "Frais", value: fmtF(freight) },
    { label: "Payé", value: fmtF(paid), tone: paid > 0 ? "success" : "default" },
    {
      label: "Reste à payer",
      value: fmtF(remaining),
      tone: remaining > 0 ? "danger" : "success",
    },
  ];
  return (
    <div className="rounded-lg border bg-white p-2">
      <div className="grid grid-cols-5 gap-1">
        {cells.map((c) => {
          const valueClass =
            c.tone === "danger"
              ? "text-red-700"
              : c.tone === "success"
                ? "text-emerald-700"
                : "text-gray-900";
          const isRemaining = c.label === "Reste à payer";
          return (
            <div
              key={c.label}
              className={`rounded p-1.5 text-center ${
                isRemaining && remaining > 0
                  ? "bg-red-50 ring-1 ring-red-200"
                  : "bg-gray-50"
              }`}
            >
              <div className="text-[9px] uppercase text-gray-500 tracking-wide truncate">
                {c.label}
              </div>
              <div
                className={`font-bold leading-tight truncate ${valueClass} ${
                  isRemaining ? "text-sm" : "text-[11px]"
                }`}
              >
                {c.value}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
