import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-[calc(var(--radius)-2px)] border border-input bg-card px-3.5 py-2 text-base text-foreground shadow-none outline-none transition-[border-color,box-shadow,background] duration-200 file:border-0 file:bg-transparent file:text-sm file:font-semibold file:text-foreground placeholder:text-muted-foreground/80 hover:border-border focus-visible:border-primary/60 focus-visible:ring-4 focus-visible:ring-primary/12 disabled:cursor-not-allowed disabled:bg-muted/60 disabled:opacity-60 md:h-10 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
