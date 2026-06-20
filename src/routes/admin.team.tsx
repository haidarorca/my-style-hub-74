import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Plus, Shield, Trash2, UserPlus, Activity, Users as UsersIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/team")({
  component: () => (
    <PermissionGate superOnly>
      <TeamPage />
    </PermissionGate>
  ),
});

// ---------- Types ----------
type AppRole = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  is_system: boolean;
};
type RolePermission = { role_id: string; resource: string; action: string; allowed: boolean };
type Assignment = {
  user_id: string;
  role_id: string;
  assigned_at: string;
  profiles?: { full_name: string | null; email: string | null } | null;
  app_roles?: { key: string; label: string } | null;
};
type ActivityRow = {
  id: string;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  from_page: string | null;
  created_at: string;
  details: any;
};

// ---------- Permission matrix definition ----------
const RESOURCES: Array<{ key: string; label: string; actions: string[] }> = [
  { key: "orders",      label: "Commandes",       actions: ["view", "update", "confirm", "delete"] },
  { key: "payments",    label: "Paiements",       actions: ["view", "verify", "refund"] },
  { key: "import",      label: "Import & Fret",   actions: ["weigh", "compute_freight", "request_freight_payment"] },
  { key: "deliveries",  label: "Livraisons",      actions: ["view", "update_status"] },
  { key: "products",    label: "Produits",        actions: ["view", "update", "delete"] },
  { key: "customers",   label: "Clients",         actions: ["view", "contact"] },
  { key: "vendors",     label: "Vendeurs",        actions: ["view", "update"] },
  { key: "suppliers",   label: "Fournisseurs",    actions: ["view", "contact"] },
  { key: "support",     label: "Support / SAV",   actions: ["view", "answer"] },
  { key: "tasks",       label: "Tâches",          actions: ["view", "complete", "assign"] },
  { key: "team",        label: "Équipe & Rôles",  actions: ["view", "manage"] },
];

const ACTION_LABELS: Record<string, string> = {
  view: "Voir", update: "Modifier", delete: "Supprimer", confirm: "Confirmer",
  verify: "Vérifier", refund: "Rembourser", weigh: "Peser",
  compute_freight: "Calculer fret", request_freight_payment: "Demander paiement",
  update_status: "Changer statut", contact: "Contacter", answer: "Répondre",
  complete: "Terminer", assign: "Assigner", manage: "Gérer",
};

function TeamPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" /> Équipe & Permissions
        </h1>
        <p className="text-sm text-muted-foreground">
          Gérez vos employés, leurs rôles et leurs autorisations.
        </p>
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members"><UsersIcon className="mr-2 h-4 w-4" />Membres</TabsTrigger>
          <TabsTrigger value="roles"><Shield className="mr-2 h-4 w-4" />Rôles & Permissions</TabsTrigger>
          <TabsTrigger value="activity"><Activity className="mr-2 h-4 w-4" />Journal d'activité</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-4"><MembersTab /></TabsContent>
        <TabsContent value="roles" className="mt-4"><RolesTab /></TabsContent>
        <TabsContent value="activity" className="mt-4"><ActivityTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// MEMBERS TAB
