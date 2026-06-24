// ============================================================
// ViewSaveDialog — KawZone Studio
// Phase 2 : Sauvegarde d'une vue
// ============================================================

import { useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ViewSaveDialogProps {
  onSave: (name: string, description: string) => void;
  disabled?: boolean;
}

export function ViewSaveDialog({ onSave, disabled }: ViewSaveDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(name.trim(), description.trim());
    setName("");
    setDescription("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Save className="h-3.5 w-3.5 mr-1.5" />
          Sauvegarder la vue
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Sauvegarder la vue</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="view-name">Nom</Label>
            <Input
              id="view-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Articles vendus juin 2026"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="view-desc">Description (optionnelle)</Label>
            <Textarea
              id="view-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description de cette vue..."
              rows={3}
            />
          </div>
          <Button onClick={handleSave} disabled={!name.trim()} className="w-full">
            Sauvegarder
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
