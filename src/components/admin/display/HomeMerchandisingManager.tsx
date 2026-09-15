/**
 * Merchandising de la page d'accueil (admin).
 *
 * Permet de piloter, produit par produit : priorité manuelle (1 → 10),
 * position forcée, ou exclusion complète de la page d'accueil.
 * L'exclusion ne retire jamais le produit du catalogue, de la recherche,
 * de sa catégorie ni de sa boutique.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { BulkCheckbox } from "@/components/shared/BulkActionsBar";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { EyeOff, RotateCcw, Search } from "lucide-react";

interface Row {
  id: string;
  name: string;
  code: string;
  category_id: string | null;
  home_priority: number | null;
  home_position: number | null;
  home_excluded: boolean;
  product_images: { url: string; position: number }[] | null;
}

type Filter = "all" | "manual" | "excluded" | "auto";

const AUTO = "__auto__";
const EXCLUDED = "__excluded__";
const NONE = "__none__";

export function HomeMerchandisingManager() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search, 300);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "home-merchandising", q, filter],
    queryFn: async () => {
      let req = supabase
        .from("products")
        .select("id, name, code, category_id, home_priority, home_position, home_excluded, product_images(url, position)")
        .eq("status", "approved")
        .order("home_excluded", { ascending: true })
        .order("home_priority", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (q.trim()) req = req.or(`name.ilike.%${q.trim()}%,code.ilike.%${q.trim()}%`);
      if (filter === "excluded") req = req.eq("home_excluded", true);
      if (filter === "manual") req = req.not("home_priority", "is", null);
      if (filter === "auto") req = req.is("home_priority", null).eq("home_excluded", false);
      const { data, error } = await req;
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const rows = data ?? [];
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const save = useMutation({
    mutationFn: async ({ ids, patch }: { ids: string[]; patch: Partial<Pick<Row, "home_priority" | "home_position" | "home_excluded">> }) => {
      const { error } = await supabase.from("products").update(patch as never).in("id", ids);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "home-merchandising"] });
      await qc.invalidateQueries({ queryKey: ["home-section-products"] });
      await qc.invalidateQueries({ queryKey: ["products", "approved"] });
      toast.success("Réglages vitrine enregistrés");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const selectedIds = useMemo(() => [...selected], [selected]);

  const applyBulk = (patch: Partial<Row>) => {
    if (selectedIds.length === 0) return toast.error("Sélectionnez au moins un produit");
    save.mutate({ ids: selectedIds, patch: patch as never });
  };

  const statusOf = (r: Row) =>
    r.home_excluded ? "Exclu" : r.home_priority ? `Priorité ${r.home_priority}` : "Automatique";

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px]">
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            placeholder="Rechercher un produit (nom ou code)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les produits</SelectItem>
            <SelectItem value="manual">Priorité manuelle</SelectItem>
            <SelectItem value="excluded">Exclus de l'accueil</SelectItem>
            <SelectItem value="auto">Automatique</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Actions en masse */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <span className="text-xs font-semibold text-muted-foreground">
            {selectedIds.length} sélectionné{selectedIds.length > 1 ? "s" : ""}
          </span>
          <Select onValueChange={(v) => applyBulk({ home_priority: Number(v), home_excluded: false })}>
            <SelectTrigger className="h-8 w-[170px]"><SelectValue placeholder="Définir une priorité" /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((p) => (
                <SelectItem key={p} value={String(p)}>Priorité {p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => applyBulk({ home_excluded: true })}>
            <EyeOff className="h-3.5 w-3.5" /> Exclure de l'accueil
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1"
            onClick={() => applyBulk({ home_excluded: false, home_priority: null, home_position: null })}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Remettre en automatique
          </Button>
          <label className="ms-auto flex cursor-pointer items-center gap-2 text-xs font-semibold">
            <BulkCheckbox
              checked={allSelected}
              onChange={(c) => setSelected(c ? new Set(rows.map((r) => r.id)) : new Set())}
            />
            Tout sélectionner
          </label>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-muted/70 text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="w-10 p-2" />
              <th className="p-2 text-start">Produit</th>
              <th className="w-32 p-2 text-start">Statut accueil</th>
              <th className="w-40 p-2 text-start">Priorité</th>
              <th className="w-28 p-2 text-start">Position</th>
              <th className="w-28 p-2 text-start">Mode</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && (
              <tr><td colSpan={6} className="p-6 text-center text-xs text-muted-foreground">Chargement…</td></tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-xs text-muted-foreground">Aucun produit</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className={r.home_excluded ? "bg-muted/30" : undefined}>
                <td className="p-2 align-middle">
                  <BulkCheckbox
                    checked={selected.has(r.id)}
                    onChange={(c) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (c) next.add(r.id); else next.delete(r.id);
                        return next;
                      })
                    }
                  />
                </td>
                <td className="min-w-0 p-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <img
                      src={r.product_images?.[0]?.url ?? ""}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded border border-border object-contain"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{r.code}</p>
                    </div>
                  </div>
                </td>
                <td className="p-2">
                  <Badge variant={r.home_excluded ? "destructive" : r.home_priority ? "default" : "secondary"}>
                    {statusOf(r)}
                  </Badge>
                </td>
                <td className="p-2">
                  <Select
                    value={r.home_excluded ? EXCLUDED : r.home_priority ? String(r.home_priority) : AUTO}
                    onValueChange={(v) =>
                      save.mutate({
                        ids: [r.id],
                        patch:
                          v === EXCLUDED
                            ? { home_excluded: true }
                            : v === AUTO
                              ? { home_excluded: false, home_priority: null }
                              : { home_excluded: false, home_priority: Number(v) },
                      })
                    }
                  >
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AUTO}>Automatique</SelectItem>
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((p) => (
                        <SelectItem key={p} value={String(p)}>Priorité {p}</SelectItem>
                      ))}
                      <SelectItem value={EXCLUDED}>Exclure de l'accueil</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-2">
                  <Select
                    value={r.home_position ? String(r.home_position) : NONE}
                    onValueChange={(v) =>
                      save.mutate({ ids: [r.id], patch: { home_position: v === NONE ? null : Number(v) } })
                    }
                  >
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-64">
                      <SelectItem value={NONE}>—</SelectItem>
                      {Array.from({ length: 24 }, (_, i) => i + 1).map((p) => (
                        <SelectItem key={p} value={String(p)}>Position {p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-2 text-xs text-muted-foreground">
                  {r.home_excluded || r.home_priority || r.home_position ? "Manuel" : "Automatique"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-1 rounded-lg border border-dashed border-border p-3 text-[11px] text-muted-foreground">
        <p><Label className="text-[11px]">Priorité</Label> : 1 est la plus forte ; ces produits passent devant le classement automatique.</p>
        <p><Label className="text-[11px]">Position</Label> : place visée dans la section ; les autres produits sont décalés, jamais dupliqués.</p>
        <p><Label className="text-[11px]">Exclure de l'accueil</Label> : le produit reste visible dans sa catégorie, la recherche, la boutique et par son lien direct.</p>
      </div>
    </div>
  );
}
