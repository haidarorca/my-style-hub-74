import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listSavRules, upsertSavRule, deleteSavRule, previewSavRules } from "@/lib/sav-workflow.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Sparkles, Settings2 } from "lucide-react";
import { PermissionGate } from "@/components/admin/PermissionGate";

export const Route = createFileRoute("/admin/sav-rules")({
  component: () => (
    <PermissionGate perm="sav_rules_manage">
      <SavRulesPage />
    </PermissionGate>
  ),
});

const RULE_KEYS = [
  { key: "returns_enabled", label: "Retours autorisés", type: "bool" },
  { key: "exchanges_enabled", label: "Échanges autorisés", type: "bool" },
  { key: "warranty_enabled", label: "Garantie autorisée", type: "bool" },
  { key: "return_window_days", label: "Délai de retour (jours)", type: "number" },
  { key: "warranty_months", label: "Garantie (mois)", type: "number" },
  { key: "requires_evidence", label: "Preuves obligatoires", type: "bool" },
  { key: "auto_accept_under_amount", label: "Auto-accepter sous (XOF)", type: "number" },
  { key: "refund_method_default", label: "Méthode remboursement par défaut", type: "text" },
  { key: "shipping_cost_attribution", label: "Frais retour à la charge de", type: "text" },
  { key: "restocking_fee_percent", label: "Frais de restock (%)", type: "number" },
] as const;

const SCOPES = ["global", "country", "category", "shop", "product"] as const;
const SCOPE_LABEL: Record<string, string> = {
  global: "Global", country: "Pays", category: "Catégorie", shop: "Boutique", product: "Produit",
};

function SavRulesPage() {
  const list = useServerFn(listSavRules);
  const upsert = useServerFn(upsertSavRule);
  const del = useServerFn(deleteSavRule);
  const preview = useServerFn(previewSavRules);
  const qc = useQueryClient();

  const { data = [] } = useQuery({ queryKey: ["sav-rules"], queryFn: () => list() });

  const upsertM = useMutation({
    mutationFn: (p: any) => upsert({ data: p }),
    onSuccess: () => { toast.success("Règle enregistrée"); qc.invalidateQueries({ queryKey: ["sav-rules"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });
  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Règle supprimée"); qc.invalidateQueries({ queryKey: ["sav-rules"] }); },
  });

  const [scope, setScope] = useState<typeof SCOPES[number]>("global");
  const [scopeId, setScopeId] = useState("");
  const [ruleKey, setRuleKey] = useState(RULE_KEYS[0].key);
  const [ruleValue, setRuleValue] = useState<any>("");
  const [priority, setPriority] = useState(0);
  const [active, setActive] = useState(true);

  function parseValue() {
    const def = RULE_KEYS.find((r) => r.key === ruleKey);
    if (!def) return ruleValue;
    if (def.type === "bool") return ruleValue === "true" || ruleValue === true;
    if (def.type === "number") return Number(ruleValue);
    return ruleValue;
  }

  function handleSave() {
    upsertM.mutate({
      scope, scope_id: scope === "global" ? null : scopeId || null,
      rule_key: ruleKey, value: parseValue(),
      priority, is_active: active,
    });
  }

  const rules = data as any[];
  const grouped = SCOPES.reduce((acc, s) => {
    acc[s] = rules.filter((r) => r.scope === s);
    return acc;
  }, {} as Record<string, any[]>);

  // Simulator
  const [simProduct, setSimProduct] = useState("");
  const [simCountry, setSimCountry] = useState("");
  const [simShop, setSimShop] = useState("");
  const [simResult, setSimResult] = useState<any>(null);
  async function runPreview() {
    try {
      const r = await preview({ data: {
        product_id: simProduct || null,
        destination_country_id: simCountry || null,
        shop_id: simShop || null,
      }});
      setSimResult(r);
    } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
  }

  return (
    <div className="container max-w-6xl py-6 px-4 space-y-4">
      <div className="flex items-center gap-2">
        <Settings2 className="w-6 h-6" />
        <h1 className="text-2xl font-bold">Règles SAV</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Configurez les autorisations de retour, échange, garantie et remboursement par scope. Le scope le plus spécifique l'emporte (Produit → Catégorie → Boutique → Pays → Global).
      </p>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Plus className="w-4 h-4" />Nouvelle règle</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
            <div>
              <Label>Scope</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SCOPES.map((s) => <SelectItem key={s} value={s}>{SCOPE_LABEL[s]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {scope !== "global" && (
              <div className="md:col-span-2">
                <Label>ID du {SCOPE_LABEL[scope]}</Label>
                <Input value={scopeId} onChange={(e) => setScopeId(e.target.value)} placeholder="UUID" />
              </div>
            )}
            <div>
              <Label>Règle</Label>
              <Select value={ruleKey} onValueChange={(v) => { setRuleKey(v as any); setRuleValue(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{RULE_KEYS.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valeur</Label>
              {RULE_KEYS.find((r) => r.key === ruleKey)?.type === "bool" ? (
                <Select value={String(ruleValue)} onValueChange={setRuleValue}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Oui</SelectItem>
                    <SelectItem value="false">Non</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input value={ruleValue} onChange={(e) => setRuleValue(e.target.value)} />
              )}
            </div>
            <div>
              <Label>Priorité</Label>
              <Input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={active} onCheckedChange={setActive} />
              <Label className="!mt-0">Actif</Label>
            </div>
            <div className="md:col-span-6">
              <Button onClick={handleSave} disabled={upsertM.isPending}>Enregistrer</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="global">
        <TabsList>{SCOPES.map((s) => <TabsTrigger key={s} value={s}>{SCOPE_LABEL[s]} ({grouped[s]?.length ?? 0})</TabsTrigger>)}</TabsList>
        {SCOPES.map((s) => (
          <TabsContent key={s} value={s}>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Règle</TableHead>
                  <TableHead>Valeur</TableHead>
                  {s !== "global" && <TableHead>Scope ID</TableHead>}
                  <TableHead>Priorité</TableHead>
                  <TableHead>Actif</TableHead>
                  <TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(grouped[s] ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{RULE_KEYS.find((x) => x.key === r.rule_key)?.label ?? r.rule_key}</TableCell>
                      <TableCell><code>{JSON.stringify(r.value)}</code></TableCell>
                      {s !== "global" && <TableCell className="text-xs">{r.scope_id?.slice(0, 8) ?? "—"}</TableCell>}
                      <TableCell>{r.priority}</TableCell>
                      <TableCell>{r.is_active ? <Badge className="bg-emerald-100 text-emerald-800">Oui</Badge> : <Badge variant="outline">Non</Badge>}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => delM.mutate(r.id)}>
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(grouped[s] ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={s === "global" ? 5 : 6} className="text-center text-muted-foreground py-6">Aucune règle</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>
        ))}
      </Tabs>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Sparkles className="w-4 h-4" />Simulateur</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Input value={simProduct} onChange={(e) => setSimProduct(e.target.value)} placeholder="Produit (UUID)" />
            <Input value={simCountry} onChange={(e) => setSimCountry(e.target.value)} placeholder="Pays destination (UUID)" />
            <Input value={simShop} onChange={(e) => setSimShop(e.target.value)} placeholder="Boutique (UUID)" />
          </div>
          <Button onClick={runPreview} variant="outline">Résoudre les règles</Button>
          {simResult && (
            <pre className="bg-muted p-3 rounded text-xs overflow-auto">{JSON.stringify(simResult, null, 2)}</pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
