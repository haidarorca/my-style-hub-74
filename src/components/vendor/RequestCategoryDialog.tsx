import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lightbulb } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Cat = { id: string; name: string; level: number; parent_id: string | null };

export function RequestCategoryDialog() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<"1" | "2" | "3">("1");
  const [name, setName] = useState("");
  const [parent1, setParent1] = useState<string>("");
  const [parent2, setParent2] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const { data: cats } = useQuery({
    queryKey: ["cat-req", "all-cats"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("categories").select("id, name, level, parent_id").order("position");
      return (data ?? []) as Cat[];
    },
  });

  const l1 = (cats ?? []).filter((c) => c.level === 1);
  const l2 = (cats ?? []).filter((c) => c.level === 2 && c.parent_id === parent1);

  const reset = () => {
    setLevel("1"); setName(""); setParent1(""); setParent2("");
  };

  async function submit() {
    if (!user) return;
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 80) {
      toast.error("Le nom doit faire entre 2 et 80 caractères.");
      return;
    }
    const lvl = Number(level) as 1 | 2 | 3;
    let parent_id: string | null = null;
    if (lvl === 2) {
      if (!parent1) return toast.error("Choisissez la catégorie parente.");
      parent_id = parent1;
    }
    if (lvl === 3) {
      if (!parent1) return toast.error("Choisissez la catégorie parente.");
      if (!parent2) return toast.error("Choisissez la sous-catégorie parente.");
      parent_id = parent2;
    }

    setBusy(true);
    try {
      const { error } = await supabase.from("category_requests").insert({
        vendor_id: user.id,
        level: lvl,
        name: trimmed,
        parent_id,
      });
      if (error) throw error;
      toast.success("Demande envoyée. Un admin la validera bientôt.");
      qc.invalidateQueries({ queryKey: ["my-cat-requests"] });
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'envoi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="w-full">
          <Lightbulb className="mr-1.5 h-4 w-4" /> Demander une nouvelle catégorie
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Proposer une catégorie</DialogTitle>
          <DialogDescription className="text-xs">
            Votre demande sera examinée par un admin. Vous pourrez utiliser la catégorie une fois acceptée.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Type</Label>
            <Select value={level} onValueChange={(v) => { setLevel(v as "1" | "2" | "3"); setParent1(""); setParent2(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Rayon</SelectItem>
                <SelectItem value="2">Catégorie</SelectItem>
                <SelectItem value="3">Sous-catégorie</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(level === "2" || level === "3") && (
            <div>
              <Label>Rayon parent</Label>
              <Select value={parent1} onValueChange={(v) => { setParent1(v); setParent2(""); }}>
                <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>
                  {l1.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {level === "3" && parent1 && (
            <div>
              <Label>Catégorie parente</Label>
              <Select value={parent2} onValueChange={setParent2}>
                <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>
                  {l2.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Nom proposé</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ex. Sacs en cuir" />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
          <Button type="button" onClick={submit} disabled={busy}>
            {busy ? "Envoi…" : "Envoyer la demande"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
