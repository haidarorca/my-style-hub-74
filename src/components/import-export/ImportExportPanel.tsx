import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileSpreadsheet, Upload, FileArchive, History, CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  exportProducts,
  downloadTemplate,
  previewImport,
  commitImport,
  listImports,
} from "@/lib/import-export.functions";
import type { PreviewResult } from "@/lib/import-export-schema";

interface Props {
  scope: "vendor" | "admin";
  shopId: string;
}

function downloadBase64(base64: string, fileName: string, mime: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result as string;
      resolve(r.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ImportExportPanel({ scope, shopId }: Props) {
  const qc = useQueryClient();
  const fnExport = useServerFn(exportProducts);
  const fnTemplate = useServerFn(downloadTemplate);
  const fnPreview = useServerFn(previewImport);
  const fnCommit = useServerFn(commitImport);
  const fnHistory = useServerFn(listImports);

  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const excelInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);

  const history = useQuery({
    queryKey: ["product-imports", shopId],
    queryFn: () => fnHistory({ data: { shopId } }),
    staleTime: 30_000,
  });

  const exportMut = useMutation({
    mutationFn: () =>
      fnExport({ data: { scope, shopId, status: "any" } }),
    onSuccess: (r) => {
      downloadBase64(r.base64, r.fileName, r.mime);
      toast.success(`Export : ${r.count} produits`);
    },
    onError: (e: Error) => toast.error(`Export échoué : ${e.message}`),
  });

  const templateMut = useMutation({
    mutationFn: () => fnTemplate({}),
    onSuccess: (r) => {
      downloadBase64(r.base64, r.fileName, r.mime);
      toast.success("Modèle téléchargé");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const previewMut = useMutation({
    mutationFn: async () => {
      if (!excelFile) throw new Error("Sélectionnez un fichier Excel/CSV");
      const fileBase64 = await fileToBase64(excelFile);
      const zipBase64 = zipFile ? await fileToBase64(zipFile) : undefined;
      return fnPreview({
        data: { scope, shopId, fileBase64, fileName: excelFile.name, zipBase64 },
      });
    },
    onSuccess: (r) => {
      setPreview(r);
      toast.success(`Prévisualisation : ${r.summary.totalRows} lignes`);
    },
    onError: (e: Error) => toast.error(`Erreur : ${e.message}`),
  });

  const commitMut = useMutation({
    mutationFn: () => {
      if (!preview) throw new Error("Aucune prévisualisation");
      return fnCommit({ data: { importId: preview.importId } });
    },
    onSuccess: (r) => {
      const ok = r.log.filter((l) => l.ok).length;
      const ko = r.log.length - ok;
      toast.success(`Import terminé : ${ok} OK, ${ko} erreurs`);
      setPreview(null);
      setExcelFile(null);
      setZipFile(null);
      if (excelInput.current) excelInput.current.value = "";
      if (zipInput.current) zipInput.current.value = "";
      qc.invalidateQueries({ queryKey: ["product-imports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const blockingErrors = preview?.errors.filter((e) => e.severity === "error").length ?? 0;

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <FileSpreadsheet className="h-5 w-5" /> Import / Export produits
      </h1>

      {/* Top action cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Download className="h-4 w-4" /> Exporter
          </div>
          <p className="mb-3 text-xs text-muted-foreground">Tous les produits de la boutique.</p>
          <Button size="sm" onClick={() => exportMut.mutate()} disabled={exportMut.isPending} className="w-full">
            {exportMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
            Télécharger Excel
          </Button>
        </Card>

        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <FileSpreadsheet className="h-4 w-4" /> Modèle
          </div>
          <p className="mb-3 text-xs text-muted-foreground">Fichier vide avec exemples.</p>
          <Button size="sm" variant="outline" onClick={() => templateMut.mutate()} disabled={templateMut.isPending} className="w-full">
            {templateMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1 h-4 w-4" />}
            Télécharger modèle
          </Button>
        </Card>

        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4" /> Historique
          </div>
          <p className="text-xs text-muted-foreground">{history.data?.rows.length ?? 0} import(s)</p>
        </Card>
      </div>

      {/* Importer */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Upload className="h-4 w-4" /> Importer un fichier
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium">Excel ou CSV (.xlsx, .csv)</label>
            <Input
              ref={excelInput}
              type="file"
              accept=".xlsx,.csv"
              onChange={(e) => setExcelFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">
              <FileArchive className="mr-1 inline h-3 w-3" /> ZIP d'images (optionnel)
            </label>
            <Input
              ref={zipInput}
              type="file"
              accept=".zip"
              onChange={(e) => setZipFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => previewMut.mutate()} disabled={!excelFile || previewMut.isPending}>
            {previewMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Analyser
          </Button>
          {preview && (
            <Button
              size="sm"
              variant="default"
              onClick={() => commitMut.mutate()}
              disabled={commitMut.isPending || blockingErrors > 0}
            >
              {commitMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
              Confirmer l'import ({preview.summary.totalRows})
            </Button>
          )}
        </div>
      </Card>

      {/* Preview */}
      {preview && (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline">Lignes : {preview.summary.totalRows}</Badge>
            <Badge variant="outline">Parents : {preview.summary.parents}</Badge>
            <Badge variant="outline">Variantes : {preview.summary.variants}</Badge>
            <Badge className="bg-emerald-600 text-white">Création : {preview.summary.toCreate}</Badge>
            <Badge className="bg-blue-600 text-white">MAJ : {preview.summary.toUpdate}</Badge>
            <Badge className="bg-amber-600 text-white">Suppression : {preview.summary.toDelete}</Badge>
            {preview.summary.errors > 0 && (
              <Badge variant="destructive">
                <XCircle className="mr-1 h-3 w-3" /> Erreurs : {preview.summary.errors}
              </Badge>
            )}
            {preview.summary.warnings > 0 && (
              <Badge className="bg-yellow-500 text-white">
                <AlertTriangle className="mr-1 h-3 w-3" /> Avertissements : {preview.summary.warnings}
              </Badge>
            )}
          </div>

          {preview.errors.length > 0 && (
            <div className="max-h-64 overflow-y-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ligne</TableHead>
                    <TableHead>Champ</TableHead>
                    <TableHead>Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.errors.slice(0, 100).map((e, i) => (
                    <TableRow key={i} className={e.severity === "error" ? "bg-destructive/10" : "bg-amber-50"}>
                      <TableCell className="font-mono text-xs">{e.row}</TableCell>
                      <TableCell className="text-xs">{e.field ?? "—"}</TableCell>
                      <TableCell className="text-xs">{e.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {preview.imageIds.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Images : {preview.imageIds.filter((i) => i.resolved).length}/{preview.imageIds.length} résolues
            </div>
          )}
        </Card>
      )}

      {/* History */}
      {history.data && history.data.rows.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4" /> Historique récent
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fichier</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.data.rows.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{r.file_name}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "committed" ? "default" : "outline"}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
