import { useMemo, useState } from "react";
import { Search, ShieldAlert, ChevronDown } from "lucide-react";
import {
  PERMISSION_MODULES,
  permissionParent,
  type AdminPermission,
} from "@/lib/admin-permissions";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface Props {
  value: string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
}

/**
 * Matrice de permissions groupée par module.
 * Le commutateur du module accorde toutes ses actions d'un coup
 * (la permission « module » implique ses actions côté serveur aussi).
 */
export function PermissionMatrix({ value, disabled, onChange }: Props) {
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const modules = useMemo(() => {
    const base = PERMISSION_MODULES.filter((m) => !m.superOnly);
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (m) =>
        m.label.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.actions.some((a) => a.label.toLowerCase().includes(q)),
    );
  }, [search]);

  const has = (perm: string) =>
    value.includes(perm) || value.includes(permissionParent(perm));

  function toggleAction(perm: AdminPermission, checked: boolean) {
    const parent = permissionParent(perm);
    let next = value.filter((p) => p !== perm);
    if (next.includes(parent) && parent !== perm) {
      // on « déplie » le module en actions explicites avant de retirer une action
      const mod = PERMISSION_MODULES.find((m) => m.key === parent);
      next = next.filter((p) => p !== parent);
      if (mod) next.push(...mod.actions.map((a) => a.key).filter((k) => k !== perm));
    }
    if (checked) next.push(perm);
    onChange(Array.from(new Set(next)));
  }

  function toggleModule(moduleId: string, checked: boolean) {
    const mod = PERMISSION_MODULES.find((m) => m.id === moduleId);
    if (!mod) return;
    const keys = new Set<string>(mod.actions.map((a) => a.key));
    if (mod.key) keys.add(mod.key);
    let next = value.filter((p) => !keys.has(p));
    if (checked) next = next.concat(mod.key ? [mod.key] : Array.from(keys));
    onChange(Array.from(new Set(next)));
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher une permission…"
          className="pl-9"
        />
      </div>

      <div className="space-y-2">
        {modules.map((mod) => {
          const granted = mod.actions.filter((a) => has(a.key)).length;
          const all = granted === mod.actions.length;
          const open = openId === mod.id || search.trim().length > 0;
          return (
            <div key={mod.id} className="overflow-hidden rounded-xl border bg-card">
              <div className="flex items-center gap-2 p-3">
                <button
                  type="button"
                  onClick={() => setOpenId(open && !search ? null : mod.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      open && "rotate-180",
                    )}
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold">{mod.label}</span>
                      {mod.superOnly && <Badge variant="outline">Super admin</Badge>}
                      <Badge variant={granted ? "secondary" : "outline"} className="text-[11px]">
                        {granted}/{mod.actions.length}
                      </Badge>
                    </span>
                    <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">
                      {mod.description}
                    </span>
                  </span>
                </button>
                <Switch
                  checked={all}
                  disabled={disabled}
                  onCheckedChange={(v) => toggleModule(mod.id, v)}
                  aria-label={`Tout activer pour ${mod.label}`}
                />
              </div>

              {open && (
                <div className="grid grid-cols-1 gap-1.5 border-t bg-muted/20 p-3 sm:grid-cols-2">
                  {mod.actions.map((a) => (
                    <label
                      key={a.key}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border bg-background p-2 hover:bg-accent"
                    >
                      <Checkbox
                        checked={has(a.key)}
                        disabled={disabled}
                        onCheckedChange={(v) => toggleAction(a.key, !!v)}
                      />
                      <span className="flex min-w-0 items-center gap-1.5 text-sm">
                        <span className="truncate">{a.label}</span>
                        {a.sensitive && (
                          <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {modules.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucune permission ne correspond.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() =>
            onChange(
              PERMISSION_MODULES.filter((m) => !m.superOnly)
              .flatMap((m) => (m.key ? [m.key] : m.actions.map((a) => a.key)))
              .filter(
                (k, i, arr) => arr.indexOf(k) === i,
              ),
            )
          }
        >
          Tout accorder
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onChange([])}
        >
          Tout retirer
        </Button>
      </div>
    </div>
  );
}
