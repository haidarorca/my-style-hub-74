/**
 * SlashCommandMenu - Menu flottant pour les commandes rapides "/"
 * ---------------------------------------------------------------
 * S'affiche quand l'utilisateur tape "/" dans une zone de texte.
 * Permet d'inserer rapidement des modeles de texte predefinis.
 *
 * Usage :
 *   <SlashCommandMenu
 *     items={commands}
 *     onSelect={(cmd) => insertCommand(cmd)}
 *     onClose={closeMenu}
 *   />
 */

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Command, CornerDownLeft } from "lucide-react";
import type { SlashCommand } from "@/hooks/use-slash-commands";

interface SlashCommandMenuProps {
  items: SlashCommand[];
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
  className?: string;
}

export const SlashCommandMenu = React.memo(function SlashCommandMenu({
  items,
  onSelect,
  onClose,
  className,
}: SlashCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Reset la selection quand les items changent
  useEffect(() => {
    setSelectedIndex(0);
  }, [items.length]);

  // Navigation clavier
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => (i + 1) % items.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => (i - 1 + items.length) % items.length);
          break;
        case "Enter":
          e.preventDefault();
          if (items[selectedIndex]) {
            onSelect(items[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [items, selectedIndex, onSelect, onClose]);

  // Scroll vers l'element selectionne
  useEffect(() => {
    const el = itemRefs.current[selectedIndex];
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  // Clic en dehors = fermer
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delai pour eviter la fermeture immediate lors du clic qui ouvre le menu
    const timeout = setTimeout(() => {
      window.addEventListener("mousedown", handler);
    }, 100);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  if (items.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        "z-50 max-h-64 w-72 overflow-y-auto rounded-xl border border-border bg-card shadow-xl",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <Command className="h-3 w-3" />
        Commandes rapides
      </div>
      <div className="py-1">
        {items.map((item, index) => (
          <button
            key={item.id}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            type="button"
            onClick={() => onSelect(item)}
            onMouseEnter={() => setSelectedIndex(index)}
            className={cn(
              "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
              index === selectedIndex
                ? "bg-primary/10 text-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-base">
              {item.icon || "⚡"}
            </span>
            <div className="flex-1 min-w-0">
              <p className="truncate text-xs font-medium text-foreground">
                /{item.id}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {item.label}
              </p>
            </div>
            {index === selectedIndex && (
              <CornerDownLeft className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
});
