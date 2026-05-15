import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Home } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";

const HIDDEN_PREFIXES = ["/admin", "/vendor", "/login", "/signup"];

/**
 * Floating mobile control: Back + Home, always reachable.
 * Sits above the bottom nav. Hidden on auth/admin/vendor (those have their own nav).
 */
export function MobileNavFab() {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { t, dir } = useI18n();

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
      className={`fixed z-40 flex items-center gap-2 md:hidden ${dir === "rtl" ? "right-3" : "left-3"}`}
      style={{ bottom: "calc(4.5rem + var(--safe-bottom, 0px))" }}
    >
      <button
        type="button"
        onClick={goBack}
        aria-label={t("common.back")}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/95 text-foreground shadow-card backdrop-blur active:scale-95 transition-transform"
      >
        <ArrowLeft className={`h-5 w-5 ${dir === "rtl" ? "rotate-180" : ""}`} />
      </button>
      <Link
        to="/"
        aria-label={t("nav.home")}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-pink active:scale-95 transition-transform"
      >
        <Home className="h-5 w-5" />
      </Link>
    </div>
  );
}
