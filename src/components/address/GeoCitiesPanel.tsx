// ============================================================
// ADMIN: Gestion des villes par pays et région (onglet Villes)
// ============================================================

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Search, Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCountries } from "@/hooks/use-countries";
import { fetchRegions, fetchCities, fetchCitiesByCountry, createCity, deleteCity, importCitiesFromCSV, exportCitiesToCSV } from "@/lib/address/api";

// Safe SelectItem that never has empty value
function SafeSelectItem({ value, children }: { value: string; children: React.ReactNode }) {
  if (!value || value === "") {
    console.warn("SafeSelectItem: empty value prevented");
    return null;
  }
  return <SelectItem value={value}>{children}</SelectItem>;
}

export function GeoCitiesPanel() {
  const qc = useQueryClient();
  const { data: countries, isLoading: countriesLoading } = useCountries({ onlyEnabled: true });
  const [selectedCountryId, setSelectedCountryId] = useState<string>("");
  const [selectedRegionId, setSelectedRegionId] = useState<string>("__all__");
  const [newName, setNewName] = useState("");
  const [q, setQ] = useState("");
  const [csvText, setCsvText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importReport, setImportReport] = useState<string | null>(null);

  // ─── Regions query ───
  const { data: regions } = useQuery({
    queryKey: ["geo_regions", selectedCountryId],
    queryFn: () => fetchRegions(selectedCountryId),
    enabled: !!selectedCountryId,
    staleTime: Infinity,
  });

  // ─── Cities query: by region OR by country ───
  const effectiveRegionId = selectedRegionId === "__all__" ? "" : selectedRegionId;
  
  const { data: cities, isLoading: citiesLoading, error: citiesError } = useQuery({
    queryKey: ["geo_cities", selectedCountryId, effectiveRegionId || "all"],
    queryFn: () => {
      if (effectiveRegionId) {
        return fetchCities(effectiveRegionId);
      }
      return fetchCitiesByCountry(selectedCountryId);
    },
    enabled: !!selectedCountryId,
    staleTime: Infinity,
  });

  const tableMissing = citiesError && (
    (citiesError as any)?.message?.includes("schema cache") ||
    (citiesError as any)?.message?.includes("does not exist")
  );

  const filtered = (cities ?? []).filter((c) =>
    !q || c.name.toLowerCase().includes(q.toLowerCase()),
  );

  // ─── Actions ───
  async function add() {
    if (!selectedCountryId || !newName.trim()) return;
    try {
      const regionId = effectiveRegionId || null;
      await createCity(selectedCountryId, regionId, newName.trim());
      toast.success("Ville ajoutée");
      setNewName("");
      qc.invalidateQueries({ queryKey: ["geo_cities"] });
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de l'ajout");
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Supprimer la ville "${name}" ?`)) return;
    try {
      await deleteCity(id);
      toast.success("Ville supprimée");
      qc.invalidateQueries({ queryKey: ["geo_cities"] });
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de la suppression");
    }
  }

  function handleExport() {
    if (!cities || cities.length === 0) {
      toast.info("Aucune ville à exporter");
      return;
    }
    try {
      const csv = exportCitiesToCSV(cities);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const countryCode = (countries ?? []).find((c) => c.id === selectedCountryId)?.code || selectedCountryId;
      link.download = `villes_${countryCode}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`${cities.length} ville(s) exportée(s)`);
    } catch (e: any) {
      toast.error("Erreur lors de l'export : " + e.message);
    }
  }

  async function handleCSVImport() {
    if (!selectedCountryId || !csvText.trim()) return;
    setImportReport(null);
    
    try {
      const lines = csvText.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) {
        toast.error("Le fichier CSV est vide");
        return;
      }
      
      // Parse CSV: format "Region,City" or just "City"
      const rows = lines.map((line) => {
        const parts = line.split(",").map((p) => p.trim()).filter(Boolean);
        return {
          regionName: parts.length >= 2 ? parts[0] : "",
          cityName: parts.length >= 2 ? parts[1] : parts[0] || "",
        };
      }).filter((r) => r.cityName);

      if (rows.length === 0) {
        toast.error("Aucune donnée valide trouvée dans le CSV");
        return;
      }

      const result = await importCitiesFromCSV(selectedCountryId, rows);
      const report = `Créées: ${result.created} | Ignorées: ${result.skipped}`;
      setImportReport(report);
      toast.success(report);
      setCsvText("");
      setShowImport(false);
      qc.invalidateQueries({ queryKey: ["geo_cities"] });
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de l'import");
      setImportReport(`Erreur: ${e.message}`);
    }
  }

  // ─── Loading state ───
  if (countriesLoading) {
    return <p className="text-sm text-muted-foreground">Chargement des pays...</p>;
  }

  return (
    <div className="space-y-4">
      {/* Country selector */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Pays</label>
        <Select
          value={selectedCountryId || "__none__"}
          onValueChange={(v) => {
            const val = v === "__none__" ? "" : v;
            setSelectedCountryId(val);
            setSelectedRegionId("__all__");
            setQ("");
            setImportReport(null);
          }}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Choisir un pays..." />
          </SelectTrigger>
          <SelectContent>
            <SafeSelectItem value="__none__">Choisir un pays...</SafeSelectItem>
            {(countries ?? []).filter((c) => c?.id).map((c) => (
              <SafeSelectItem key={c.id} value={c.id}>
                {c.flag_emoji ? `${c.flag_emoji} ` : ""}{c.name || "Sans nom"}
              </SafeSelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Region selector */}
      {selectedCountryId && (
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Région (optionnel)</label>
          <Select
            value={selectedRegionId || "__all__"}
            onValueChange={(v) => setSelectedRegionId(v || "__all__")}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Toutes les régions..." />
            </SelectTrigger>
            <SelectContent>
              <SafeSelectItem value="__all__">Toutes les régions</SafeSelectItem>
              {(regions ?? []).filter((r) => r?.id).map((r) => (
                <SafeSelectItem key={r.id} value={r.id}>{r.name || "Sans nom"}</SafeSelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Empty state: no country selected */}
      {tableMissing && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 space-y-2">
          <p className="font-semibold">⚠️ Tables manquantes dans Supabase</p>
          <p>Les tables geo_regions, geo_cities et addresses n'ont pas été créées.</p>
          <p className="font-medium">Pour corriger :</p>
          <ol className="list-decimal ml-5 space-y-1 text-xs">
            <li>Ouvrez Supabase Dashboard → SQL Editor</li>
            <li>Copiez le script depuis : supabase/migrations/20260617_address_system.sql</li>
            <li>Cliquez sur "Run"</li>
            <li>Rafraîchissez cette page</li>
          </ol>
        </div>
      )}

      {!selectedCountryId ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">Sélectionnez un pays pour gérer ses villes.</p>
        </div>
      ) : (
        <>
          {/* Toolbar: Search + Import + Export */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher une ville..."
                className="pl-7 h-9"
              />
            </div>
            <Button size="sm" variant="outline" onClick={() => { setShowImport(!showImport); setImportReport(null); }}>
              <Upload className="mr-1 h-3.5 w-3.5" /> Importer
            </Button>
            <Button size="sm" variant="outline" onClick={handleExport} disabled={!cities || cities.length === 0}>
              <Download className="mr-1 h-3.5 w-3.5" /> Exporter
            </Button>
          </div>

          {/* Import report */}
          {importReport && (
            <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2 text-xs text-emerald-700">
              {importReport}
            </div>
          )}

          {/* CSV Import panel */}
          {showImport && (
            <Card className="bg-slate-50">
              <CardContent className="p-3 space-y-2">
                <p className="text-xs font-medium">Import CSV — formats acceptés :</p>
                <div className="text-[10px] text-muted-foreground font-mono bg-white p-2 rounded border">
                  Région,Ville<br/>
                  Dakar,Dakar<br/>
                  Dakar,Pikine<br/>
                  Thiès,Mbour
                </div>
                <textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder="Dakar,Dakar&#10;Dakar,Pikine&#10;Thiès,Mbour"
                  className="w-full h-24 text-xs p-2 border rounded-md font-mono"
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={handleCSVImport} disabled={!csvText.trim()}>
                    Importer
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowImport(false); setCsvText(""); }}>
                    Annuler
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Add new city */}
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

          {/* Cities list */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Villes ({filtered.length}{q ? ` / ${cities?.length ?? 0}` : ""})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {citiesLoading ? (
                <p className="text-sm text-muted-foreground">Chargement...</p>
              ) : filtered.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground">
                    {q ? "Aucune ville trouvée pour cette recherche." : "Aucune ville. Ajoutez-en une ou importez un CSV."}
                  </p>
                  {!q && (regions ?? []).length === 0 && (
                    <p className="text-[10px] text-amber-600 mt-1">
                      Conseil : Importez d'abord les régions de ce pays.
                    </p>
                  )}
                </div>
              ) : (
                <ul className="divide-y max-h-80 overflow-y-auto">
                  {filtered.map((c) => (
                    <li key={c.id} className="flex items-center justify-between py-2">
                      <div className="min-w-0">
                        <span className="text-sm">{c.name}</span>
                        {c.region_id && regions && (
                          <span className="text-[10px] text-muted-foreground ml-2">
                            {regions.find((r) => r.id === c.region_id)?.name}
                          </span>
                        )}
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => remove(c.id, c.name)}>
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
