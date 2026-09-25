// Utilitaires CSV (compatibles Excel / Google Sheets) — code neutre, utilisable
// côté navigateur comme côté serveur.

export type CsvRow = Record<string, string>;

/** Génère un CSV séparé par « ; » avec BOM UTF-8 (Excel français l'ouvre en colonnes). */
export function toCsv(headers: string[], rows: CsvRow[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(";"), ...rows.map((r) => headers.map((h) => esc(r[h])).join(";"))];
  return "\uFEFF" + lines.join("\r\n");
}

/** Lit un CSV « ; » ou « , » (guillemets et sauts de ligne gérés). */
export function parseCsv(text: string): CsvRow[] {
  const src = text.replace(/^\uFEFF/, "");
  const head = src.slice(0, src.indexOf("\n") === -1 ? src.length : src.indexOf("\n"));
  const sep = (head.match(/;/g)?.length ?? 0) >= (head.match(/,/g)?.length ?? 0) ? ";" : ",";

  const table: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === sep) { row.push(cell); cell = ""; continue; }
    if (c === "\n") { row.push(cell); table.push(row); row = []; cell = ""; continue; }
    if (c === "\r") continue;
    cell += c;
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); table.push(row); }

  const headers = (table.shift() ?? []).map((h) => h.trim());
  return table
    .filter((r) => r.some((v) => v.trim() !== ""))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])) as CsvRow);
}

/** Déclenche le téléchargement du fichier dans le navigateur. */
export function downloadCsv(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const CSV_SCOPES = [
  { id: "products", label: "Produits (nom, désignation, description, matière)" },
  { id: "variants", label: "Attributs & variantes (couleurs, tailles, options)" },
  { id: "categories", label: "Catégories" },
] as const;

export type CsvScope = (typeof CSV_SCOPES)[number]["id"];
export const CSV_SCOPE_IDS = CSV_SCOPES.map((s) => s.id) as CsvScope[];

/** Colonnes attendues par langue (identiques à l'export et à l'import). */
export function csvHeaders(scope: CsvScope, lang: string): string[] {
  if (scope === "products") {
    return ["product_id", "code", "langue_source", "nom_source", "designation_source", "description_source",
      `nom_${lang}`, `designation_${lang}`, `description_${lang}`, `matiere_${lang}`];
  }
  if (scope === "variants") return ["kind", "src_norm", "texte_source", `traduction_${lang}`];
  return ["category_id", "nom_source", `nom_${lang}`];
}
