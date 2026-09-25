import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Settings2, X } from "lucide-react";
import { getTodoBoard, type TodoTile } from "@/lib/reminders.functions";
import { cn } from "@/lib/utils";

const STYLE: Record<TodoTile["level"], { dot: string; box: string; tag: string }> = {
  critical: { dot: "🔴", box: "border-red-300 bg-red-50 text-red-900 hover:bg-red-100", tag: "Critique" },
  important: { dot: "🟠", box: "border-orange-300 bg-orange-50 text-orange-900 hover:bg-orange-100", tag: "Important" },
  attention: { dot: "🟡", box: "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100", tag: "À surveiller" },
  info: { dot: "🔵", box: "border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100", tag: "Info" },
  neutral: { dot: "⚪", box: "border-slate-200 bg-white text-slate-900 hover:bg-slate-50", tag: "" },
  success: { dot: "🟢", box: "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100", tag: "" },
};

export function TodoBoard({ activeKey, onSelect }: { activeKey: string | null; onSelect: (t: TodoTile | null) => void }) {
  const fn = useServerFn(getTodoBoard);
  const { data: tiles = [] } = useQuery({ queryKey: ["cockpit-todo"], queryFn: () => fn(), refetchInterval: 60_000 });
  const visible = tiles.filter((t) => t.count > 0 || t.key === "new" || t.key === "done");

  return (
    <div className="rounded-xl border bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">À faire</h2>
        <div className="flex items-center gap-2">
          {activeKey && (
            <button onClick={() => onSelect(null)} className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-white">
              <X className="h-3 w-3" /> Retirer le filtre
            </button>
          )}
          <Link to="/admin/settings/notifications" className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800">
            <Settings2 className="h-3.5 w-3.5" /> Règles & sons
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {visible.map((t) => {
          const s = STYLE[t.level];
          const disabled = t.count === 0;
          return (
            <button
              key={t.key}
              disabled={disabled}
              onClick={() => onSelect(activeKey === t.key ? null : t)}
              className={cn(
                "flex flex-col items-start rounded-lg border p-2.5 text-left transition",
                s.box,
                activeKey === t.key && "ring-2 ring-slate-900 ring-offset-1",
                disabled && "opacity-50 cursor-default",
              )}
            >
              <span className="flex items-center gap-1.5 text-2xl font-extrabold leading-none">
                <span className="text-sm">{s.dot}</span>{t.count}
              </span>
              <span className="mt-1 text-xs font-medium leading-tight">{t.label}</span>
              {s.tag && <span className="mt-1 text-[10px] uppercase tracking-wide opacity-70">{s.tag}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
