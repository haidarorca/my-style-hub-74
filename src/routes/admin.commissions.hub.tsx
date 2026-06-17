import { createFileRoute, Link } from "@tanstack/react-router";
import { Eye, Pencil, Globe2, ChevronRight } from "lucide-react";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { BackButton } from "@/components/layout/BackButton";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/admin/commissions/hub")({
  component: () => <PermissionGate superOnly><Hub /></PermissionGate>,
});

const ITEMS = [
  { to: "/admin/commissions/view", label: "Vue commissions", desc: "Lecture seule : voir comment les commissions sont organisées par paire pays.", icon: Eye },
  { to: "/admin/commissions", label: "Éditeur commissions", desc: "Créer et modifier les règles (paires pays, catégories, produits).", icon: Pencil },
  { to: "/admin/countries", label: "Pays", desc: "Activer / désactiver les pays utilisés dans la matrice.", icon: Globe2 },
] as const;

function Hub() {
  return (
    <div className="space-y-4">
      <BackButton fallbackTo="/admin" label="Retour admin" className="border bg-background shadow-sm" />
      <div>
        <h1 className="text-xl font-bold">Commissions</h1>
        <p className="text-xs text-muted-foreground">Choisissez ce que vous voulez faire.</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ITEMS.map((it) => {
          const Icon = it.icon;
          return (
            <Link key={it.to} to={it.to}>
              <Card className="transition-colors hover:bg-accent">
                <CardContent className="flex items-center gap-3 p-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{it.label}</div>
                    <div className="text-[11px] text-muted-foreground">{it.desc}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
