import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useHomeSections, type HomeSection, type HomeSectionKind } from "@/hooks/use-home-sections";
import { FeaturedProductsPicker } from "./FeaturedProductsPicker";
import { ArrowDown, ArrowUp, ExternalLink, Plus, Save, Trash2 } from "lucide-react";

const KIND_LABEL: Record<HomeSectionKind, string> = {
  hero: "Bannière principale",
  categories: "Catégories",
  featured: "Produits à la une",
  new: "Nouveautés",
  popular: "Produits populaires",
  category: "Section thématique (catégorie)",
};

export function HomeSectionsManager() {
  const qc = useQueryClient();
  const { data } = useHomeSections(true);
  const [rows, setRows] = useState<HomeSection[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data) setRows(data); }, [data]);

  const { data: categories } = useQuery({
    queryKey: ["admin", "categories", "flat"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories").select("id, name, level").order("level").order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

  const update = (id: string, patch: Partial<HomeSection>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const move = (index: number, dir: -1 | 1) => {
    const next = [...rows];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next.map((r, i) => ({ ...r, position: i })));
  };

  const addSection = async (kind: HomeSectionKind) => {
    const { error } = await (supabase as any).from("home_sections").insert({
      kind,
      title: KIND_LABEL[kind],
      position: rows.length,
      max_items: 8,
    });
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["home-sections"] });
    toast.success("Section ajoutée");
  };

  const remove = async (id: string) => {
    const { error } = await (supabase as any).from("home_sections").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["home-sections"] });
    toast.success("Section supprimée");
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const [i, r] of rows.entries()) {
        const { error } = await (supabase as any)
          .from("home_sections")
          .update({
            title: r.title,
            subtitle: r.subtitle,
            enabled: r.enabled,
            position: i,
            category_id: r.category_id,
            product_ids: r.product_ids ?? [],
            max_items: r.max_items,
          })
          .eq("id", r.id);
        if (error) throw error;
      }
      await qc.invalidateQueries({ queryKey: ["home-sections"] });
      await qc.invalidateQueries({ queryKey: ["home-section-products"] });
      toast.success("Page d'accueil enregistrée");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={saveAll} disabled={saving} className="gap-1">
          <Save className="h-4 w-4" /> Enregistrer
        </Button>
        <Button size="sm" variant="outline" onClick={() => setRows(data ?? [])} className="gap-1">
          Annuler
        </Button>
        <a href="/" target="_blank" rel="noreferrer">
          <Button size="sm" variant="secondary" className="gap-1">
            <ExternalLink className="h-4 w-4" /> Prévisualiser l'accueil
          </Button>
        </a>
        <div className="ms-auto flex items-center gap-2">
          <Select onValueChange={(v) => addSection(v as HomeSectionKind)}>
            <SelectTrigger className="h-8 w-[220px]">
              <SelectValue placeholder="Ajouter une section" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(KIND_LABEL) as HomeSectionKind[]).map((k) => (
                <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Plus className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((r, i) => (
          <Card key={r.id} className={r.enabled ? "" : "opacity-60"}>
            <CardContent className="space-y-3 p-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{KIND_LABEL[r.kind]}</p>
                  <p className="truncate text-[11px] text-muted-foreground">Position {i + 1}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Switch checked={r.enabled} onCheckedChange={(c) => update(r.id, { enabled: c })} />
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => move(i, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => move(i, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => remove(r.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {r.kind !== "hero" && (
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Titre</Label>
                    <Input className="h-9" value={r.title ?? ""} onChange={(e) => update(r.id, { title: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Sous-titre</Label>
                    <Input className="h-9" value={r.subtitle ?? ""} onChange={(e) => update(r.id, { subtitle: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Nombre d'éléments</Label>
                    <Input
                      className="h-9" type="number" min={1} max={48}
                      value={r.max_items}
                      onChange={(e) => update(r.id, { max_items: Number(e.target.value) || 8 })}
                    />
                  </div>
                </div>
              )}

              {r.kind === "category" && (
                <div className="space-y-1">
                  <Label className="text-[11px]">Catégorie affichée</Label>
                  <Select value={r.category_id ?? ""} onValueChange={(v) => update(r.id, { category_id: v })}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Choisir" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {(categories ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {"— ".repeat(Math.max(0, (c.level ?? 1) - 1))}{c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {r.kind === "featured" && (
                <FeaturedProductsPicker
                  value={r.product_ids ?? []}
                  onChange={(ids) => update(r.id, { product_ids: ids })}
                />
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
