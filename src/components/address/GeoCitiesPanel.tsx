// ============================================================
// ADMIN: Gestion des villes par pays et région (onglet Villes)
// ============================================================

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Search, Upload, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCountries } from "@/hooks/use-countries";
import { fetchRegions, fetchCities, createCity, deleteCity, importCitiesFromCSV, exportCitiesToCSV } from "@/lib/address/api";
import type { GeoCity } from "@/lib/address/types";

const sb = supabase as any;

export function GeoCitiesPanel() {
  const qc = useQueryClient();
  const { data: countries } = useCountries({ onlyEnabled: true });
  const [selectedCountryId, setSelectedCountryId] = useState<string>("");
  const [selectedRegionId, setSelectedRegionId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [q, setQ] = useState("");
  const [csvText, setCsvText] = useState("");
  const [showImport, setShowImport] = useState(false);

  const { data: regions } = useQuery({
    queryKey: ["geo_regions", selectedCountryId],
    queryFn: () => fetchRegions(selectedCountryId),
    enabled: !!selectedCountryId,
  });

  const { data: cities, isLoading } = useQuery({
    queryKey: ["geo_cities", selectedRegionId],
    queryFn: () => fetchCities(selectedRegionId),
    enabled: !!selectedRegionId,
  });

  const filtered = (cities ?? []).filter((c) =>
    !q || c.name.toLowerCase().includes(q.toLowerCase()),
  );

  async function add() {
    if (!selectedCountryId || !newName.trim()) return;
    try {
      const regionId = selectedRegionId || null;
      await createCity(selectedCountryId, regionId, newName.trim());
      toast.success("Ville ajoutée");
      setNewName("");
      qc.invalidateQueries({ queryKey: ["geo_cities", selectedRegionId] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Supprimer « ${name} » ?`)) return;
    try {
      await deleteCity(id);
      toast.success("Ville supprimée");
      qc.invalidateQueries({ queryKey: ["geo_cities", selectedRegionId] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  function handleExport() {
    if (!cities || cities.length === 0) return;
    const csv = exportCitiesToCSV(cities);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `villes_${selectedCountryId}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`${cities.length} ville(s) exportée(s)`);
  }

  async function handleCSVImport() {
    if (!selectedCountryId || !csvText.trim()) return;
    const lines = csvText.split("\n").map((l) => l.trim()).filter(Boolean);
    const rows = lines.map((line) => {
      const parts = line.split(",").map((p) => p.trim());
      return {
        regionName: parts[0] || "",
        cityName: parts[1] || parts[0] || "",
      };
    }).filter((r) => r.cityName);

    try {
      const result = await importCitiesFromCSV(selectedCountryId, rows);
      toast.success(`${result.created} ville(s) créée(s), ${result.skipped} ignorée(s)`);
      setCsvText("");
      setShowImport(false);
      qc.invalidateQueries({ queryKey: ["geo_cities", selectedRegionId] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="space-y-4">
      {/* Country selector */}
      <div>
        <label className="text-xs text-muted-foreground">Pays</label>
        <Select value={selectedCountryId || "__none__"} onValueChange={(v) => { setSelectedCountryId(v === "__none__" ? "" : v); setSelectedRegionId(""); }}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Choisir un pays..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Choisir un pays...</SelectItem>
            {(countries ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.flag_emoji ? `${c.flag_emoji} ` : ""}{c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Region selector */}
      {selectedCountryId && (
        <div>
          <label className="text-xs text-muted-foreground">Région (optionnel)</label>
          <Select value={selectedRegionId || "__all__"} onValueChange={(v) => setSelectedRegionId(v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Toutes les régions..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Toutes les régions</SelectItem>
              {(regions ?? []).map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {!selectedCountryId ? (
        <p className="text-sm text-muted-foreground">Sélectionnez un pays pour gérer ses villes.</p>
      ) : (
        <>
          {/* Search + Import */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher..." className="pl-7 h-9" />
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowImport(!showImport)}>
              <Upload className="mr-1 h-3.5 w-3.5" /> Importer
            </Button>
            <Button size="sm" variant="outline" onClick={handleExport} disabled={!cities || cities.length === 0}>
              <Download className="mr-1 h-3.5 w-3.5" /> Exporter
            </Button>
          </div>

          {/* CSV Import panel */}
          {showImport && (
            <Card className="bg-slate-50">
              <CardContent className="p-3 space-y-2">
                <p className="text-xs font-medium">Import CSV — format: Région,Ville</p>
                <textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder="Dakar,Dakar&#10;Dakar,Pikine&#10;Thiès,Thiès&#10;Thiès,Mbour"
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
              placeholder="Nouvelle ville..."
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
                Villes {selectedRegionId && "de la région"} ({filtered.length}{q ? ` / ${cities?.length ?? 0}` : ""})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Chargement…</p>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {q ? "Aucune ville trouvée." : "Aucune ville. Ajoutez-en une ou importez un CSV."}
                </p>
              ) : (
                <ul className="divide-y max-h-80 overflow-y-auto">
                  {filtered.map((c) => (
                    <li key={c.id} className="flex items-center justify-between py-2">
                      <span className="text-sm">{c.name}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(c.id, c.name)}>
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
