import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "super_admin" | "admin" | "vendeur" | "acheteur";

export type AdminPermission =
  | "orders"
  | "products"
  | "product_validation"
  | "categories"
  | "vendors"
  | "customers"
  | "support"
  | "settings"
  | "commissions";

export const ADMIN_PERMISSION_LABELS: Record<AdminPermission, string> = {
  orders: "Commandes",
  products: "Produits",
  product_validation: "Validation des produits",
  categories: "Catégories",
  vendors: "Vendeurs",
  customers: "Clients",
  support: "Support (avis & signalements)",
  settings: "Paramètres du site",
  commissions: "Commissions (lecture seule)",
};

export interface ProfileData {
  id: string;
  full_name: string | null;
  sex: "homme" | "femme" | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  shop_name: string | null;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: ProfileData | null;
  roles: AppRole[];
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isVendor: boolean;
  isSuspended: boolean;
  isEmailVerified: boolean;
  permissions: AdminPermission[];
  can: (perm: AdminPermission) => boolean;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isSuspended, setIsSuspended] = useState(false);
  const [permissions, setPermissions] = useState<AdminPermission[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProfileAndRoles = async (userId: string) => {
    const [{ data: prof }, { data: roleRows }, { data: permRows }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      (supabase as any).from("user_roles").select("role, is_suspended").eq("user_id", userId),
      (supabase as any).from("admin_permissions").select("permission").eq("user_id", userId),
    ]);
    setProfile((prof as ProfileData) ?? null);
    const rRows = (roleRows ?? []) as { role: AppRole; is_suspended: boolean }[];
    setRoles(rRows.map((r) => r.role));
    // Suspended if any admin/super_admin role is suspended
    setIsSuspended(rRows.some((r) => (r.role === "admin" || r.role === "super_admin") && r.is_suspended));
    setPermissions(((permRows ?? []) as { permission: AdminPermission }[]).map((p) => p.permission));
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        setTimeout(() => { void loadProfileAndRoles(newSession.user.id); }, 0);
      } else {
        setProfile(null);
        setRoles([]);
        setPermissions([]);
        setIsSuspended(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      setUser(existing?.user ?? null);
      if (existing?.user) {
        void loadProfileAndRoles(existing.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const refreshProfile = async () => {
    if (user) await loadProfileAndRoles(user.id);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const isSuperAdmin = roles.includes("super_admin") && !isSuspended;
  const isAdmin = (roles.includes("admin") || roles.includes("super_admin")) && !isSuspended;
  const isEmailVerified = !!user?.email_confirmed_at;

  const can = (perm: AdminPermission) => {
    if (isSuspended) return false;
    if (isSuperAdmin) return true;
    return permissions.includes(perm);
  };

  const value: AuthContextValue = {
    session,
    user,
    profile,
    roles,
    isAdmin,
    isSuperAdmin,
    isVendor: roles.includes("vendeur"),
    isSuspended,
    isEmailVerified,
    permissions,
    can,
    loading,
    refreshProfile,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
