// ============================================================
// ADMIN: Gestion des régions par pays (onglet Régions)
// ============================================================

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Search, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCountries } from "@/hooks/use-countries";
import { fetchRegions, createRegion, deleteRegion, importRegionsFromCSV } from "@/lib/address/api";
import type { GeoRegion } from "@/lib/address/types";

const sb = supabase as any;

export function GeoRegionsPanel() {
  const qc = useQueryClient();
  const { data: countries } = useCountries({ onlyEnabled: true });
  const [selectedCountryId, setSelectedCountryId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [q, setQ] = useState("");
  const [csvText, setCsvText] = useState("");
  const [showImport, setShowImport] = useState(false);

  const { data: regions, isLoading } = useQuery({
    queryKey: ["geo_regions", selectedCountryId],
    queryFn: () => fetchRegions(selectedCountryId),
    enabled: !!selectedCountryId,
  });

  const filtered = (regions ?? []).filter((r) =>
    !q || r.name.toLowerCase().includes(q.toLowerCase()),
  );

  async function add() {
    if (!selectedCountryId || !newName.trim()) return;
    try {
      await createRegion(selectedCountryId, newName.trim());
      toast.success("Région ajoutée");
      setNewName("");
      qc.invalidateQueries({ queryKey: ["geo_regions", selectedCountryId] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Supprimer « ${name} » ?`)) return;
    try {
      await deleteRegion(id);
      toast.success("Région supprimée");
      qc.invalidateQueries({ queryKey: ["geo_regions", selectedCountryId] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleCSVImport() {
    if (!selectedCountryId || !csvText.trim()) return;
    const lines = csvText.split("\n").map((l) => l.trim()).filter(Boolean);
    // Skip header if present
    const names = lines[0]?.toLowerCase().includes("region")
      ? lines.slice(1)
      : lines;
    try {
      const result = await importRegionsFromCSV(selectedCountryId, names);
      toast.success(`${result.created} région(s) créée(s), ${result.duplicates} doublon(s)`);
      setCsvText("");
      setShowImport(false);
      qc.invalidateQueries({ queryKey: ["geo_regions", selectedCountryId] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="space-y-4">
      {/* Country selector */}
      <div>
        <label className="text-xs text-muted-foreground">Pays</label>
        <Select value={selectedCountryId} onValueChange={setSelectedCountryId}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Choisir un pays..." />
          </SelectTrigger>
          <SelectContent>
            {(countries ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.flag_emoji ? `${c.flag_emoji} ` : ""}{c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedCountryId ? (
        <p className="text-sm text-muted-foreground">Sélectionnez un pays pour gérer ses régions.</p>
      ) : (
        <>
          {/* Add + Search + Import */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher..." className="pl-7 h-9" />
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowImport(!showImport)}>
              <Upload className="mr-1 h-3.5 w-3.5" /> CSV
            </Button>
          </div>

          {/* CSV Import panel */}
          {showImport && (
            <Card className="bg-slate-50">
              <CardContent className="p-3 space-y-2">
                <p className="text-xs font-medium">Import CSV — une région par ligne</p>
                <textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder="Dakar&#10;Thiès&#10;Saint-Louis"
                  className="w-full h-24 text-xs p-2 border rounded-md font-mono"
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={handleCSVImport} disabled={!csvText.trim()}>
                    Importer
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowImport(false)}>
                    Annuler
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Add new */}
          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nouvelle région..."
              className="h-9"
              onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            />
            <Button size="sm" onClick={add} disabled={!newName.trim()}>
              <Plus className="mr-1 h-4 w-4" /> Ajouter
            </Button>
          </div>

          {/* List */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Régions ({filtered.length}{q ? ` / ${regions?.length ?? 0}` : ""})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Chargement…</p>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {q ? "Aucune région trouvée." : "Aucune région. Ajoutez-en une ou importez un CSV."}
                </p>
              ) : (
                <ul className="divide-y max-h-80 overflow-y-auto">
                  {filtered.map((r) => (
                    <li key={r.id} className="flex items-center justify-between py-2">
                      <span className="text-sm">{r.name}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(r.id, r.name)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
