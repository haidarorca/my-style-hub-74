import { type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useAuth, type AdminPermission } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

interface Props {
  perm?: AdminPermission;
  superOnly?: boolean;
  children: ReactNode;
}

export function PermissionGate({ perm, superOnly, children }: Props) {
  const { isSuperAdmin, can, loading } = useAuth();
  if (loading) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  const allowed = superOnly ? isSuperAdmin : perm ? can(perm) : true;
  if (allowed) return <>{children}</>;

  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
      <h2 className="mt-3 text-lg font-bold">Accès refusé</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Vous n'avez pas l'autorisation requise pour accéder à cette section. Contactez le super administrateur si vous pensez qu'il s'agit d'une erreur.
      </p>
      <Button asChild variant="outline" className="mt-4">
        <Link to="/admin">Retour au tableau de bord</Link>
      </Button>
    </div>
  );
}
