import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, FolderTree } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface CjNode { id: string; path: string; level: 1 | 2 | 3; leafCount?: number }

const LEVEL = { 1: "Famille", 2: "Sous-famille", 3: "Sous-sous-famille" } as const;

/** Choix d'une famille, sous-famille ou sous-sous-famille CJ, avec recherche. */
export function CategoryTreePicker({ nodes, value, onChange, className, placeholder = "Toutes les catégories" }: {
  nodes: CjNode[]; value: string | null | undefined; onChange: (id: string | null) => void; className?: string; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const current = nodes.find((n) => n.id === value);
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  const list = useMemo(() => {
    const t = norm(q.trim());
    if (t) return nodes.filter((n) => norm(n.path).includes(t)).slice(0, 200);
    // Arbre repliable : familles, puis enfants des nœuds ouverts.
    return nodes.filter((n) => {
      if (n.level === 1) return true;
      const parts = n.path.split(" › ");
      const fam = nodes.find((x) => x.level === 1 && x.path === parts[0]);
      if (!fam || !expanded.has(fam.id)) return false;
      if (n.level === 2) return true;
      const sub = nodes.find((x) => x.level === 2 && x.path === `${parts[0]} › ${parts[1]}`);
      return !!sub && expanded.has(sub.id);
    });
  }, [nodes, q, expanded]);
  const toggleExp = (id: string) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className={cn("h-11 w-full justify-between gap-2 font-normal", className)}>
          <span className="flex min-w-0 items-center gap-2"><FolderTree className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{current ? current.path.split(" › ").pop() : placeholder}</span>
            {current && current.level < 3 && <span className="shrink-0 rounded bg-secondary px-1.5 text-[10px]">{current.leafCount} sous-cat.</span>}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,420px)] p-0" align="start">
        <div className="border-b p-2"><Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher une catégorie (ex. robes, cuisine)" className="h-9" /></div>
        <div className="max-h-80 overflow-y-auto p-1">
          <Row active={!value} onClick={() => { onChange(null); setOpen(false); }}>{placeholder}</Row>
          {list.map((n) => (
            <div key={n.id} className="flex items-center" style={{ paddingLeft: q ? 0 : (n.level - 1) * 14 }}>
              {!q && n.level < 3 ? (
                <button type="button" className="grid h-7 w-6 shrink-0 place-items-center text-xs text-muted-foreground" onClick={() => toggleExp(n.id)} aria-label="Déplier">{expanded.has(n.id) ? "▾" : "▸"}</button>
              ) : <span className="w-6 shrink-0" />}
              <Row active={n.id === value} onClick={() => { onChange(n.id); setOpen(false); }}>
                <span className="min-w-0 flex-1 truncate">{q ? n.path : n.path.split(" › ").pop()}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{LEVEL[n.level]}{n.level < 3 && n.leafCount ? ` · ${n.leafCount}` : ""}</span>
              </Row>
            </div>
          ))}
          {!list.length && <p className="p-3 text-center text-xs text-muted-foreground">Aucune catégorie.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Row({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent", active && "bg-accent font-medium")}>
      {active ? <Check className="h-3.5 w-3.5 shrink-0" /> : <span className="w-3.5 shrink-0" />}{children}
    </button>
  );
}
