/**
 * MobileAdminNav — Menu latéral admin avec navigation rapide
 * Ajoute les boutons "Accueil", "Boutique", "Dashboard" pour éviter
 * la sensation d'être bloqué dans l'espace admin.
 */
import { useState, type ReactNode } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { Menu, X, Home, Store, LayoutDashboard, ChevronRight, Shield, Package, Users, Settings, BarChart3, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavSection {
  label: string;
  items: { label: string; href: string; icon: ReactNode; badge?: number }[];
}

const SECTIONS: NavSection[] = [
  {
    label: "Principal",
    items: [
      { label: "Dashboard", href: "/admin", icon: <LayoutDashboard className="h-4 w-4" /> },
      { label: "Produits", href: "/admin/products", icon: <Package className="h-4 w-4" /> },
      { label: "Imports", href: "/admin/imports", icon: <FileSpreadsheet className="h-4 w-4" /> },
      { label: "Validation", href: "/admin/validation", icon: <Shield className="h-4 w-4" /> },
    ],
  },
  {
    label: "Gestion",
    items: [
      { label: "Commandes", href: "/admin/orders", icon: <BarChart3 className="h-4 w-4" /> },
      { label: "Vendeurs", href: "/admin/vendors", icon: <Users className="h-4 w-4" /> },
      { label: "Paramètres", href: "/admin/settings", icon: <Settings className="h-4 w-4" /> },
    ],
  },
];

export function MobileAdminNav() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const currentPath = router.state.location.pathname;

  return (
    <>
      {/* Bouton hamburger */}
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-40 flex items-center gap-2 bg-background/90 backdrop-blur border rounded-lg px-3 py-2 shadow-sm"
        aria-label="Menu admin"
      >
        <Menu className="h-5 w-5" />
        <span className="text-sm font-medium">Menu</span>
      </button>

      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />

          {/* Drawer */}
          <div className="absolute left-0 top-0 h-full w-[280px] bg-background flex flex-col shadow-xl animate-in slide-in-from-left-200 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <span className="font-semibold text-sm">Administration</span>
              <button onClick={() => setOpen(false)} className="p-1 rounded-md hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Navigation rapide — NE PAS ÊTRE BLOQUÉ */}
            <div className="p-3 border-b bg-muted/30 space-y-1.5">
              <p className="text-[10px] uppercase text-muted-foreground font-medium px-2">Navigation rapide</p>
              <Link
                to="/"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-accent transition-colors"
              >
                <Home className="h-4 w-4 text-primary" />
                <span className="flex-1">Accueil principal</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
              <Link
                to="/products"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-accent transition-colors"
              >
                <Store className="h-4 w-4 text-primary" />
                <span className="flex-1">Retour boutique</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            </div>

            {/* Sections admin */}
            <div className="flex-1 overflow-y-auto py-2 space-y-4">
              {SECTIONS.map(section => (
                <div key={section.label}>
                  <p className="text-[10px] uppercase text-muted-foreground font-medium px-5 mb-1">
                    {section.label}
                  </p>
                  <div className="space-y-0.5 px-2">
                    {section.items.map(item => {
                      const isActive = currentPath === item.href || currentPath.startsWith(item.href + "/");
                      return (
                        <Link
                          key={item.href}
                          to={item.href}
                          onClick={() => setOpen(false)}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                            isActive
                              ? "bg-primary text-primary-foreground font-medium"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted"
                          )}
                        >
                          {item.icon}
                          <span className="flex-1">{item.label}</span>
                          {item.badge ? (
                            <span className="bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 rounded-full">
                              {item.badge}
                            </span>
                          ) : null}
                          <ChevronRight className={cn("h-3.5 w-3.5", isActive ? "opacity-80" : "opacity-40")} />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer — fermer */}
            <div className="p-3 border-t">
              <button
                onClick={() => setOpen(false)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
                Fermer le menu
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
