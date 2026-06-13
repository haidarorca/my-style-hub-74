import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onStay: () => void;
  onLeave: () => void;
}

export function CloseConfirmDialog({ open, onStay, onLeave }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onStay} />
      <div className="relative bg-white rounded-xl shadow-2xl mx-4 w-full max-w-sm p-5 space-y-4">
        <h3 className="text-lg font-bold flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" />Modifications non enregistrees</h3>
        <p className="text-sm text-gray-600">Vous avez des modifications en cours. Si vous quittez, elles seront perdues.</p>
        <div className="flex gap-3 pt-1">
          <Button variant="outline" className="flex-1 h-11 text-sm" onClick={onStay}>Continuer</Button>
          <Button variant="destructive" className="flex-1 h-11 text-sm" onClick={onLeave}>Quitter</Button>
        </div>
      </div>
    </div>
  );
}
