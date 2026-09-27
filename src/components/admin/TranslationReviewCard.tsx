import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bot, Loader2, Check, SkipForward, X } from "lucide-react";
import { toast } from "sonner";
import { TRANSLATION_LANGS, TRANSLATION_LANG_CODES } from "@/lib/translation/langs";
import { CSV_FIELDS, CSV_SCOPES, type CsvMode, type CsvRow, type CsvScope } from "@/lib/translation/csv";
import { csvImport, freeProposeBatch } from "@/lib/translation/csv.functions";

const ID_COL: Record<CsvScope, string> = { products: "product_id", variants: "src_norm", categories: "category_id" };
const SRC_COL: Record<string, string> = { nom: "nom_source", designation: "designation_source", description: "description_source", traduction: "texte_source" };
const LABEL: Record<string, string> = { nom: "Nom", designation: "Désignation", description: "Description", matiere: "Matière", traduction: "Texte" };

/** Assistant de traduction gratuit : prépare un lot, l'admin relit/corrige, puis valide l'enregistrement. */
export function TranslationReviewCard() {
  const propose = useServerFn(freeProposeBatch);
  const doImport = useServerFn(csvImport);

  const [langs, setLangs] = useState<string[]>(["en", "ar"]);
  const [scope, setScope] = useState<CsvScope>("products");
  const [mode, setMode] = useState<CsvMode>("missing");
  const [overwrite, setOverwrite] = useState(false);
  const [size, setSize] = useState(20);
  const [busy, setBusy] = useState<"prep" | "save" | null>(null);
  const [batch, setBatch] = useState<{ originals: CsvRow[]; rows: CsvRow[]; next: string | null } | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState(0);

  const prepare = async (from: string | null) => {
    if (langs.length === 0) return;
    setBusy("prep");
    try {
      const r = (await propose({ data: { langs: langs as any, scope, mode, overwrite, cursor: from, size } })) as any;
      if (r.rows.length === 0) { toast.info("Plus rien à traduire pour ce choix"); setBatch(null); return; }
      setBatch({ originals: r.originals, rows: r.rows, next: r.next });
      setCursor(from);
      setExcluded(new Set());
      toast.success(`${r.filled} traductions proposées`, { description: r.failed ? `${r.failed} non traduites (à compléter à la main)` : "Relisez avant d'enregistrer." });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Préparation impossible");
    } finally { setBusy(null); }
  };

  const edit = (i: number, key: string, v: string) =>
    setBatch((b) => (b ? { ...b, rows: b.rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)) } : b));

  const save = async () => {
    if (!batch) return;
    setBusy("save");
    try {
      const idCol = ID_COL[scope];
      const cols = CSV_FIELDS[scope].flatMap((f) => langs.map((l) => `${f.prefix}_${l}`));
      // On n'envoie que les cellules réellement changées par rapport à la base.
      const rows = batch.rows.flatMap((r, i) => {
        if (excluded.has(i)) return [];
        const o = batch.originals[i] ?? {};
        const out: CsvRow = { [idCol]: r[idCol], ...(scope === "variants" ? { kind: r.kind } : {}) };
        let any = false;
        for (const c of cols) if ((r[c] ?? "").trim() && (r[c] ?? "") !== (o[c] ?? "")) { out[c] = r[c]; any = true; }
        return any ? [out] : [];
      });
      if (rows.length === 0) { toast.info("Aucun changement à enregistrer"); }
      else {
        const rep = (await doImport({ data: { scope, rows } })) as any;
        setSaved((s) => s + (rep.updated ?? 0));
        toast.success(`${rep.updated} lignes enregistrées`, { description: "Traductions protégées (marquées manuelles)." });
      }
      if (batch.next) await prepare(batch.next); else { setBatch(null); toast.success("Tout est terminé pour ce choix"); }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally { setBusy(null); }
  };

  const fields = CSV_FIELDS[scope].filter((f) => SRC_COL[f.prefix]);

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Bot className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Assistant de traduction gratuit (0 crédit)</div>
            <div className="text-xs text-muted-foreground">Il traduit un lot, vous relisez et corrigez, puis vous validez. Rien n'est enregistré sans votre accord.</div>
          </div>
        </div>

        {!batch && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {TRANSLATION_LANGS.map((l) => (
                <label key={l.code} className="flex cursor-pointer items-center gap-2 rounded-md border bg-card p-2 text-sm">
                  <Checkbox checked={langs.includes(l.code)} onCheckedChange={() => setLangs((a) => (a.includes(l.code) ? a.filter((x) => x !== l.code) : [...a, l.code]))} />
                  <span>{l.flag} {l.code.toUpperCase()}</span>
                </label>
              ))}
            </div>
            <Select value={scope} onValueChange={(v) => setScope(v as CsvScope)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CSV_SCOPES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={mode} onValueChange={(v) => { setMode(v as CsvMode); if (v === "missing") setOverwrite(false); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="missing">Seulement ce qui manque</SelectItem>
                <SelectItem value="all">Tous les articles (même déjà traduits)</SelectItem>
              </SelectContent>
            </Select>
            {mode === "all" && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={overwrite} onCheckedChange={(v) => setOverwrite(!!v)} />
                Retraduire aussi les cellules déjà remplies
              </label>
            )}
            <Select value={String(size)} onValueChange={(v) => setSize(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{[10, 20, 50].map((n) => <SelectItem key={n} value={String(n)}>{n} lignes par lot</SelectItem>)}</SelectContent>
            </Select>
            <Button className="w-full" onClick={() => prepare(null)} disabled={busy !== null || langs.length === 0}>
              {busy === "prep" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
              Préparer un lot
            </Button>
            {saved > 0 && <p className="text-xs text-muted-foreground">{saved} lignes enregistrées pendant cette session.</p>}
          </>
        )}

        {batch && (
          <div className="space-y-3">
            <div className="max-h-[60vh] space-y-2 overflow-y-auto">
              {batch.rows.map((r, i) => (
                <div key={i} className={`space-y-2 rounded-md border bg-card p-2 text-xs ${excluded.has(i) ? "opacity-40" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">{r.categorie ? `${r.categorie} · ` : ""}{r.code || r.kind || ""}</span>
                    <label className="flex shrink-0 items-center gap-1">
                      <Checkbox checked={!excluded.has(i)} onCheckedChange={() => setExcluded((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; })} />
                      Garder
                    </label>
                  </div>
                  {fields.map((f) => {
                    const src = r[SRC_COL[f.prefix]];
                    if (!src?.trim()) return null;
                    return (
                      <div key={f.prefix} className="space-y-1">
                        <div className="text-muted-foreground"><b>{LABEL[f.prefix]} (original) :</b> {src.length > 160 ? `${src.slice(0, 160)}…` : src}</div>
                        {langs.map((l) => (
                          <div key={l} className="flex items-start gap-1">
                            <span className="w-6 shrink-0 pt-1.5 font-semibold uppercase">{l}</span>
                            <textarea
                              dir={l === "ar" ? "rtl" : "ltr"}
                              rows={f.prefix === "description" ? 3 : 1}
                              className="w-full rounded border bg-background px-2 py-1 text-xs"
                              value={r[`${f.prefix}_${l}`] ?? ""}
                              onChange={(e) => edit(i, `${f.prefix}_${l}`, e.target.value)}
                            />
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="ghost" onClick={() => setBatch(null)} disabled={busy !== null}><X className="mr-1 h-4 w-4" />Arrêter</Button>
              <Button variant="outline" onClick={() => batch.next ? prepare(batch.next) : setBatch(null)} disabled={busy !== null}><SkipForward className="mr-1 h-4 w-4" />Passer</Button>
              <Button onClick={save} disabled={busy !== null}>
                {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}Valider
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">« Valider » enregistre les lignes gardées puis prépare le lot suivant. {cursor ? "" : "Premier lot."}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
void TRANSLATION_LANG_CODES;
