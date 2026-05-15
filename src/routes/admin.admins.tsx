import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, ShieldCheck, ShieldOff, Trash2, History, UserPlus, Crown, Pause, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, ADMIN_PERMISSION_LABELS, type AdminPermission } from "@/hooks/use-auth";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const ALL_PERMS: AdminPermission[] = [
  "orders", "products", "product_validation", "categories",
  "vendors", "customers", "support", "settings",
];

interface AdminRow {
  user_id: string;
  role: "admin" | "super_admin";
  is_suspended: boolean;
  full_name: string | null;
  email: string | null;
  permissions: AdminPermission[];
}

function AdminsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [emailToAdd, setEmailToAdd] = useState("");
  const [adding, setAdding] = useState(false);

  const { data: admins, isLoading } = useQuery({
    queryKey: ["admins-list"],
    queryFn: async (): Promise<AdminRow[]> => {
      const { data: roleRows, error: rErr } = await (supabase as any)
        .from("user_roles")
        .select("user_id, role, is_suspended")
        .in("role", ["admin", "super_admin"]);
      if (rErr) throw rErr;
      const rows = (roleRows ?? []) as { user_id: string; role: "admin" | "super_admin"; is_suspended: boolean }[];

      // Group by user_id (a user may have both admin + super_admin)
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
      const permMap = new Map<string, AdminPermission[]>();
      for (const row of (perms ?? []) as { user_id: string; permission: AdminPermission }[]) {
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

  async function togglePermission(adminUserId: string, perm: AdminPermission, checked: boolean) {
    if (checked) {
      const { error } = await (supabase as any).from("admin_permissions").insert({
        user_id: adminUserId, permission: perm, granted_by: user?.id ?? null,
      });
      if (error) return toast.error(error.message);
      await (supabase as any).rpc("log_admin_action", {
        _action: "admin.permission.grant", _target_type: "user", _target_id: adminUserId,
        _details: { permission: perm },
      });
    } else {
      const { error } = await (supabase as any).from("admin_permissions")
        .delete().eq("user_id", adminUserId).eq("permission", perm);
      if (error) return toast.error(error.message);
      await (supabase as any).rpc("log_admin_action", {
        _action: "admin.permission.revoke", _target_type: "user", _target_id: adminUserId,
        _details: { permission: perm },
      });
    }
    refresh();
  }

  async function toggleSuspend(adminUserId: string, suspend: boolean) {
    const { error } = await (supabase as any)
      .from("user_roles")
      .update({ is_suspended: suspend })
      .eq("user_id", adminUserId)
      .in("role", ["admin", "super_admin"]);
    if (error) return toast.error(error.message);
    await (supabase as any).rpc("log_admin_action", {
      _action: suspend ? "admin.suspend" : "admin.unsuspend",
      _target_type: "user", _target_id: adminUserId,
    });
    toast.success(suspend ? "Admin suspendu" : "Admin réactivé");
    refresh();
  }

  async function removeAdmin(adminUserId: string) {
    if (!confirm("Retirer le rôle admin et toutes ses permissions ? Le compte devient un compte client.")) return;
    // Delete permissions
    await (supabase as any).from("admin_permissions").delete().eq("user_id", adminUserId);
    // Remove admin role
    const { error } = await (supabase as any)
      .from("user_roles").delete()
      .eq("user_id", adminUserId).eq("role", "admin");
    if (error) return toast.error(error.message);
    // Ensure they have acheteur role
    await (supabase as any).from("user_roles")
      .insert({ user_id: adminUserId, role: "acheteur" })
      .select();
    await (supabase as any).rpc("log_admin_action", {
      _action: "admin.remove", _target_type: "user", _target_id: adminUserId,
    });
    toast.success("Admin retiré");
    refresh();
  }

  async function addAdmin() {
    const email = emailToAdd.trim().toLowerCase();
    if (!email) return toast.error("Email requis");
    setAdding(true);
    try {
      const { data: prof } = await supabase
        .from("profiles").select("id, email").eq("email", email).maybeSingle();
      if (!prof) {
        toast.error("Aucun utilisateur trouvé avec cet email. Demandez-lui de créer un compte d'abord.");
        return;
      }
      const { error } = await (supabase as any).from("user_roles")
        .insert({ user_id: prof.id, role: "admin" });
      if (error && !String(error.message).includes("duplicate")) {
        toast.error(error.message);
        return;
      }
      await (supabase as any).rpc("log_admin_action", {
        _action: "admin.create", _target_type: "user", _target_id: prof.id,
        _details: { email },
      });
      toast.success(`${email} est maintenant admin. Configurez ses permissions.`);
      setEmailToAdd("");
      setAddOpen(false);
      refresh();
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Gestion des administrateurs</h1>
          <p className="text-sm text-muted-foreground">Créez et configurez les permissions de chaque admin.</p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="rounded-full">
          <UserPlus className="mr-1 h-4 w-4" /> Ajouter un admin
        </Button>
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list"><ShieldCheck className="mr-1 h-4 w-4" /> Admins</TabsTrigger>
          <TabsTrigger value="log"><History className="mr-1 h-4 w-4" /> Historique</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4 space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : !admins || admins.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun admin pour le moment.</p>
          ) : (
            admins.map((a) => (
              <Card key={a.user_id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="flex items-center gap-2 text-base">
                        {a.role === "super_admin" && <Crown className="h-4 w-4 text-amber-500" />}
                        <span className="truncate">{a.full_name || a.email || "Sans nom"}</span>
                        {a.role === "super_admin" ? (
                          <Badge>Super admin</Badge>
                        ) : (
                          <Badge variant="secondary">Admin</Badge>
                        )}
                        {a.is_suspended && <Badge variant="destructive">Suspendu</Badge>}
                      </CardTitle>
                      <p className="mt-0.5 text-xs text-muted-foreground">{a.email}</p>
                    </div>
                    {a.role !== "super_admin" && (
                      <div className="flex gap-1">
                        <Button
                          size="sm" variant="outline"
                          onClick={() => toggleSuspend(a.user_id, !a.is_suspended)}
                        >
                          {a.is_suspended ? <><Play className="mr-1 h-3 w-3" /> Réactiver</> : <><Pause className="mr-1 h-3 w-3" /> Suspendre</>}
                        </Button>
                        <Button
                          size="sm" variant="outline"
                          className="text-destructive"
                          onClick={() => removeAdmin(a.user_id)}
                        >
                          <Trash2 className="mr-1 h-3 w-3" /> Retirer
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {a.role === "super_admin" ? (
                    <p className="text-xs text-muted-foreground">Le super administrateur a toutes les permissions par défaut.</p>
                  ) : (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Permissions</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {ALL_PERMS.map((perm) => {
                          const checked = a.permissions.includes(perm);
                          return (
                            <label
                              key={perm}
                              className="flex cursor-pointer items-center gap-2 rounded-lg border p-2 hover:bg-accent"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) => togglePermission(a.user_id, perm, !!v)}
                                disabled={a.is_suspended}
                              />
                              <span className="text-sm">{ADMIN_PERMISSION_LABELS[perm]}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
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
