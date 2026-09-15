import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { BulkCheckbox } from "@/components/shared/BulkActionsBar";

interface Row { id: string; name: string; product_images: { url: string; position: number }[] | null }

export function FeaturedProductsPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");

  const { data } = useQuery({
    queryKey: ["admin", "featured-picker", search],
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("id, name, product_images(url, position)")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(60);
      if (search.trim()) q = q.ilike("name", `%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const toggle = (id: string, on: boolean) =>
    onChange(on ? [...value, id] : value.filter((x) => x !== id));

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
        <div className="min-w-0 space-y-1">
          <Label className="text-[11px]">Rechercher un produit</Label>
          <Input className="h-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom du produit" />
        </div>
        <Button size="sm" variant="ghost" className="h-9 shrink-0" onClick={() => onChange([])}>
          Vider ({value.length})
        </Button>
      </div>
      <div className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
        {(data ?? []).map((p) => (
          <label key={p.id} className="flex cursor-pointer items-center gap-3 px-2 py-1.5 text-sm hover:bg-muted/50">
            <BulkCheckbox checked={value.includes(p.id)} onChange={(c) => toggle(p.id, c)} />
            <img src={p.product_images?.[0]?.url ?? ""} alt="" className="h-8 w-8 shrink-0 rounded object-contain" />
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
