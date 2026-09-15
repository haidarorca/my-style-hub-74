import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("kz-shimmer rounded-[calc(var(--radius)-4px)]", className)}
      {...props}
    />
  );
}

export { Skeleton };
