import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Home } from "lucide-react";

const HIDDEN_PREFIXES = ["/admin", "/vendor", "/login", "/signup"];

/**
 * Floating mobile control: Back + Home, always reachable.
 * Sits above the bottom nav. Hidden on auth/admin/vendor (those have their own nav).
 */
export function MobileNavFab() {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (pathname === "/" || HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return null;
  }

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      router.navigate({ to: "/" });
    }
  };

  return (
    <div
      className="fixed left-3 z-40 flex items-center gap-2 md:hidden"
      style={{ bottom: "calc(4.5rem + var(--safe-bottom, 0px))" }}
    >
      <button
        type="button"
        onClick={goBack}
        aria-label="Retour"
        className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/95 text-foreground shadow-card backdrop-blur active:scale-95 transition-transform"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <Link
        to="/"
        aria-label="Accueil"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-pink active:scale-95 transition-transform"
      >
        <Home className="h-5 w-5" />
      </Link>
    </div>
  );
}
