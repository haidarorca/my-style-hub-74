import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Sections de réglages KawZone : un titre "eyebrow" discret + un groupe de
 * lignes d'action dans un seul conteneur, au lieu d'une carte par fonction.
 */
export function SettingsSection({
  title,
  action,
  className,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("mt-7 first:mt-0", className)}>
      <div className="mb-2 flex items-end justify-between gap-3 px-0.5">
        <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {title}
        </h2>
        {action}
      </div>
      <div className="overflow-hidden rounded-[calc(var(--radius)+4px)] border border-border bg-card divide-y divide-border/70">
        {children}
      </div>
    </section>
  );
}

type RowBase = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  trailing?: React.ReactNode;
  highlight?: boolean;
};

function RowInner({ icon, title, description, trailing, chevron }: RowBase & { chevron?: boolean }) {
  return (
    <>
      {icon && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)]/10 text-[var(--brand)] [&_svg]:h-[1.05rem] [&_svg]:w-[1.05rem]">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 text-start">
        <span className="block truncate text-[0.9375rem] font-semibold leading-tight text-foreground">
          {title}
        </span>
        {description && (
          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{description}</span>
        )}
      </span>
      {trailing}
      {chevron && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />}
    </>
  );
}

const rowCls =
  "flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-accent/60 active:bg-accent";

export function SettingsLinkRow({
  to,
  ...row
}: RowBase & { to: string }) {
  return (
    <Link to={to} className={cn(rowCls, row.highlight && "bg-[var(--brand)]/5")}>
      <RowInner {...row} chevron />
    </Link>
  );
}

export function SettingsButtonRow({
  onClick,
  ...row
}: RowBase & { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={rowCls}>
      <RowInner {...row} chevron />
    </button>
  );
}

/** Ligne non cliquable qui héberge un contrôle (select, bouton, formulaire…). */
export function SettingsPanel({
  icon,
  title,
  description,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="px-3.5 py-3">
      <div className="flex items-start gap-3">
        {icon && (
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)]/10 text-[var(--brand)] [&_svg]:h-[1.05rem] [&_svg]:w-[1.05rem]">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] font-semibold leading-tight">{title}</p>
          {description && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
