// ============================================================
// ViewLoadMenu — KawZone Studio
// Phase 2 : Menu des vues sauvegardées
// ============================================================

import { FolderOpen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface StudioViewItem {
  id: string;
  name: string;
  description: string | null;
  template_key: string;
}

interface ViewLoadMenuProps {
  views: StudioViewItem[];
  onLoad: (view: StudioViewItem) => void;
  onDelete: (id: string) => void;
  disabled?: boolean;
}

export function ViewLoadMenu({ views, onLoad, onDelete, disabled }: ViewLoadMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled || views.length === 0}>
          <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
          Mes vues
          {views.length > 0 && (
            <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0 text-[10px] font-medium">
              {views.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {views.length === 0 ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            Aucune vue sauvegardée
          </div>
        ) : (
          views.map((view) => (
            <DropdownMenuItem
              key={view.id}
              onClick={() => onLoad(view)}
              className="flex items-center justify-between cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{view.name}</div>
                {view.description && (
                  <div className="text-xs text-muted-foreground truncate">{view.description}</div>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(view.id);
                }}
                className="ml-2 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