// ============================================================
function MembersTab() {
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [searchEmail, setSearchEmail] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const [r, a] = await Promise.all([
      supabase.from("app_roles").select("*").order("is_system", { ascending: false }).order("label"),
      (supabase as any)
        .from("user_role_assignments")
        .select("user_id, role_id, assigned_at, profiles:profiles!user_role_assignments_user_id_fkey(full_name,email), app_roles(key,label)")
        .order("assigned_at", { ascending: false }),
    ]);
    setRoles((r.data as AppRole[]) ?? []);
    setAssignments((a.data as Assignment[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  const handleAssign = async () => {
    if (!searchEmail.trim() || !selectedRoleId) {
      toast.error("Email et rôle requis");
      return;
    }
    setBusy(true);
    try {
      const { data: profile, error: e1 } = await supabase
        .from("profiles").select("id,email").eq("email", searchEmail.trim().toLowerCase()).maybeSingle();
      if (e1) throw e1;
      if (!profile) {
        toast.error("Aucun utilisateur avec cet email. Demandez-lui de créer un compte d'abord.");
        return;
      }
      const { error: e2 } = await (supabase as any)
        .from("user_role_assignments")
        .insert({ user_id: profile.id, role_id: selectedRoleId });
      if (e2) throw e2;
      toast.success("Rôle attribué");
      setSearchEmail("");
      setSelectedRoleId("");
      await refresh();
    } catch (err: any) {
      toast.error(err.message ?? "Échec");
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (user_id: string, role_id: string) => {
    if (!confirm("Retirer ce rôle ?")) return;
    const { error } = await (supabase as any)
      .from("user_role_assignments").delete()
      .eq("user_id", user_id).eq("role_id", role_id);
    if (error) { toast.error(error.message); return; }
    toast.success("Rôle retiré");
    await refresh();
  };

  // Group assignments by user
  const byUser = useMemo(() => {
    const map = new Map<string, { user_id: string; email: string | null; name: string | null; roles: Assignment[] }>();
    for (const a of assignments) {
      const k = a.user_id;
      if (!map.has(k)) {
        map.set(k, {
          user_id: a.user_id,
          email: a.profiles?.email ?? null,
          name: a.profiles?.full_name ?? null,
          roles: [],
        });
      }
      map.get(k)!.roles.push(a);
    }
    return Array.from(map.values());
  }, [assignments]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Attribuer un rôle
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Input
            placeholder="Email du collaborateur (déjà inscrit)"
            value={searchEmail}
            onChange={(e) => setSearchEmail(e.target.value)}
            className="flex-1"
          />
          <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
            <SelectTrigger className="sm:w-64"><SelectValue placeholder="Rôle…" /></SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleAssign} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Attribuer"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Membres de l'équipe ({byUser.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : byUser.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Aucun membre n'a encore reçu de rôle métier.
            </p>
          ) : (
            <div className="space-y-2">
              {byUser.map((u) => (
                <div key={u.user_id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{u.name ?? "Sans nom"}</div>
                    <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {u.roles.map((r) => (
                      <Badge key={r.role_id} variant="secondary" className="gap-1">
                        {r.app_roles?.label}
                        <button
                          onClick={() => handleRevoke(u.user_id, r.role_id)}
                          className="ml-1 hover:text-destructive"
                          title="Retirer"
                        >×</button>
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// ROLES TAB
// ============================================================
function RolesTab() {
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [perms, setPerms] = useState<RolePermission[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const [r, p] = await Promise.all([
      supabase.from("app_roles").select("*").order("is_system", { ascending: false }).order("label"),
      (supabase as any).from("role_permissions").select("*"),
    ]);
    const rolesData = (r.data as AppRole[]) ?? [];
    setRoles(rolesData);
    setPerms((p.data as RolePermission[]) ?? []);
    if (!selectedRoleId && rolesData.length > 0) setSelectedRoleId(rolesData[0].id);
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  const selectedRole = roles.find((r) => r.id === selectedRoleId);
  const isSuperAdminRole = selectedRole?.key === "super_admin";

  const hasPerm = (resource: string, action: string) =>
    perms.some((p) => p.role_id === selectedRoleId && p.resource === resource && p.action === action && p.allowed);

  const togglePerm = async (resource: string, action: string, checked: boolean) => {
    if (!selectedRoleId) return;
    if (checked) {
      const { error } = await (supabase as any)
        .from("role_permissions")
        .upsert({ role_id: selectedRoleId, resource, action, allowed: true });
      if (error) { toast.error(error.message); return; }
      setPerms((prev) => {
        const exists = prev.find((p) => p.role_id === selectedRoleId && p.resource === resource && p.action === action);
        if (exists) return prev.map((p) => p === exists ? { ...p, allowed: true } : p);
        return [...prev, { role_id: selectedRoleId, resource, action, allowed: true }];
      });
    } else {
      const { error } = await (supabase as any)
        .from("role_permissions").delete()
        .eq("role_id", selectedRoleId).eq("resource", resource).eq("action", action);
      if (error) { toast.error(error.message); return; }
      setPerms((prev) => prev.filter((p) => !(p.role_id === selectedRoleId && p.resource === resource && p.action === action)));
    }
  };

  const deleteRole = async (id: string) => {
    if (!confirm("Supprimer ce rôle personnalisé ?")) return;
    const { error } = await (supabase as any).from("app_roles").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Rôle supprimé");
    setSelectedRoleId("");
    await refresh();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Rôles</CardTitle>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="outline" className="h-7 w-7"><Plus className="h-4 w-4" /></Button>
            </DialogTrigger>
            <CreateRoleDialog onCreated={async () => { setCreateOpen(false); await refresh(); }} />
          </Dialog>
        </CardHeader>
        <CardContent className="p-2">
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : (
            <div className="space-y-1">
              {roles.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedRoleId(r.id)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    selectedRoleId === r.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{r.label}</span>
                    {r.is_system && <Badge variant="outline" className="text-[9px]">SYS</Badge>}
                  </div>
                  <div className={`text-[10px] truncate ${selectedRoleId === r.id ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                    {r.key}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">{selectedRole?.label ?? "Sélectionnez un rôle"}</CardTitle>
              {selectedRole?.description && (
                <p className="text-xs text-muted-foreground mt-1">{selectedRole.description}</p>
              )}
            </div>
            {selectedRole && !selectedRole.is_system && (
              <Button variant="ghost" size="icon" onClick={() => deleteRole(selectedRole.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!selectedRoleId ? null : isSuperAdminRole ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Le Super Administrateur a toutes les permissions par défaut. Aucune configuration nécessaire.
            </p>
          ) : (
            <div className="space-y-4">
              {RESOURCES.map((res) => (
                <div key={res.key} className="rounded-lg border p-3">
                  <div className="font-semibold text-sm mb-2">{res.label}</div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {res.actions.map((a) => (
                      <label key={a} className="flex items-center gap-2 text-sm cursor-pointer rounded p-1.5 hover:bg-accent">
                        <Checkbox
                          checked={hasPerm(res.key, a)}
                          onCheckedChange={(v) => togglePerm(res.key, a, Boolean(v))}
                        />
                        <span>{ACTION_LABELS[a] ?? a}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CreateRoleDialog({ onCreated }: { onCreated: () => void }) {
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!label.trim() || !key.trim()) { toast.error("Clé et libellé requis"); return; }
    setBusy(true);
    const { error } = await (supabase as any).from("app_roles").insert({
      key: key.trim().toLowerCase().replace(/\s+/g, "_"),
      label: label.trim(),
      description: description.trim() || null,
      is_system: false,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Rôle créé");
    setLabel(""); setKey(""); setDescription("");
    onCreated();
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Nouveau rôle</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Libellé</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex: Responsable Boutique" />
        </div>
        <div>
          <Label>Clé technique</Label>
          <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="ex: responsable_boutique" />
        </div>
        <div>
          <Label>Description</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optionnel" />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Créer"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ============================================================
// ACTIVITY TAB
// ============================================================
function ActivityTab() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    void (async () => {
      const { data } = await (supabase as any)
        .from("admin_action_log")
        .select("id, actor_email, action, target_type, target_id, from_page, created_at, details")
        .order("created_at", { ascending: false })
        .limit(200);
      setRows((data as ActivityRow[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.actor_email ?? "").toLowerCase().includes(q) ||
      r.action.toLowerCase().includes(q) ||
      (r.target_type ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Dernières activités (200)</CardTitle>
          <Input
            placeholder="Filtrer par email, action, cible…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:w-72"
          />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Aucune activité.</p>
        ) : (
          <div className="space-y-1.5">
            {filtered.map((r) => (
              <div key={r.id} className="flex flex-col gap-1 rounded border bg-card p-2.5 text-sm sm:flex-row sm:items-center sm:gap-3">
                <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-36">
                  {new Date(r.created_at).toLocaleString("fr-FR")}
                </span>
                <Badge variant="outline" className="shrink-0 font-mono text-[10px]">{r.action}</Badge>
                <span className="truncate text-xs text-muted-foreground flex-1">
                  {r.actor_email ?? "—"}
                  {r.target_type && <> · {r.target_type}{r.target_id ? `#${r.target_id.slice(0, 8)}` : ""}</>}
                  {r.from_page && <> · <span className="font-mono">{r.from_page}</span></>}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
