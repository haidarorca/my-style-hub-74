// Moteur de traduction gratuit (point d'accès public Google Translate, sans clé,
// sans crédit IA). Langue source détectée automatiquement pour chaque texte.
import { CSV_FIELDS, type CsvRow, type CsvScope } from "./csv";

const SOURCE_COL: Record<string, string> = {
  nom: "nom_source", designation: "designation_source", description: "description_source", traduction: "texte_source",
};

export async function freeTranslate(text: string, target: string): Promise<string | null> {
  const t = text.trim();
  if (!t) return null;
  const chunks: string[] = [];
  for (let i = 0; i < t.length; i += 4500) chunks.push(t.slice(i, i + 4500));
  const out: string[] = [];
  for (const q of chunks) {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({ q }).toString(),
    });
    if (res.status === 429) throw new Error("Limite gratuite atteinte pour le moment, réessayez dans quelques minutes");
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const parts = Array.isArray(json?.[0]) ? json[0].map((p: any) => (typeof p?.[0] === "string" ? p[0] : "")).join("") : "";
    if (!parts) return null;
    out.push(parts);
  }
  return out.join("").trim() || null;
}

/** Remplit les cellules cibles (vides, ou toutes si overwrite) et renvoie les propositions sans rien enregistrer. */
export async function proposeRows(scope: CsvScope, rows: CsvRow[], langs: string[], overwrite: boolean) {
  const tasks: Array<() => Promise<void>> = [];
  const proposed = rows.map((r) => ({ ...r }));
  let filled = 0, failed = 0;
  for (const r of proposed) {
    for (const f of CSV_FIELDS[scope]) {
      const src = r[SOURCE_COL[f.prefix] ?? ""];
      if (!src || !src.trim()) continue;
      for (const l of langs) {
        const key = `${f.prefix}_${l}`;
        if (!overwrite && r[key]?.trim()) continue;
        tasks.push(async () => {
          const v = await freeTranslate(src, l);
          if (v) { r[key] = v; filled++; } else failed++;
        });
      }
    }
  }
  for (let i = 0; i < tasks.length; i += 8) await Promise.all(tasks.slice(i, i + 8).map((t) => t()));
  return { rows: proposed, filled, failed };
}
