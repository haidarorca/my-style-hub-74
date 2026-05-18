import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, Image as ImageIcon, FileText, Loader2, Upload, X } from "lucide-react";
import { generateProductCopy } from "@/lib/admin-generator.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type Result = { name: string; designation: string; description: string };

export function AiCopyGeneratorDialog({
  open,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApply: (r: Result) => void;
}) {
  const generate = useServerFn(generateProductCopy);
  const [mode, setMode] = useState<"image" | "text">("image");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  function fileToDataUrl(f: File): Promise<string> {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(new Error("Lecture image impossible"));
      r.readAsDataURL(f);
    });
  }

  async function run() {
    setLoading(true);
    setResult(null);
    try {
      if (mode === "image") {
        if (!imageFile) {
          toast.error("Ajoutez une image du produit.");
          setLoading(false);
          return;
        }
        const dataUrl = await fileToDataUrl(imageFile);
        const r = await generate({ data: { mode: "image", image_data_url: dataUrl } });
        setResult(r);
      } else {
        if (text.trim().length < 3) {
          toast.error("Décrivez d'abord le produit.");
          setLoading(false);
          return;
        }
        const r = await generate({ data: { mode: "text", description: text } });
        setResult(r);
      }
      toast.success("Proposition prête. Vérifiez puis appliquez.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur IA");
    } finally {
      setLoading(false);
    }
  }

  function apply() {
    if (!result) return;
    onApply(result);
    onOpenChange(false);
    setResult(null);
    setImageFile(null);
    setText("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Générer la fiche produit
          </DialogTitle>
          <DialogDescription>
            L'IA propose un nom, une désignation et une description. Vous pouvez les modifier
            avant de les appliquer au formulaire.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as "image" | "text")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="image" className="gap-1">
              <ImageIcon className="h-4 w-4" /> Avec une image
            </TabsTrigger>
            <TabsTrigger value="text" className="gap-1">
              <FileText className="h-4 w-4" /> Avec une description
            </TabsTrigger>
          </TabsList>

          <TabsContent value="image" className="pt-3">
            {imageFile ? (
              <div className="relative inline-block">
                <img
                  src={URL.createObjectURL(imageFile)}
                  alt=""
                  className="h-40 w-40 rounded border object-cover"
                />
                <button
                  type="button"
                  onClick={() => setImageFile(null)}
                  className="absolute right-1 top-1 rounded-full bg-background/80 p-0.5"
                  aria-label="Retirer"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <label className="flex h-40 w-40 cursor-pointer flex-col items-center justify-center gap-1 rounded border-2 border-dashed text-xs text-muted-foreground hover:bg-accent">
                <Upload className="h-5 w-5" />
                Choisir une image
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </TabsContent>

          <TabsContent value="text" className="space-y-2 pt-3">
            <Label className="text-xs">
              Décrivez librement (matière, couleur, taille, usage, public, détails…)
            </Label>
            <Textarea
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ex. T-shirt en coton bio, col rond, manches courtes, tailles S à XL, idéal été, pour homme."
            />
          </TabsContent>
        </Tabs>

        <Button type="button" onClick={run} disabled={loading} className="w-full gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? "Génération…" : "Générer"}
        </Button>

        {result && (
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <p className="text-[11px] text-muted-foreground">
              Vérifiez et modifiez si besoin, puis appliquez au formulaire.
            </p>
            <div>
              <Label className="text-xs">Nom proposé</Label>
              <Input
                value={result.name}
                onChange={(e) => setResult({ ...result, name: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Désignation</Label>
              <Input
                value={result.designation}
                onChange={(e) => setResult({ ...result, designation: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea
                rows={4}
                value={result.description}
                onChange={(e) => setResult({ ...result, description: e.target.value })}
              />
            </div>
            <Button type="button" onClick={apply} className="w-full">
              Appliquer au formulaire
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
