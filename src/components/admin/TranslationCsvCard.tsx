import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { TRANSLATION_LANGS, TRANSLATION_LANG_CODES } from "@/lib/translation/langs";
import { CSV_FIELDS, CSV_SCOPES, csvHeaders, downloadCsv, parseCsv, toCsv, type CsvMode, type CsvRow, type CsvScope } from "@/lib/translation/csv";
import { csvExportPage, csvImport, csvPending } from "@/lib/translation/csv.functions";

const CHUNK = 200;

/** Export / import de traductions par fichier Excel (CSV) — une colonne par langue, sans limite, 0 crédit IA. */
export function TranslationCsvCard() {
  const pending = useServerFn(csvPending);
  const exportPage = useServerFn(csvExportPage);
  const doImport = useServerFn(csvImport);

  const [langs, setLangs] = useState<string[]>([...TRANSLATION_LANG_CODES]);
  const [scope, setScope] = useState<CsvScope>("products");
  const [mode, setMode] = useState<CsvMode>("missing");
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [progress, setProgress] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: counts } = useQuery({
    queryKey: ["translation-csv-pending", langs[0] ?? "fr"],
    queryFn: () => pending({ data: { lang: (langs[0] ?? "fr") as any } }) as Promise<Record<string, number>>,
  });

  const toggleLang = (c: string) => setLangs((a) => (a.includes(c) ? a.filter((x) => x !== c) : [...a, c]));

  const onExport = async () => {
    if (langs.length === 0) return;
    setBusy("export");
    try {
      const all: CsvRow[] = [];
      let cursor: string | null = null;
      do {
        const page = (await exportPage({ data: { langs: langs as any, scope, mode, cursor } })) as { rows: CsvRow[]; next: string | null };
        all.push(...page.rows);
        cursor = page.next;
        setProgress(`Export en cours… ${all.length.toLocaleString("fr-FR")} lignes`);
      } while (cursor);
      if (all.length === 0) { toast.info("Rien à exporter", { description: "Tout est déjà traduit dans ces langues." }); return; }
      downloadCsv(`kawzone-${scope}-${langs.join("-")}-${all.length}.csv`, toCsv(csvHeaders(scope, langs), all));
      toast.success(`${all.length.toLocaleString("fr-FR")} lignes exportées`, { description: "Remplissez les colonnes de chaque langue puis réimportez le fichier." });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export impossible");
    } finally { setBusy(null); setProgress(""); }
  };

  const onFile = async (file: File) => {
    setBusy("import");
    setProgress("Lecture du fichier…");
    try {
      const rows = parseCsv(await file.text());
      const idCol = scope === "products" ? "product_id" : scope === "variants" ? "src_norm" : "category_id";
      const keys = Object.keys(rows[0] ?? {});
      const hasLang = TRANSLATION_LANG_CODES.some((l) => CSV_FIELDS[scope].some((f) => keys.includes(`${f.prefix}_${l}`)));
      if (rows.length === 0 || !keys.includes(idCol) || !hasLang) {
        toast.error("Fichier incompatible", { description: "Vérifiez que le type de contenu sélectionné correspond au fichier exporté." });
        return;
      }
      let updated = 0, empty = 0, unknown = 0;
      const errors: string[] = [];
      for (let i = 0; i < rows.length; i += CHUNK) {
        setProgress(`Importation ${Math.min(i + CHUNK, rows.length).toLocaleString("fr-FR")} / ${rows.length.toLocaleString("fr-FR")}…`);
        const rep = (await doImport({ data: { scope, rows: rows.slice(i, i + CHUNK) } })) as any;
        updated += rep.updated; empty += rep.empty; unknown += rep.unknown;
        errors.push(...(rep.errors ?? []));
      }
      toast.success(`${updated.toLocaleString("fr-FR")} lignes mises à jour`, {
        description: `${empty} lignes sans changement · ${unknown} non reconnues${errors.length ? ` · erreur : ${errors[0]}` : ""}`,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import impossible");
    } finally { setBusy(null); setProgress(""); }
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Traduire par fichier Excel (0 crédit)</div>
            <div className="text-xs text-muted-foreground">Une colonne par langue, sans limite de lignes.</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {TRANSLATION_LANGS.map((l) => (
            <label key={l.code} className="flex cursor-pointer items-center gap-2 rounded-md border bg-card p-2 text-sm">
              <Checkbox checked={langs.includes(l.code)} onCheckedChange={() => toggleLang(l.code)} />
              <span>{l.flag} {l.code.toUpperCase()}</span>
            </label>
          ))}
        </div>

        <Select value={scope} onValueChange={(v) => setScope(v as CsvScope)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CSV_SCOPES.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}{counts ? ` — ${counts[s.id]?.toLocaleString("fr-FR") ?? 0} à traduire` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={mode} onValueChange={(v) => setMode(v as CsvMode)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="missing">Seulement ce qui manque</SelectItem>
            <SelectItem value="all">Tout le contenu (pour relire/corriger)</SelectItem>
          </SelectContent>
        </Select>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onExport} disabled={busy !== null || langs.length === 0}>
            {busy === "export" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Exporter
          </Button>
          <Button onClick={() => fileRef.current?.click()} disabled={busy !== null}>
            {busy === "import" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Importer
          </Button>
        </div>
        <input
          ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onFile(f); }}
        />

        <p className="text-xs text-muted-foreground">
          {progress || `Astuce Google Sheets : =GOOGLETRANSLATE(D2;"auto";"en") puis étirez. Seules les cellules remplies sont enregistrées ; les traductions importées sont protégées.`}
        </p>
      </CardContent>
    </Card>
  );
}
