import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, ShieldCheck, ShieldOff, Trash2, History, UserPlus, Crown, Pause, Play, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { PermissionMatrix } from "@/components/admin/PermissionMatrix";
import {
  setAdminPermissions,
  promoteToAdmin,
  setAdminSuspended,
  revokeAdmin,
} from "@/lib/admin-permissions.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { AdminTabList, AdminTabTrigger } from "@/components/admin/AdminTabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/admin/admins")({
  component: () => (
    <PermissionGate superOnly>
      <AdminsPage />
    </PermissionGate>
  ),
});

interface AdminRow {
  user_id: string;
  role: "admin" | "super_admin";
  is_suspended: boolean;
  full_name: string | null;
  email: string | null;
  permissions: string[];
}

function AdminsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [emailToAdd, setEmailToAdd] = useState("");
  const [adding, setAdding] = useState(false);

  const promote = useServerFn(promoteToAdmin);
  const suspendFn = useServerFn(setAdminSuspended);
  const revokeFn = useServerFn(revokeAdmin);

  const { data: admins, isLoading } = useQuery({
    queryKey: ["admins-list"],
    queryFn: async (): Promise<AdminRow[]> => {
      const { data: roleRows, error: rErr } = await (supabase as any)
        .from("user_roles")
        .select("user_id, role, is_suspended")
        .in("role", ["admin", "super_admin"]);
      if (rErr) throw rErr;
      const rows = (roleRows ?? []) as { user_id: string; role: "admin" | "super_admin"; is_suspended: boolean }[];

      const byUser = new Map<string, { role: "admin" | "super_admin"; is_suspended: boolean }>();
      for (const r of rows) {
        const existing = byUser.get(r.user_id);
        if (!existing || r.role === "super_admin") {
          byUser.set(r.user_id, { role: r.role, is_suspended: r.is_suspended });
        }
      }
      const userIds = Array.from(byUser.keys());
      if (userIds.length === 0) return [];

      const [{ data: profs }, { data: perms }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email").in("id", userIds),
        (supabase as any).from("admin_permissions").select("user_id, permission").in("user_id", userIds),
      ]);
      const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      const permMap = new Map<string, string[]>();
      for (const row of (perms ?? []) as { user_id: string; permission: string }[]) {
        const arr = permMap.get(row.user_id) ?? [];
        arr.push(row.permission);
        permMap.set(row.user_id, arr);
      }

      return userIds.map((uid) => {
        const r = byUser.get(uid)!;
        const p: any = profMap.get(uid);
        return {
          user_id: uid,
          role: r.role,
          is_suspended: r.is_suspended,
          full_name: p?.full_name ?? null,
          email: p?.email ?? null,
          permissions: permMap.get(uid) ?? [],
        };
      }).sort((a, b) => {
        if (a.role !== b.role) return a.role === "super_admin" ? -1 : 1;
        return (a.email ?? "").localeCompare(b.email ?? "");
      });
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admins-list"] });

  async function toggleSuspend(adminUserId: string, suspend: boolean) {
    try {
      await suspendFn({ data: { user_id: adminUserId, suspended: suspend } });
      toast.success(suspend ? "Admin suspendu" : "Admin réactivé");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Action impossible");
    }
  }

  async function removeAdmin(adminUserId: string) {
    if (!confirm("Retirer le rôle admin et toutes ses permissions ? Le compte devient un compte client.")) return;
    try {
      await revokeFn({ data: { user_id: adminUserId } });
      toast.success("Admin retiré");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Action impossible");
    }
  }

  async function addAdmin() {
    const email = emailToAdd.trim().toLowerCase();
    if (!email) return toast.error("Email requis");
    setAdding(true);
    try {
      await promote({ data: { email } });
      toast.success(`${email} est maintenant admin. Configurez ses permissions.`);
      setEmailToAdd("");
      setAddOpen(false);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Promotion impossible");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-bold">Gestion des administrateurs</h1>
          <p className="text-sm text-muted-foreground">
            Créez des administrateurs et réglez précisément ce que chacun peut voir et faire.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="rounded-full">
          <UserPlus className="mr-1 h-4 w-4" /> Ajouter un admin
        </Button>
      </div>

      <Tabs defaultValue="list">
        <AdminTabList>
          <AdminTabTrigger value="list"><ShieldCheck className="mr-1 h-4 w-4" /> Admins</AdminTabTrigger>
          <AdminTabTrigger value="log"><History className="mr-1 h-4 w-4" /> Historique</AdminTabTrigger>
        </AdminTabList>

        <TabsContent value="list" className="mt-4 space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : !admins || admins.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun admin pour le moment.</p>
          ) : (
            admins.map((a) => (
              <AdminCard
                key={a.user_id}
                admin={a}
                isSelf={a.user_id === user?.id}
                onSuspend={toggleSuspend}
                onRemove={removeAdmin}
                onSaved={refresh}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="log" className="mt-4">
          <ActionLog />
        </TabsContent>
      </Tabs>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un administrateur</DialogTitle>
            <DialogDescription>
              L'utilisateur doit déjà avoir un compte sur le site. Saisissez son email.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="email" placeholder="email@exemple.com"
            value={emailToAdd}
            onChange={(e) => setEmailToAdd(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addAdmin()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Annuler</Button>
            <Button onClick={addAdmin} disabled={adding}>
              <Plus className="mr-1 h-4 w-4" /> {adding ? "Ajout…" : "Promouvoir admin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdminCard({
  admin, isSelf, onSuspend, onRemove, onSaved,
}: {
  admin: AdminRow;
  isSelf: boolean;
  onSuspend: (id: string, suspend: boolean) => void;
  onRemove: (id: string) => void;
  onSaved: () => void;
}) {
  const savePerms = useServerFn(setAdminPermissions);
  const [draft, setDraft] = useState<string[]>(admin.permissions);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(admin.permissions); }, [admin.permissions.join("|")]);

  const dirty =
    draft.length !== admin.permissions.length ||
    draft.some((p) => !admin.permissions.includes(p));

  async function save() {
    setSaving(true);
    try {
      await savePerms({ data: { user_id: admin.user_id, permissions: draft } });
      toast.success("Permissions enregistrées");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              {admin.role === "super_admin" && <Crown className="h-4 w-4 text-amber-500" />}
              <span className="truncate">{admin.full_name || admin.email || "Sans nom"}</span>
              {admin.role === "super_admin" ? (
                <Badge>Super admin</Badge>
              ) : (
                <Badge variant="secondary">Admin</Badge>
              )}
              {admin.is_suspended && <Badge variant="destructive">Suspendu</Badge>}
              {isSelf && <Badge variant="outline">Vous</Badge>}
            </CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">{admin.email}</p>
          </div>
          {admin.role !== "super_admin" && !isSelf && (
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => onSuspend(admin.user_id, !admin.is_suspended)}>
                {admin.is_suspended
                  ? <><Play className="mr-1 h-3 w-3" /> Réactiver</>
                  : <><Pause className="mr-1 h-3 w-3" /> Suspendre</>}
              </Button>
              <Button size="sm" variant="outline" className="text-destructive" onClick={() => onRemove(admin.user_id)}>
                <Trash2 className="mr-1 h-3 w-3" /> Retirer
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {admin.role === "super_admin" ? (
          <p className="text-xs text-muted-foreground">
            Le super administrateur a toutes les permissions par défaut.
          </p>
        ) : isSelf ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldOff className="h-4 w-4" /> Vous ne pouvez pas modifier vos propres droits.
          </p>
        ) : (
          <div className="space-y-3">
            <PermissionMatrix value={draft} disabled={admin.is_suspended || saving} onChange={setDraft} />
            <div className="flex items-center justify-end gap-2">
              {dirty && (
                <Button size="sm" variant="ghost" onClick={() => setDraft(admin.permissions)} disabled={saving}>
                  Annuler
                </Button>
              )}
              <Button size="sm" onClick={save} disabled={!dirty || saving}>
                <Save className="mr-1 h-4 w-4" /> {saving ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActionLog() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-action-log"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("admin_action_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as Array<{
        id: string; actor_id: string | null; actor_email: string | null;
        action: string; target_type: string | null; target_id: string | null;
        details: Record<string, unknown> | null; created_at: string;
      }>;
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  if (!data || data.length === 0) return <p className="text-sm text-muted-foreground">Aucune action enregistrée.</p>;

  return (
    <ul className="space-y-2">
      {data.map((row) => (
        <li key={row.id} className="rounded-lg border bg-card p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{row.action}</Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(row.created_at).toLocaleString("fr-FR")}
            </span>
          </div>
          <p className="mt-1 text-xs">
            <span className="text-muted-foreground">Par :</span> {row.actor_email || "—"}
          </p>
          {row.target_type && (
            <p className="text-xs">
              <span className="text-muted-foreground">Cible :</span> {row.target_type} / {row.target_id}
            </p>
          )}
          {row.details && Object.keys(row.details).length > 0 && (
            <pre className="mt-1 overflow-x-auto rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
              {JSON.stringify(row.details, null, 2)}
            </pre>
          )}
        </li>
      ))}
    </ul>
  );
}
