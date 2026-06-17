import { useEffect, useState } from "react";

/**
 * Returns true when the user is scrolling down past `threshold`,
 * false when at top or scrolling up. Used to auto-hide sticky headers
 * to free up screen space on mobile.
 */
export function useHideOnScroll(threshold = 80) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const diff = y - lastY;
        if (y < threshold) {
          setHidden(false);
        } else if (diff > 4) {
          setHidden(true);
        } else if (diff < -4) {
          setHidden(false);
        }
        lastY = y;
        ticking = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return hidden;
}
