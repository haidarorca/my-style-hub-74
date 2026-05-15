import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useIsMobile } from "@/hooks/use-mobile";

const TABS = ["/", "/categories", "/search", "/cart", "/account"] as const;

function getActiveIndex(pathname: string): number {
  if (pathname === "/") return 0;
  for (let i = TABS.length - 1; i >= 1; i--) {
    if (pathname === TABS[i] || pathname.startsWith(TABS[i] + "/")) return i;
  }
  return -1;
}

function hasHorizontalScrollableAncestor(el: HTMLElement | null, root: HTMLElement): boolean {
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    const style = window.getComputedStyle(node);
    const overflowX = style.overflowX;
    if ((overflowX === "auto" || overflowX === "scroll") && node.scrollWidth > node.clientWidth + 2) {
      return true;
    }
    // Native sliders / carousels often use these
    if (node.getAttribute("role") === "slider") return true;
    if (node.dataset?.noSwipeNav === "true") return true;
    node = node.parentElement;
  }
  return false;
}

export function SwipeNavigator({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const stateRef = useRef({
    startX: 0,
    startY: 0,
    tracking: false,
    decided: false,
    horizontal: false,
    activeIndex: -1,
  });

  useEffect(() => {
    if (!isMobile) return;
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const idx = getActiveIndex(pathname);
      if (idx === -1) return;
      const t = e.touches[0];
      const target = e.target as HTMLElement;
      if (hasHorizontalScrollableAncestor(target, el)) return;
      stateRef.current = {
        startX: t.clientX,
        startY: t.clientY,
        tracking: true,
        decided: false,
        horizontal: false,
        activeIndex: idx,
      };
    };

    const onTouchMove = (e: TouchEvent) => {
      const s = stateRef.current;
      if (!s.tracking) return;
      const t = e.touches[0];
      const dx = t.clientX - s.startX;
      const dy = t.clientY - s.startY;
      if (!s.decided) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        s.decided = true;
        s.horizontal = Math.abs(dx) > Math.abs(dy) * 1.4;
        if (!s.horizontal) {
          s.tracking = false;
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      const s = stateRef.current;
      if (!s.tracking || !s.horizontal) {
        s.tracking = false;
        return;
      }
      const t = e.changedTouches[0];
      const dx = t.clientX - s.startX;
      const dy = t.clientY - s.startY;
      s.tracking = false;
      const absX = Math.abs(dx);
      if (absX < 60 || Math.abs(dy) > absX) return;
      const dir = dx < 0 ? 1 : -1;
      const next = s.activeIndex + dir;
      if (next < 0 || next >= TABS.length) return;
      navigate({ to: TABS[next] });
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [isMobile, pathname, navigate]);

  return (
    <div ref={containerRef} className="contents">
      <div key={pathname} className="md:contents animate-fade-in">
        {children}
      </div>
      {!isMobile && null}
    </div>
  );
}
