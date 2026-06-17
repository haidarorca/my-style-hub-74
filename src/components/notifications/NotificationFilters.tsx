import { cn } from "@/lib/utils";
import { NotificationType } from "@/hooks/use-notifications";
import { Bell, Eye, ShoppingCart, Store, Package, Settings } from "lucide-react";

const FILTERS: { key: NotificationType; label: string; icon: typeof Bell }[] = [
  { key: "all", label: "Toutes", icon: Bell },
  { key: "unread", label: "Non lues", icon: Eye },
  { key: "order", label: "Commandes", icon: ShoppingCart },
  { key: "vendor", label: "Vendeurs", icon: Store },
  { key: "product", label: "Produits", icon: Package },
  { key: "other", label: "Autres", icon: Settings },
];

interface Props {
  active: NotificationType;
  onChange: (f: NotificationType) => void;
  counts: Record<NotificationType, number>;
}

export function NotificationFilters({ active, onChange, counts }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {FILTERS.map((f) => {
        const Icon = f.icon;
        const count = counts[f.key] ?? 0;
        const isActive = active === f.key;
        return (
          <button
            key={f.key}
            onClick={() => onChange(f.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {f.label}
            {count > 0 && (
              <span
                className={cn(
                  "ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold",
                  isActive ? "bg-primary-foreground text-primary" : "bg-destructive text-destructive-foreground"
                )}
              >
                {count > 99 ? "99+" : count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
