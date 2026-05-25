import { useState } from "react";
import { X, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const PRESETS: Record<string, string> = {
  "Vetements": "Variantes = tailles (S,M,L,XL). Couleurs = variantes achetables. Nom court pro. Prix finissant par 900/990 FCFA.",
  "Jouets": "Variantes = quantites (40p,80p,160p). Pas de variantes couleur si multicolore fixe. Nom commence par 'Jouet'. Description bienfaits educatifs.",
  "Electronique": "Variantes = capacites/couleurs. Description technique precise. Mentionne garantie. Prix exacts FCFA.",
  "Dropshipping": "Nom accrocheur. Description TikTok/Instagram avec emojis. Prix psychologiques (990). Marge 40%.",
  "Senegal": "Prix FCFA uniquement. Francais simple. Mentionne 'Livraison partout au Senegal'. Categories existantes uniquement.",
};

const LS_KEY = "kawzone_vi_presets";

interface Props {
  instructions: string;
  onChange: (v: string) => void;
}

export default function InstructionsPanel({ instructions, onChange }: Props) {
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState<Record<string, string>>(() => {
    try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
  });
  const [name, setName] = useState("");

  const save = () => {
    if (!name.trim() || !instructions.trim()) return;
    const updated = { ...saved, [name.trim()]: instructions.trim() };
    setSaved(updated);
    localStorage.setItem(LS_KEY, JSON.stringify(updated));
    setName("");
    toast.success(`Modele "${name.trim()}" sauvegarde`);
  };

  const del = (n: string) => {
    const updated = { ...saved };
    delete updated[n];
    setSaved(updated);
    localStorage.setItem(LS_KEY, JSON.stringify(updated));
  };

  return (
    <div className="space-y-2">
      <button onClick={() => setShow(!show)} className="flex items-center gap-1.5 text-[11px] font-medium text-primary hover:underline">
        <Sparkles className="h-3.5 w-3.5" />
        {show ? "Masquer instructions IA" : "Instructions IA (guider l'analyse)"}
        {instructions.trim() && <Badge variant="secondary" className="text-[9px] h-4 px-1">Active</Badge>}
      </button>
      {show && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase text-muted-foreground">Modeles rapides</Label>
            <div className="flex flex-wrap gap-1">
              {Object.entries(PRESETS).map(([k, v]) => (
                <button key={k} onClick={() => onChange(v)} className="text-[9px] px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20">
                  {k}
                </button>
              ))}
              {Object.keys(saved).length > 0 && Object.keys(saved).map(k => (
                <div key={k} className="flex items-center gap-0.5">
                  <button onClick={() => onChange(saved[k])} className="text-[9px] px-2 py-1 rounded-full bg-secondary text-secondary-foreground border hover:bg-secondary/80">
                    {k}
                  </button>
                  <button onClick={() => del(k)} className="text-destructive hover:bg-destructive/10 rounded p-0.5"><X className="h-2.5 w-2.5" /></button>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Vos instructions</Label>
            <Textarea value={instructions} onChange={e => onChange(e.target.value)} rows={4}
              placeholder={"Ex: Variantes = quantites 40p/80p/160p. Pas de variantes couleur. Prix finissant par 990."}
              className="text-xs resize-y" />
          </div>
          <div className="flex gap-2">
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nom du modele..." className="h-7 text-xs flex-1" />
            <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={save} disabled={!name.trim() || !instructions.trim()}>
              <Save className="h-3 w-3 mr-1" /> Sauver
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
