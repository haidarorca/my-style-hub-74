import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_admin/categories")({
  component: CategoriesPage,
});

type Cat = {
  id: string; name: string; slug: string; level: number;
  parent_id: string | null; logo_url: string | null; position: number | null;
};

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function CategoriesPage() {
  const qc = useQueryClient();
  const { data: cats } = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories").select("*").order("level").order("position");
      if (error) throw error;
      return (data ?? []) as Cat[];
    },
  });

  const [name, setName] = useState("");
  const [level, setLevel] = useState<1 | 2 | 3>(1);
  const [parentId, setParentId] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const parentOptions = (cats ?? []).filter((c) => c.level === level - 1);

  async function handleCreate() {
    if (!name.trim()) return toast.error("Nom requis");
    if (level > 1 && !parentId) return toast.error("Catégorie parente requise");
    setBusy(true);
    try {
      let logo_url: string | null = null;
      if (logoFile) {
        const path = `${Date.now()}-${slugify(name)}-${logoFile.name}`;
        const { error: upErr } = await supabase.storage
          .from("category-logos").upload(path, logoFile, { upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("category-logos").getPublicUrl(path);
        logo_url = pub.publicUrl;
      }
      const { error } = await supabase.from("categories").insert({
        name: name.trim(), slug: slugify(name), level,
        parent_id: level === 1 ? null : parentId, logo_url,
      });
      if (error) throw error;
      toast.success("Catégorie créée");
      setName(""); setLogoFile(null); setParentId(null);
      await qc.invalidateQueries({ queryKey: ["admin", "categories"] });
      await qc.invalidateQueries({ queryKey: ["categories", "level1"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cette catégorie ?")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Supprimée");
    qc.invalidateQueries({ queryKey: ["admin", "categories"] });
  }

  const grouped = [1, 2, 3].map((lv) => ({
    level: lv,
    items: (cats ?? []).filter((c) => c.level === lv),
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Catégories</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">Nouvelle catégorie</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Nom</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Femme" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Niveau</label>
              <Select value={String(level)} onValueChange={(v) => { setLevel(Number(v) as 1|2|3); setParentId(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Niveau 1 (principale)</SelectItem>
                  <SelectItem value="2">Niveau 2 (sous-catégorie)</SelectItem>
                  <SelectItem value="3">Niveau 3 (détail)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {level > 1 && (
              <div className="space-y-1">
                <label className="text-xs font-medium">Parent</label>
                <Select value={parentId ?? ""} onValueChange={setParentId}>
                  <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
                  <SelectContent>
                    {parentOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Logo (optionnel)</label>
            <Input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
          </div>
          <Button onClick={handleCreate} disabled={busy}>
            <Plus className="mr-1 h-4 w-4" /> {busy ? "Création…" : "Créer"}
          </Button>
        </CardContent>
      </Card>

      {grouped.map((g) => (
        <Card key={g.level}>
          <CardHeader><CardTitle className="text-base">Niveau {g.level}</CardTitle></CardHeader>
          <CardContent>
            {g.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune catégorie.</p>
            ) : (
              <ul className="divide-y">
                {g.items.map((c) => {
                  const parent = cats?.find((x) => x.id === c.parent_id);
                  return (
                    <li key={c.id} className="flex items-center gap-3 py-2">
                      <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-accent">
                        {c.logo_url ? (
                          <img src={c.logo_url} alt={c.name} className="h-full w-full object-cover" />
                        ) : <ImageIcon className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{c.name}</div>
                        {parent && <div className="text-xs text-muted-foreground">↳ {parent.name}</div>}
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
