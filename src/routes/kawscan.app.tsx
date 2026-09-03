import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ScanLine } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/kawscan/app")({
  component: KawscanAppLayout,
});

function KawscanAppLayout() {
  const { loading, user } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (loading) {
    return <div className="p-10 text-center text-sm text-muted-foreground">Chargement…</div>;
  }

  if (!user) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <ScanLine className="h-10 w-10 text-primary" />
        <h1 className="text-xl font-semibold">Espace commerçant KawScan</h1>
        <p className="text-sm text-muted-foreground">
          Connectez-vous avec votre compte pour gérer les prix de vos magasins.
        </p>
        <Button asChild>
          <Link to="/login" search={{ redirect: pathname }}>Se connecter</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-30 border-b bg-background">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Link to="/kawscan/app" className="flex items-center gap-2 font-bold">
            <ScanLine className="h-5 w-5 text-primary" />
            KawScan
          </Link>
          <span className="ml-auto text-xs text-muted-foreground">Prix en magasin</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
