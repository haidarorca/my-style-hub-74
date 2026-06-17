import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, GripVertical, Globe, MapPin, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCountries, type Country } from "@/hooks/use-countries";
import { GeoRegionsPanel } from "@/components/address/GeoRegionsPanel";
import { GeoCitiesPanel } from "@/components/address/GeoCitiesPanel";

export const Route = createFileRoute("/admin/countries")({
  component: () => (
    <PermissionGate superOnly>
      <CountriesPage />
    </PermissionGate>
  ),
});

const sb = supabase as any;

function CountriesPage() {
  const qc = useQueryClient();
  const { data: countries } = useCountries();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["countries"] });

  const [form, setForm] = useState({ code: "", name: "", flag_emoji: "" });

  async function add() {
    const code = form.code.trim().toUpperCase();
    const name = form.name.trim();
    if (!code || code.length < 2 || code.length > 3 || !name) {
      return toast.error("Code ISO (2-3 lettres) et nom requis");
    }
    const position = (countries?.length ?? 0) + 1;
    const { error } = await sb.from("countries").insert({
      code, name, flag_emoji: form.flag_emoji.trim() || null, position,
    });
    if (error) return toast.error(error.message);
    toast.success(`Pays « ${name} » ajouté`);
    setForm({ code: "", name: "", flag_emoji: "" });
    invalidate();
  }

  async function update(id: string, patch: Partial<Country>) {
    const { error } = await sb.from("countries").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    invalidate();
  }

  async function remove(c: Country) {
    if (!confirm(`Supprimer « ${c.name} » ? Les règles de commission liées seront supprimées.`)) return;
    const { error } = await sb.from("countries").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Pays supprimé");
    invalidate();
  }

  async function move(c: Country, dir: -1 | 1) {
    if (!countries) return;
    const sorted = [...countries].sort((a, b) => a.position - b.position);
    const idx = sorted.findIndex((x) => x.id === c.id);
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;
    const other = sorted[targetIdx];
    await Promise.all([
      sb.from("countries").update({ position: other.position }).eq("id", c.id),
      sb.from("countries").update({ position: c.position }).eq("id", other.id),
    ]);
    invalidate();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Géographie</h1>
        <p className="text-xs text-muted-foreground">
          Pays, régions et villes utilisés dans tout le système Kawzone.
        </p>
      </div>

      <Tabs defaultValue="countries">
        <TabsList className="w-full">
          <TabsTrigger value="countries" className="flex-1 flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" /> Pays
          </TabsTrigger>
          <TabsTrigger value="regions" className="flex-1 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" /> Régions
          </TabsTrigger>
          <TabsTrigger value="cities" className="flex-1 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" /> Villes
          </TabsTrigger>
        </TabsList>

        {/* ─── TAB: Countries ─── */}
        <TabsContent value="countries" className="space-y-4 pt-3">
          <Card>
            <CardHeader><CardTitle className="text-base">Ajouter un pays</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[100px_1fr_80px_auto]">
                <div>
                  <label className="text-xs text-muted-foreground">Code ISO</label>
                  <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="FR" maxLength={3} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Nom</label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="France" maxLength={120} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Drapeau</label>
                  <Input value={form.flag_emoji} onChange={(e) => setForm({ ...form, flag_emoji: e.target.value })} placeholder="🇫🇷" maxLength={8} />
                </div>
                <div className="flex items-end">
                  <Button onClick={add} className="w-full">
                    <Plus className="mr-1 h-4 w-4" /> Ajouter
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Liste ({countries?.length ?? 0})</CardTitle></CardHeader>
            <CardContent>
              {!countries ? (
                <p className="text-sm text-muted-foreground">Chargement…</p>
              ) : countries.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun pays.</p>
              ) : (
                <ul className="divide-y">
                  {countries.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                      <div className="flex flex-col">
                        <button onClick={() => move(c, -1)} className="text-muted-foreground hover:text-foreground" aria-label="Monter">▲</button>
                        <button onClick={() => move(c, 1)} className="text-muted-foreground hover:text-foreground" aria-label="Descendre">▼</button>
                      </div>
                      <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                      <span className="text-xl">{c.flag_emoji ?? "🏳️"}</span>
                      <Input defaultValue={c.code} className="w-20 font-mono text-xs uppercase" maxLength={3}
                        onBlur={(e) => {
                          const v = e.target.value.trim().toUpperCase();
                          if (v && v !== c.code) update(c.id, { code: v });
                        }} />
                      <Input defaultValue={c.name} className="min-w-0 flex-1" maxLength={120}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== c.name) update(c.id, { name: v });
                        }} />
                      <Input defaultValue={c.flag_emoji ?? ""} className="w-16" maxLength={8} placeholder="🏳️"
                        onBlur={(e) => {
                          const v = e.target.value.trim() || null;
                          if (v !== c.flag_emoji) update(c.id, { flag_emoji: v as any });
                        }} />
                      <div className="flex items-center gap-2">
                        <Switch checked={c.is_enabled} onCheckedChange={(v) => update(c.id, { is_enabled: v })} />
                        <span className="text-xs">Actif</span>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => remove(c)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── TAB: Regions ─── */}
        <TabsContent value="regions" className="pt-3">
          <GeoRegionsPanel />
        </TabsContent>

        {/* ─── TAB: Cities ─── */}
        <TabsContent value="cities" className="pt-3">
          <GeoCitiesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
