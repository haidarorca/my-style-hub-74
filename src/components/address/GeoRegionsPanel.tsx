// ============================================================
// ADMIN: Gestion des régions par pays (onglet Régions)
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
import { fetchRegions, createRegion, deleteRegion, importRegionsFromCSV, exportRegionsToCSV } from "@/lib/address/api";

// Safe SelectItem that never has empty value
function SafeSelectItem({ value, children }: { value: string; children: React.ReactNode }) {
  if (!value || value === "") {
    console.warn("SafeSelectItem: empty value prevented");
    return null;
  }
  return <SelectItem value={value}>{children}</SelectItem>;
}

export function GeoRegionsPanel() {
  const qc = useQueryClient();
  const { data: countries, isLoading: countriesLoading } = useCountries({ onlyEnabled: true });
  const [selectedCountryId, setSelectedCountryId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [q, setQ] = useState("");
  const [csvText, setCsvText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importReport, setImportReport] = useState<string | null>(null);

  const { data: regions, isLoading, error: regionsError } = useQuery({
    queryKey: ["geo_regions", selectedCountryId],
    queryFn: () => fetchRegions(selectedCountryId),
    enabled: !!selectedCountryId,
    staleTime: Infinity,
  });

  // Détecter si la table n'existe pas encore
  const tableMissing = regionsError && (
    (regionsError as any)?.message?.includes("schema cache") ||
    (regionsError as any)?.message?.includes("does not exist")
  );

  const filtered = (regions ?? []).filter((r) =>
    !q || r.name.toLowerCase().includes(q.toLowerCase()),
  );

  async function add() {
    if (!selectedCountryId || !newName.trim()) return;
    try {
      await createRegion(selectedCountryId, newName.trim());
      toast.success(`Région "${newName.trim()}" ajoutée`);
      setNewName("");
      qc.invalidateQueries({ queryKey: ["geo_regions", selectedCountryId] });
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de l'ajout");
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Supprimer la région "${name}" ?\n\nLes villes liées ne seront pas supprimées.`)) return;
    try {
      await deleteRegion(id);
      toast.success("Région supprimée");
      qc.invalidateQueries({ queryKey: ["geo_regions", selectedCountryId] });
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de la suppression");
    }
  }

  function handleExport() {
    if (!regions || regions.length === 0) {
      toast.info("Aucune région à exporter");
      return;
    }
    try {
      const csv = exportRegionsToCSV(regions);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const countryCode = (countries ?? []).find((c) => c.id === selectedCountryId)?.code || selectedCountryId;
      link.download = `regions_${countryCode}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`${regions.length} région(s) exportée(s)`);
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

      // Skip header if it looks like a header (contains "region" or "nom")
      const headerWords = ["region", "nom", "name", "région"];
      const startIdx = headerWords.some((w) => lines[0].toLowerCase().includes(w)) ? 1 : 0;
      const names = lines.slice(startIdx);
      
      if (names.length === 0) {
        toast.error("Aucune donnée valide trouvée après l'en-tête");
        return;
      }

      const result = await importRegionsFromCSV(selectedCountryId, names);
      const report = `Créées: ${result.created} | Doublons ignorés: ${result.duplicates}`;
      setImportReport(report);
      toast.success(report);
      setCsvText("");
      setShowImport(false);
      qc.invalidateQueries({ queryKey: ["geo_regions", selectedCountryId] });
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de l'import");
      setImportReport(`Erreur: ${e.message}`);
    }
  }

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
            setSelectedCountryId(v === "__none__" ? "" : v);
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
          <p className="text-sm text-muted-foreground">Sélectionnez un pays pour gérer ses régions.</p>
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une région..." className="pl-7 h-9" />
            </div>
            <Button size="sm" variant="outline" onClick={() => { setShowImport(!showImport); setImportReport(null); }}>
              <Upload className="mr-1 h-3.5 w-3.5" /> Importer
            </Button>
            <Button size="sm" variant="outline" onClick={handleExport} disabled={!regions || regions.length === 0}>
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
                <p className="text-xs font-medium">Import CSV — une région par ligne :</p>
                <div className="text-[10px] text-muted-foreground font-mono bg-white p-2 rounded border">
                  Dakar<br/>
                  Thiès<br/>
                  Saint-Louis
                </div>
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
                  <Button size="sm" variant="ghost" onClick={() => { setShowImport(false); setCsvText(""); }}>
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
                <p className="text-sm text-muted-foreground">Chargement...</p>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {q ? "Aucune région trouvée pour cette recherche." : "Aucune région. Ajoutez-en une ou importez un CSV."}
                </p>
              ) : (
                <ul className="divide-y max-h-80 overflow-y-auto">
                  {filtered.map((r) => (
                    <li key={r.id} className="flex items-center justify-between py-2">
                      <span className="text-sm">{r.name}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => remove(r.id, r.name)}>
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
