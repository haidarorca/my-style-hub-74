import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus, Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Brand { id: string; name: string; slug: string }

interface Props {
  value: string | null; // brand_id
  onChange: (id: string | null, name: string | null) => void;
  className?: string;
}

function normalizeSlug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function BrandCombobox({ value, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedName, setSelectedName] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (supabase as any)
      .from("brands")
      .select("id, name, slug")
      .ilike("name", `%${search.trim()}%`)
      .order("name")
      .limit(50)
      .then(({ data }: { data: Brand[] | null }) => {
        if (!cancelled) { setBrands(data ?? []); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [search]);

  useEffect(() => {
    if (!value) { setSelectedName(""); return; }
    const found = brands.find((b) => b.id === value);
    if (found) setSelectedName(found.name);
    else {
      (supabase as any).from("brands").select("name").eq("id", value).maybeSingle()
        .then(({ data }: any) => { if (data?.name) setSelectedName(data.name); });
    }
  }, [value, brands]);

  const trimmed = search.trim();
  const slug = normalizeSlug(trimmed);
  const exact = useMemo(
    () => brands.find((b) => b.slug === slug || b.name.toLowerCase() === trimmed.toLowerCase()),
    [brands, slug, trimmed],
  );

  async function handleCreate() {
    if (!trimmed) return;
    setCreating(true);
    try {
      const { data, error } = await (supabase as any)
        .from("brands")
        .insert({ name: trimmed })
        .select("id, name, slug")
        .maybeSingle();
      if (error) {
        // unique violation → fetch existing
        if (String(error.message).includes("brands_slug_key") || error.code === "23505") {
          const { data: ex } = await (supabase as any)
            .from("brands").select("id, name").eq("slug", slug).maybeSingle();
          if (ex) { onChange(ex.id, ex.name); setSelectedName(ex.name); setOpen(false); return; }
        }
        throw error;
      }
      if (data) { onChange(data.id, data.name); setSelectedName(data.name); setOpen(false); }
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur création marque");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button" variant="outline" role="combobox"
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="truncate">{selectedName || "Choisir / créer une marque…"}</span>
          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              autoFocus placeholder="Rechercher une marque…"
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-7 text-sm"
            />
          </div>
        </div>
        <ul className="max-h-64 overflow-auto py-1">
          {value && (
            <li>
              <button
                type="button"
                onClick={() => { onChange(null, null); setSelectedName(""); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
              >
                ✕ Retirer la marque
              </button>
            </li>
          )}
          {loading && (
            <li className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Recherche…
            </li>
          )}
          {!loading && brands.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => { onChange(b.id, b.name); setSelectedName(b.name); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
              >
                <span className="flex h-4 w-4 items-center justify-center">
                  {value === b.id && <Check className="h-3.5 w-3.5" />}
                </span>
                <span className="flex-1 truncate">{b.name}</span>
              </button>
            </li>
          ))}
          {!loading && brands.length === 0 && trimmed.length === 0 && (
            <li className="px-3 py-3 text-center text-xs text-muted-foreground">
              Tapez le nom d'une marque
            </li>
          )}
          {!loading && trimmed.length > 0 && !exact && (
            <li className="border-t p-2">
              <Button
                type="button" size="sm" variant="default" className="w-full gap-1 h-8 text-xs"
                disabled={creating} onClick={handleCreate}
              >
                {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                Créer la marque « {trimmed} »
              </Button>
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
