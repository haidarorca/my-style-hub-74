/**
 * EmptyState — État vide KawZone : médaillon encre, titre Sora, action discrète.
 * Remplace les "Aucun résultat" répétés dans toutes les pages admin/vendor
 */
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[calc(var(--radius)+4px)] border border-dashed border-border bg-card/60 px-6 py-14 text-center",
        className,
      )}
    >
      <div className="relative mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent">
        <Icon className="h-6 w-6 text-primary" />
        <span className="absolute -bottom-1 h-1.5 w-8 rounded-full bg-[var(--brand)]/70" />
      </div>
      <p className="font-display text-base font-semibold tracking-[-0.02em] text-foreground">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
      {action && (
        <Button size="sm" variant="outline" className="mt-5" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
