import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SEASONS, GENDERS, AGE_GROUPS, CARE_INSTRUCTIONS } from "@/lib/clothing-attributes";

interface Props {
  season: string;
  gender: string;
  ageGroup: string;
  careInstructions: string[];
  onSeason: (v: string) => void;
  onGender: (v: string) => void;
  onAgeGroup: (v: string) => void;
  onCareInstructions: (v: string[]) => void;
}

export function ClothingExtraFields({
  season, gender, ageGroup, careInstructions,
  onSeason, onGender, onAgeGroup, onCareInstructions,
}: Props) {
  const toggleCare = (v: string, checked: boolean) => {
    if (checked) onCareInstructions(Array.from(new Set([...careInstructions, v])));
    else onCareInstructions(careInstructions.filter((x) => x !== v));
  };

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div>
        <Label className="text-[11px]">Saison</Label>
        <Select value={season} onValueChange={onSeason}>
          <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            {SEASONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-[11px]">Genre</Label>
        <Select value={gender} onValueChange={onGender}>
          <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            {GENDERS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-[11px]">Tranche d'âge</Label>
        <Select value={ageGroup} onValueChange={onAgeGroup}>
          <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            {AGE_GROUPS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="sm:col-span-3">
        <Label className="text-[11px]">Instructions d'entretien</Label>
        <div className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {CARE_INSTRUCTIONS.map((c) => (
            <label key={c.value} className="flex items-center gap-2 rounded border bg-background p-1.5 text-[11px]">
              <Checkbox
                checked={careInstructions.includes(c.value)}
                onCheckedChange={(v) => toggleCare(c.value, !!v)}
              />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
