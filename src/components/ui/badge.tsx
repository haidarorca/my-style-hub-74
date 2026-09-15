import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-[0.2rem] text-[0.7rem] font-semibold leading-tight tracking-[0.01em] transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40 [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "border-border bg-card text-foreground",
        soft: "border-transparent bg-accent text-accent-foreground",
        brand: "border-transparent bg-[var(--brand)] text-[var(--brand-foreground)]",
        promo: "border-transparent gradient-flash text-[oklch(0.99_0_0)] shadow-soft",
        success: "border-transparent bg-success text-success-foreground",
        muted: "border-transparent bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
