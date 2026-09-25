import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { TRANSLATION_LANGS } from "@/lib/translation/langs";
import { CSV_SCOPES, csvHeaders, downloadCsv, parseCsv, toCsv, type CsvScope } from "@/lib/translation/csv";
import { csvExport, csvImport, csvPending } from "@/lib/translation/csv.functions";

const CHUNK = 200;

/** Export / import de traductions par fichier Excel (CSV) — sans aucun crédit IA. */
export function TranslationCsvCard() {
  const pending = useServerFn(csvPending);
  const doExport = useServerFn(csvExport);
  const doImport = useServerFn(csvImport);

  const [lang, setLang] = useState("fr");
  const [scope, setScope] = useState<CsvScope>("products");
  const [size, setSize] = useState("500");
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [progress, setProgress] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: counts } = useQuery({
    queryKey: ["translation-csv-pending", lang],
    queryFn: () => pending({ data: { lang } }) as Promise<Record<string, number>>,
  });

  const langLabel = TRANSLATION_LANGS.find((l) => l.code === lang);

  const onExport = async () => {
    setBusy("export");
    try {
      const rows = (await doExport({ data: { lang, scope, limit: Number(size) } })) as Record<string, string>[];
      if (rows.length === 0) { toast.info("Rien à exporter", { description: "Tout est déjà traduit dans cette langue." }); return; }
      downloadCsv(`kawzone-${scope}-${lang}-${rows.length}.csv`, toCsv(csvHeaders(scope, lang), rows));
      toast.success(`${rows.length} lignes exportées`, { description: "Ouvrez le fichier dans Excel ou Google Sheets, remplissez la colonne de traduction, puis réimportez-le." });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export impossible");
    } finally { setBusy(null); }
  };

  const onFile = async (file: File) => {
    setBusy("import");
    setProgress("Lecture du fichier…");
    try {
      const rows = parseCsv(await file.text());
      const need = csvHeaders(scope, lang);
      const key = need[need.length - 1];
      if (rows.length === 0 || !(key in rows[0])) {
        toast.error("Fichier incompatible", { description: `La colonne « ${key} » est introuvable. Vérifiez la langue et le type de contenu sélectionnés.` });
        return;
      }
      let updated = 0, empty = 0, unknown = 0;
      const errors: string[] = [];
      for (let i = 0; i < rows.length; i += CHUNK) {
        setProgress(`Importation ${Math.min(i + CHUNK, rows.length)} / ${rows.length}…`);
        const rep = (await doImport({ data: { lang, scope, rows: rows.slice(i, i + CHUNK) } })) as any;
        updated += rep.updated; empty += rep.empty; unknown += rep.unknown;
        errors.push(...(rep.errors ?? []));
      }
      toast.success(`${updated} traductions enregistrées`, {
        description: `${empty} lignes vides ignorées · ${unknown} lignes non reconnues${errors.length ? ` · erreur : ${errors[0]}` : ""}`,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import impossible");
    } finally { setBusy(null); setProgress(""); }
  };

  return (
    <Card className="border-emerald-500/30 bg-emerald-500/5">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Traduire par fichier Excel (0 crédit)</div>
            <div className="text-xs text-muted-foreground">Exportez, traduisez dans Excel ou Google Sheets, réimportez.</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Select value={lang} onValueChange={setLang}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TRANSLATION_LANGS.map((l) => <SelectItem key={l.code} value={l.code}>{l.flag} {l.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={size} onValueChange={setSize}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["200", "500", "1000", "2000"].map((n) => <SelectItem key={n} value={n}>Lot de {n}</SelectItem>)}
            </SelectContent>
          </Select>
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

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onExport} disabled={busy !== null}>
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
          {progress || `Astuce : dans Google Sheets, tapez =GOOGLETRANSLATE(D2;"auto";"${lang}") puis étirez la formule. Les traductions importées sont protégées et ne seront jamais réécrites automatiquement (${langLabel?.label}).`}
        </p>
      </CardContent>
    </Card>
  );
}
