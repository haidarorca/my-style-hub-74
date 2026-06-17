/**
 * DrawerPanel — Panel latéral slide-in depuis la droite
 * Remplace les pages de détail. Contexte visible derrière.
 */
import { useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DrawerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  width?: string;
}

export function DrawerPanel({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  className,
  width = "480px",
}: DrawerPanelProps) {
  // ESC to close
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50" aria-modal="true" role="dialog">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[4px] transition-opacity duration-300"
        onClick={onClose}
        style={{ animation: "fadeIn 0.3s ease forwards" }}
      />

      {/* Panel */}
      <div
        className={cn(
          "absolute right-0 top-0 h-full glass-strong border-l border-border",
          "flex flex-col overflow-hidden",
          "drawer-enter",
          className,
        )}
        style={{ width: `min(${width}, 100vw)` }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            {title && <div className="text-lg font-semibold font-semibold">{title}</div>}
            {subtitle && <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            className="btn-premium flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
