import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Save, History as HistoryIcon, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/commissions")({
  component: () => <PermissionGate superOnly><CommissionsPage /></PermissionGate>,
});

type Scope = "global" | "vendor" | "category" | "product";
interface Rule {
  id: string;
  scope: Scope;
  vendor_id: string | null;
  category_id: string | null;
  product_id: string | null;
  rate_percent: number;
  is_enabled: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

const sb = supabase as unknown as {
  from: (t: string) => any;
};

function CommissionsPage() {
  const { isSuperAdmin } = useAuth();
  if (!isSuperAdmin) return null;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Commissions</h1>
      <p className="text-xs text-muted-foreground">
        Priorité : produit → sous-catégorie → catégorie → vendeur → globale. La règle la plus précise gagne.
      </p>
      <Tabs defaultValue="rules">
        <TabsList className="w-full">
          <TabsTrigger value="rules" className="flex-1">Règles</TabsTrigger>
          <TabsTrigger value="vendors" className="flex-1">Vendeurs</TabsTrigger>
          <TabsTrigger value="history" className="flex-1">Historique</TabsTrigger>
        </TabsList>
        <TabsContent value="rules" className="space-y-4 pt-3"><RulesTab /></TabsContent>
        <TabsContent value="vendors" className="pt-3"><VendorsTab /></TabsContent>
        <TabsContent value="history" className="pt-3"><HistoryTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function useRules() {
  return useQuery({
    queryKey: ["commission_rules"],
    queryFn: async () => {
      const { data, error } = await sb.from("commission_rules").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Rule[];
    },
  });
}

function RulesTab() {
  const qc = useQueryClient();
  const { data: rules } = useRules();
  const refresh = () => qc.invalidateQueries({ queryKey: ["commission_rules"] });

  const global = rules?.find((r) => r.scope === "global");
  const vendorRules = rules?.filter((r) => r.scope === "vendor") ?? [];
  const categoryRules = rules?.filter((r) => r.scope === "category") ?? [];
  const productRules = rules?.filter((r) => r.scope === "product") ?? [];

  return (
    <>
      <GlobalRuleCard rule={global} onChange={refresh} />
      <VendorRulesCard rules={vendorRules} onChange={refresh} />
      <CategoryRulesCard rules={categoryRules} onChange={refresh} />
      <ProductRulesCard rules={productRules} onChange={refresh} />
    </>
  );
}

/* ---------- Global ---------- */
function GlobalRuleCard({ rule, onChange }: { rule: Rule | undefined; onChange: () => void }) {
  const [rate, setRate] = useState<string>(rule ? String(rule.rate_percent) : "0");
  const [enabled, setEnabled] = useState(rule?.is_enabled ?? true);

  async function save() {
    const v = Number(rate);
    if (Number.isNaN(v) || v < 0 || v > 100) { toast.error("Taux invalide (0-100)"); return; }
    if (rule) {
      const { error } = await sb.from("commission_rules").update({ rate_percent: v, is_enabled: enabled }).eq("id", rule.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await sb.from("commission_rules").insert({ scope: "global", rate_percent: v, is_enabled: enabled });
      if (error) return toast.error(error.message);
    }
    toast.success("Commission globale mise à jour"); onChange();
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Commission globale</CardTitle></CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs">Taux (%)</label>
          <Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className="w-28" />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          <span className="text-sm">Activée</span>
        </div>
        <Button onClick={save} size="sm"><Save className="mr-1 h-4 w-4" /> Enregistrer</Button>
      </CardContent>
    </Card>
  );
}

/* ---------- Vendors ---------- */
function useVendors() {
  return useQuery({
    queryKey: ["vendors-with-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles")
        .select("user_id, profiles:profiles!inner(shop_name, full_name, email, vendor_mode, hide_contact_publicly)")
        .eq("role", "vendeur");
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        user_id: string;
        profiles: { shop_name: string | null; full_name: string | null; email: string | null; vendor_mode: string; hide_contact_publicly: boolean } | null;
      }>;
    },
  });
}

function VendorRulesCard({ rules, onChange }: { rules: Rule[]; onChange: () => void }) {
  const { data: vendors } = useVendors();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [rate, setRate] = useState("");

  const filtered = (vendors ?? []).filter((v) => {
    const t = (v.profiles?.shop_name || v.profiles?.full_name || v.profiles?.email || "").toLowerCase();
    return !search || t.includes(search.toLowerCase());
  });

  async function add() {
    if (!selectedId) return toast.error("Choisissez un vendeur");
    const v = Number(rate);
    if (Number.isNaN(v) || v < 0 || v > 100) return toast.error("Taux invalide");
    const { error } = await sb.from("commission_rules").upsert({
      scope: "vendor", vendor_id: selectedId, rate_percent: v, is_enabled: true,
    }, { onConflict: "vendor_id" });
    if (error) return toast.error(error.message);
    toast.success("Règle vendeur enregistrée"); setRate(""); onChange();
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Par vendeur</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <div>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Rechercher un vendeur" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-7" />
            </div>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="mt-2"><SelectValue placeholder="Choisir un vendeur" /></SelectTrigger>
              <SelectContent>
                {filtered.map((v) => (
                  <SelectItem key={v.user_id} value={v.user_id}>
                    {v.profiles?.shop_name || v.profiles?.full_name || v.profiles?.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input type="number" step="0.01" placeholder="%" value={rate} onChange={(e) => setRate(e.target.value)} className="w-24" />
          <Button onClick={add}><Plus className="mr-1 h-4 w-4" /> Ajouter</Button>
        </div>

        <RuleList rules={rules} onChange={onChange} labelOf={(r) => {
          const v = vendors?.find((x) => x.user_id === r.vendor_id);
          return v?.profiles?.shop_name || v?.profiles?.full_name || v?.profiles?.email || r.vendor_id || "—";
        }} />
      </CardContent>
    </Card>
  );
}

/* ---------- Categories ---------- */
function useCategories() {
  return useQuery({
    queryKey: ["categories-flat"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id, name, parent_id, level").order("level").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; parent_id: string | null; level: number }[];
    },
  });
}

function CategoryRulesCard({ rules, onChange }: { rules: Rule[]; onChange: () => void }) {
  const { data: cats } = useCategories();
  const [selectedId, setSelectedId] = useState("");
  const [rate, setRate] = useState("");

  const labelById = useMemo(() => {
    const m = new Map<string, string>();
    (cats ?? []).forEach((c) => m.set(c.id, `${"— ".repeat(c.level - 1)}${c.name}`));
    return m;
  }, [cats]);

  async function add() {
    if (!selectedId) return toast.error("Choisissez une catégorie");
    const v = Number(rate);
    if (Number.isNaN(v) || v < 0 || v > 100) return toast.error("Taux invalide");
    const { error } = await sb.from("commission_rules").upsert(
      { scope: "category", category_id: selectedId, rate_percent: v, is_enabled: true },
      { onConflict: "category_id,vendor_id" },
    );
    if (error) return toast.error(error.message);
    toast.success("Règle catégorie enregistrée"); setRate(""); onChange();
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Par catégorie</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger><SelectValue placeholder="Choisir une catégorie" /></SelectTrigger>
            <SelectContent>
              {(cats ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{labelById.get(c.id)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="number" step="0.01" placeholder="%" value={rate} onChange={(e) => setRate(e.target.value)} className="w-24" />
          <Button onClick={add}><Plus className="mr-1 h-4 w-4" /> Ajouter</Button>
        </div>
        <RuleList rules={rules} onChange={onChange} labelOf={(r) => labelById.get(r.category_id ?? "") ?? r.category_id ?? "—"} />
      </CardContent>
    </Card>
  );
}

/* ---------- Products ---------- */
function ProductRulesCard({ rules, onChange }: { rules: Rule[]; onChange: () => void }) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [rate, setRate] = useState("");

  const { data: products } = useQuery({
    queryKey: ["products-search", search],
    enabled: search.length > 1,
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name, code").ilike("name", `%${search}%`).limit(20);
      return (data ?? []) as { id: string; name: string; code: string }[];
    },
  });

  async function add() {
    if (!selectedId) return toast.error("Choisissez un produit");
    const v = Number(rate);
    if (Number.isNaN(v) || v < 0 || v > 100) return toast.error("Taux invalide");
    const { error } = await sb.from("commission_rules").upsert(
      { scope: "product", product_id: selectedId, rate_percent: v, is_enabled: true },
      { onConflict: "product_id" },
    );
    if (error) return toast.error(error.message);
    toast.success("Règle produit enregistrée"); setRate(""); onChange();
  }

  // map product_id → name for display
  const ids = rules.map((r) => r.product_id).filter(Boolean) as string[];
  const { data: namedProducts } = useQuery({
    queryKey: ["product-names", ids.sort().join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name, code").in("id", ids);
      return (data ?? []) as { id: string; name: string; code: string }[];
    },
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Par produit</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <div>
            <Input placeholder="Rechercher un produit (nom)" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="mt-2"><SelectValue placeholder="Choisir un produit" /></SelectTrigger>
              <SelectContent>
                {(products ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input type="number" step="0.01" placeholder="%" value={rate} onChange={(e) => setRate(e.target.value)} className="w-24" />
          <Button onClick={add}><Plus className="mr-1 h-4 w-4" /> Ajouter</Button>
        </div>
        <RuleList rules={rules} onChange={onChange} labelOf={(r) => {
          const p = namedProducts?.find((x) => x.id === r.product_id);
          return p ? `${p.name} (${p.code})` : r.product_id ?? "—";
        }} />
      </CardContent>
    </Card>
  );
}

/* ---------- Generic rule list ---------- */
function RuleList({ rules, onChange, labelOf }: { rules: Rule[]; onChange: () => void; labelOf: (r: Rule) => string }) {
  if (rules.length === 0) return <p className="text-xs text-muted-foreground">Aucune règle.</p>;

  async function adjust(r: Rule, delta: number) {
    const newVal = Math.max(0, Math.min(100, Number(r.rate_percent) + delta));
    const { error } = await sb.from("commission_rules").update({ rate_percent: newVal }).eq("id", r.id);
    if (error) return toast.error(error.message);
    onChange();
  }
  async function setRate(r: Rule, val: number) {
    const { error } = await sb.from("commission_rules").update({ rate_percent: val }).eq("id", r.id);
    if (error) return toast.error(error.message);
    onChange();
  }
  async function toggle(r: Rule) {
    const { error } = await sb.from("commission_rules").update({ is_enabled: !r.is_enabled }).eq("id", r.id);
    if (error) return toast.error(error.message);
    onChange();
  }
  async function remove(r: Rule) {
    if (!confirm("Supprimer cette règle ?")) return;
    const { error } = await sb.from("commission_rules").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    onChange();
  }

  return (
    <ul className="divide-y">
      {rules.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
          <div className="min-w-0 flex-1 truncate text-sm">{labelOf(r)}</div>
          <Button size="sm" variant="outline" onClick={() => adjust(r, -1)}>-1%</Button>
          <Input
            type="number" step="0.01" defaultValue={r.rate_percent}
            onBlur={(e) => { const v = Number(e.target.value); if (!Number.isNaN(v) && v !== Number(r.rate_percent)) setRate(r, v); }}
            className="w-20"
          />
          <Button size="sm" variant="outline" onClick={() => adjust(r, 1)}>+1%</Button>
          <div className="flex items-center gap-1">
            <Switch checked={r.is_enabled} onCheckedChange={() => toggle(r)} />
          </div>
          <Button size="icon" variant="ghost" onClick={() => remove(r)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Vendors tab ---------- */
function VendorsTab() {
  const { data: vendors, refetch } = useVendors();

  async function setMode(userId: string, mode: string) {
    const { error } = await supabase.from("profiles").update({ vendor_mode: mode } as any).eq("id", userId);
    if (error) return toast.error(error.message);
    toast.success("Mode mis à jour"); refetch();
  }
  async function setHide(userId: string, hide: boolean) {
    const { error } = await supabase.from("profiles").update({ hide_contact_publicly: hide } as any).eq("id", userId);
    if (error) return toast.error(error.message);
    refetch();
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Mode vendeur</CardTitle></CardHeader>
      <CardContent>
        {!vendors ? <p className="text-sm text-muted-foreground">Chargement…</p> : (
          <ul className="divide-y">
            {vendors.map((v) => {
              const p = v.profiles;
              const mode = p?.vendor_mode ?? "no_commission";
              return (
                <li key={v.user_id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p?.shop_name || p?.full_name || p?.email}</div>
                    <div className="truncate text-xs text-muted-foreground">{p?.email}</div>
                  </div>
                  <Select value={mode} onValueChange={(val) => setMode(v.user_id, val)}>
                    <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no_commission">Sans commission</SelectItem>
                      <SelectItem value="commission">Avec commission</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={p?.hide_contact_publicly ?? false}
                      disabled={mode === "commission"}
                      onCheckedChange={(c) => setHide(v.user_id, c)}
                    />
                    <span className="text-xs">Masquer contact</span>
                  </div>
                  {mode === "commission" && <Badge variant="secondary">Plateforme</Badge>}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- History ---------- */
function HistoryTab() {
  const { data } = useQuery({
    queryKey: ["commission_history"],
    queryFn: async () => {
      const { data, error } = await sb.from("commission_rule_history")
        .select("*").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data as Array<{
        id: string; rule_id: string; action: string;
        old_value: any; new_value: any;
        actor_email: string | null; created_at: string;
      }>;
    },
  });

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><HistoryIcon className="h-4 w-4" /> Historique</CardTitle></CardHeader>
      <CardContent>
        {!data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune action enregistrée.</p>
        ) : (
          <ul className="divide-y text-xs">
            {data.map((h) => {
              const oldRate = h.old_value?.rate_percent;
              const newRate = h.new_value?.rate_percent;
              const scope = h.new_value?.scope ?? h.old_value?.scope;
              return (
                <li key={h.id} className="py-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{h.action}</Badge>
                    <span className="font-medium">{scope}</span>
                    <span className="text-muted-foreground">{new Date(h.created_at).toLocaleString("fr-FR")}</span>
                  </div>
                  <div className="text-muted-foreground">
                    {oldRate !== undefined && newRate !== undefined ? `${oldRate}% → ${newRate}%` : newRate !== undefined ? `${newRate}%` : oldRate !== undefined ? `(supprimée à ${oldRate}%)` : null}
                    {h.actor_email && <> · par {h.actor_email}</>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
