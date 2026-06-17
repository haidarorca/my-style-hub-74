/**
 * AdminTabs — Composant tabs admin optimisé mobile
 * Remplace TabsList shadcn/ui pour une UX fluide sur téléphone
 * Desktop : tabs standards | Mobile : scroll horizontal snap
 */
import { createContext, useContext, useState, useRef, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AdminTabsContextValue {
  active: string;
  setActive: (v: string) => void;
}

const Ctx = createContext<AdminTabsContextValue>({ active: "", setActive: () => {} });

/** Root — fournit le contexte */
export function AdminTabs({ value, onValueChange, children, className }: {
  value: string;
  onValueChange: (v: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Ctx.Provider value={{ active: value, setActive: onValueChange }}>
      <div className={cn("space-y-3", className)}>{children}</div>
    </Ctx.Provider>
  );
}

/** Barre d'onglets — scroll fluide mobile */
export function AdminTabList({ children, className }: { children: ReactNode; className?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeft(el.scrollLeft > 10);
    setShowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10);
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, []);

  return (
    <div className={cn("relative", className)}>
      {/* Fade left */}
      {showLeft && (
        <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none lg:hidden" />
      )}
      {/* Fade right */}
      {showRight && (
        <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none lg:hidden" />
      )}

      <div
        ref={scrollRef}
        className="flex gap-1 p-1 bg-muted/50 rounded-xl overflow-x-auto scrollbar-hide snap-x snap-mandatory"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {children}
      </div>
    </div>
  );
}

/** Onglet individuel */
export function AdminTabTrigger({ value, children, className }: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const { active, setActive } = useContext(Ctx);
  const isActive = active === value;

  return (
    <button
      onClick={() => setActive(value)}
      className={cn(
        "snap-start flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all select-none",
        "min-h-[44px]", // Touch target minimum
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        isActive
          ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/70",
        className
      )}
    >
      {children}
    </button>
  );
}

/** Contenu d'un onglet */
export function AdminTabContent({ value, children, className }: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const { active } = useContext(Ctx);
  if (active !== value) return null;
  return <div className={cn("animate-in fade-in-50 duration-200", className)}>{children}</div>;
}
