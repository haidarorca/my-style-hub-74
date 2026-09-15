import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileArchive, ImageDown, ImageUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  importProductImagesZip,
  exportProductImagesZip,
} from "@/lib/product-images-zip.functions";

interface Props {
  scope: "vendor" | "admin";
  shopId: string;
  /** Optionnel : limite l'export aux produits sélectionnés. */
  productIds?: string[];
}

function downloadBase64(base64: string, fileName: string, mime: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

type Report = Awaited<ReturnType<typeof importProductImagesZip>>;

export function ProductImagesZipCard({ scope, shopId, productIds }: Props) {
  const fnImport = useServerFn(importProductImagesZip);
  const fnExport = useServerFn(exportProductImagesZip);
  const [zip, setZip] = useState<File | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const importMut = useMutation({
    mutationFn: async () => {
      if (!zip) throw new Error("Sélectionnez un fichier ZIP");
      const zipBase64 = await fileToBase64(zip);
      return fnImport({ data: { scope, shopId, zipBase64 } });
    },
    onSuccess: (r) => {
      setReport(r);
      setZip(null);
      if (inputRef.current) inputRef.current.value = "";
      toast.success(`${r.imported} image(s) importée(s) sur ${r.productsTouched} produit(s)`);
    },
    onError: (e: Error) => toast.error(`Import ZIP échoué : ${e.message}`),
  });

  const exportMut = useMutation({
    mutationFn: () => fnExport({ data: { scope, shopId, productIds } }),
    onSuccess: (r) => {
      if (r.images === 0) {
        toast.info("Aucune image à exporter");
        return;
      }
      downloadBase64(r.base64, r.fileName, r.mime);
      toast.success(`${r.images} image(s) de ${r.products} produit(s)`);
    },
    onError: (e: Error) => toast.error(`Export ZIP échoué : ${e.message}`),
  });

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <FileArchive className="h-4 w-4" /> Images produits (ZIP)
      </div>
      <p className="text-xs text-muted-foreground">
        Convention : un dossier par produit nommé avec son <strong>code produit</strong> (ex.{" "}
        <code>PRD-001/PRD-001_01.jpg</code>). Les fichiers à plat <code>PRD-001_01.jpg</code> sont
        aussi acceptés. Le ZIP exporté peut être réimporté tel quel.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium">Importer un ZIP d'images</label>
          <Input
            ref={inputRef}
            type="file"
            accept=".zip"
            onChange={(e) => setZip(e.target.files?.[0] ?? null)}
          />
          <Button
            size="sm"
            className="mt-2 w-full"
            onClick={() => importMut.mutate()}
            disabled={!zip || importMut.isPending}
          >
            {importMut.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <ImageUp className="mr-1 h-4 w-4" />
            )}
            Importer les images
          </Button>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium">
            Exporter les images {productIds?.length ? `(${productIds.length} sélectionné(s))` : "(toute la boutique)"}
          </label>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => exportMut.mutate()}
            disabled={exportMut.isPending}
          >
            {exportMut.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <ImageDown className="mr-1 h-4 w-4" />
            )}
            Télécharger le ZIP
          </Button>
        </div>
      </div>

      {report && (
        <div className="space-y-2 rounded border p-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge className="bg-emerald-600 text-white">Importées : {report.imported}</Badge>
            <Badge variant="outline">Produits : {report.productsTouched}</Badge>
            <Badge variant="outline">Doublons ignorés : {report.skippedDuplicates}</Badge>
            {report.unmatched.length > 0 && (
              <Badge className="bg-amber-600 text-white">
                Produits introuvables : {report.unmatched.length}
              </Badge>
            )}
            {report.ignoredFiles.length > 0 && (
              <Badge variant="outline">Fichiers ignorés : {report.ignoredFiles.length}</Badge>
            )}
            {report.errors.length > 0 && (
              <Badge variant="destructive">Erreurs : {report.errors.length}</Badge>
            )}
          </div>

          {report.unmatched.length > 0 && (
            <div className="max-h-40 overflow-y-auto text-xs text-muted-foreground">
              {report.unmatched.slice(0, 50).map((u, i) => (
                <div key={i}>
                  {u.file} → code « {u.code} » introuvable dans cette boutique
                </div>
              ))}
            </div>
          )}

          {report.errors.length > 0 && (
            <div className="max-h-40 overflow-y-auto text-xs text-destructive">
              {report.errors.slice(0, 50).map((e, i) => (
                <div key={i}>
                  {e.file} : {e.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
