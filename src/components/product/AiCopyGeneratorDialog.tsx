/**
 * AiCopyGeneratorDialog v2 - Generateur IA de fiche produit
 * ----------------------------------------------------------
 * Ameliorations par rapport a la v1 :
 *   - Jusqu'a 10 images (au lieu de 1)
 *   - Mode combine : images + texte/notice simultanes
 *   - Compression automatique des images avant envoi
 *   - Slash commands (/) dans la zone de texte
 *   - Preview des images avec suppression individuelle
 *   - Compteur d'images
 *   - Interface plus moderne et responsive
 *
 * Props :
 *   - open: boolean
 *   - onOpenChange: (v: boolean) => void
 *   - onApply: (result: { name, designation, description }) => void
 *   - title?: string (titre personnalise)
 */

import { useState, useCallback, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Sparkles,
  Image as ImageIcon,
  FileText,
  Layers,
  Loader2,
  Upload,
  X,
  Trash2,
  Wand2,
  Zap,
  Camera,
} from "lucide-react";
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
import { cn } from "@/lib/utils";
import { useImageCompression } from "@/hooks/use-image-compression";
import {
  useSlashCommands,
  DEFAULT_PRODUCT_COMMANDS,
} from "@/hooks/use-slash-commands";
import { SlashCommandMenu } from "@/components/ai/SlashCommandMenu";

type Result = { name: string; designation: string; description: string };
type Mode = "image" | "text" | "combined";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApply: (r: Result) => void;
  title?: string;
}

const MAX_IMAGES = 5; // Limite pour eviter les requetes trop lourdes

export function AiCopyGeneratorDialog({
  open,
  onOpenChange,
  onApply,
  title = "Generer la fiche produit avec l'IA",
}: Props) {
  const generate = useServerFn(generateProductCopy);
  const { compressMultiple } = useImageCompression();
  const [mode, setMode] = useState<Mode>("combined");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  // Slash commands
  const {
    registerCommands,
    handleInput: handleSlashInput,
    insertCommand,
    menuOpen: slashMenuOpen,
    menuItems: slashMenuItems,
    closeMenu: closeSlashMenu,
  } = useSlashCommands();

  // Enregistrer les commandes par defaut
  useState(() => {
    registerCommands(DEFAULT_PRODUCT_COMMANDS);
  });

  // Convertir des fichiers en data URLs
  const filesToDataUrls = useCallback(
    async (files: File[]): Promise<string[]> => {
      // Compression agressive pour l'envoi IA (les images ne sont pas stockees, juste analysees)
      toast.info("Optimisation des images pour l'IA...");
      const compressed = await compressMultiple(files, {
        maxWidth: 800,        // Reduit pour limiter la taille de la requete
        maxHeight: 800,
        quality: 0.6,         // Qualite suffisante pour l'analyse IA
        maxSizeMB: 1,         // Max 1MB par image apres compression
        outputType: "image/jpeg",
      });

      const dataUrls: string[] = [];
      for (const file of compressed) {
        const reader = new FileReader();
        const promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Lecture image impossible"));
        });
        reader.readAsDataURL(file);
        dataUrls.push(await promise);
      }
      return dataUrls;
    },
    [compressMultiple],
  );

  // Ajouter des images
  const handleImageSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length === 0) return;

      const remainingSlots = MAX_IMAGES - imageFiles.length;
      if (remainingSlots <= 0) {
        toast.error(`Maximum ${MAX_IMAGES} images.`);
        return;
      }

      const toAdd = files.slice(0, remainingSlots);
      if (files.length > remainingSlots) {
        toast.info(`${remainingSlots} images ajoutees (max ${MAX_IMAGES}).`);
      }

      setImageFiles((prev) => [...prev, ...toAdd]);

      // Reset l'input
      e.target.value = "";
    },
    [imageFiles.length],
  );

  // Supprimer une image
  const removeImage = useCallback((index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Supprimer toutes les images
  const clearAllImages = useCallback(() => {
    setImageFiles([]);
  }, []);

  // Lancer la generation
  const run = async () => {
    setLoading(true);
    setResult(null);

    try {
      // Determiner le mode reel
      const hasImages = imageFiles.length > 0;
      const hasText = text.trim().length > 0;

      if (!hasImages && !hasText) {
        toast.error("Ajoutez au moins une image ou un texte.");
        setLoading(false);
        return;
      }

      // Convertir les images en data URLs
      let imageDataUrls: string[] | undefined;
      if (hasImages) {
        imageDataUrls = await filesToDataUrls(imageFiles);

        // Verifier la taille totale des data URLs (limite ~20MB pour la requete)
        const totalSize = imageDataUrls.reduce((sum, url) => sum + url.length, 0);
        if (totalSize > 20 * 1024 * 1024) {
          toast.error("Images trop lourdes. Essayez avec moins d'images ou utilisez uniquement le texte.");
          setLoading(false);
          return;
        }
      }

      const actualMode = hasImages && hasText ? "combined" : hasImages ? "image" : "text";

      // Envoyer la requete au serveur
      const r = await generate({
        data: {
          mode: actualMode as "image" | "text" | "combined",
          image_data_urls: imageDataUrls,
          description: hasText ? text : undefined,
        },
      });

      setResult(r);
      toast.success("Proposition prete ! Verifiez et appliquez.");
    } catch (err: any) {
      console.error("[AiCopyGenerator] Erreur:", err);

      // Message d'erreur specifique selon le type d'erreur
      if (err.message?.includes("Failed to fetch")) {
        toast.error("La requete est trop lourde. Essayez avec moins d'images ou utilisez uniquement le texte.");
      } else if (err.message?.includes("Limite IA")) {
        toast.error(err.message);
      } else if (err.message?.includes("Crédits")) {
        toast.error(err.message);
      } else {
        toast.error(err instanceof Error ? err.message : "Erreur IA. Reessayez.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Appliquer le resultat
  const apply = () => {
    if (!result) return;
    onApply(result);
    onOpenChange(false);
    // Reset
    setResult(null);
    setImageFiles([]);
    setText("");
  };

  // Gerer le slash command dans le textarea
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);
    handleSlashInput(value, (newText) => setText(newText));
  };

  // Inserer une commande slash
  const handleSlashSelect = (command: { id: string; label: string; text: string }) => {
    const value = text;
    const lastSlashIndex = value.lastIndexOf("/");
    if (lastSlashIndex === -1) return;

    const beforeSlash = value.substring(0, lastSlashIndex);
    const afterCursor = value.substring(textAreaRef.current?.selectionStart ?? value.length);
    const newValue = beforeSlash + command.text + afterCursor;
    setText(newValue);
    closeSlashMenu();

    // Focus et positionner le curseur
    setTimeout(() => {
      if (textAreaRef.current) {
        textAreaRef.current.focus();
        const cursorPos = beforeSlash.length + command.text.length;
        textAreaRef.current.setSelectionRange(cursorPos, cursorPos);
      }
    }, 50);
  };

  // Previews des images
  const imagePreviews = imageFiles.map((file) => URL.createObjectURL(file));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>
            L'IA analyse vos images et/ou votre notice pour proposer un nom, une designation et une description.
            Jusqu'a {MAX_IMAGES} images acceptees.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3 gap-1 h-auto">
            <TabsTrigger value="combined" className="gap-1 text-xs sm:text-sm py-2">
              <Layers className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Images + Notice
            </TabsTrigger>
            <TabsTrigger value="image" className="gap-1 text-xs sm:text-sm py-2">
              <ImageIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Images
            </TabsTrigger>
            <TabsTrigger value="text" className="gap-1 text-xs sm:text-sm py-2">
              <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Notice
            </TabsTrigger>
          </TabsList>

          {/* Tab Images + Notice */}
          <TabsContent value="combined" className="space-y-4 pt-3">
            <ImageUploadSection
              imageFiles={imageFiles}
              imagePreviews={imagePreviews}
              onImageSelect={handleImageSelect}
              onRemoveImage={removeImage}
              onClearAll={clearAllImages}
              maxImages={MAX_IMAGES}
            />

            <TextInputSection
              ref={textAreaRef}
              text={text}
              onChange={handleTextChange}
              placeholder="Ajoutez une notice, des details ou copiez-collez le texte du fournisseur. Tapez / pour les commandes rapides."
              label="Notice / Description du produit"
              showSlashMenu={slashMenuOpen}
              slashMenuItems={slashMenuItems}
              onSlashSelect={handleSlashSelect}
              onSlashClose={closeSlashMenu}
            />
          </TabsContent>

          {/* Tab Images uniquement */}
          <TabsContent value="image" className="pt-3">
            <ImageUploadSection
              imageFiles={imageFiles}
              imagePreviews={imagePreviews}
              onImageSelect={handleImageSelect}
              onRemoveImage={removeImage}
              onClearAll={clearAllImages}
              maxImages={MAX_IMAGES}
            />
          </TabsContent>

          {/* Tab Notice uniquement */}
          <TabsContent value="text" className="pt-3">
            <TextInputSection
              ref={textAreaRef}
              text={text}
              onChange={handleTextChange}
              placeholder="Decrivez librement (matiere, couleur, taille, usage, public, details...). Tapez / pour les commandes rapides."
              label="Description du produit"
              showSlashMenu={slashMenuOpen}
              slashMenuItems={slashMenuItems}
              onSlashSelect={handleSlashSelect}
              onSlashClose={closeSlashMenu}
            />
          </TabsContent>
        </Tabs>

        {/* Bouton generer */}
        <Button
          type="button"
          onClick={run}
          disabled={loading || (imageFiles.length === 0 && text.trim().length === 0)}
          className="w-full gap-2"
          size="lg"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="h-4 w-4" />
          )}
          {loading ? "Analyse en cours..." : "Generer avec l'IA"}
        </Button>

        {/* Resultat */}
        {result && (
          <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-primary">Resultat de l'analyse</p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Verifiez et modifiez si besoin, puis appliquez au formulaire.
            </p>
            <div className="space-y-2">
              <div>
                <Label className="text-xs">Nom propose</Label>
                <Input
                  value={result.name}
                  onChange={(e) =>
                    setResult({ ...result, name: e.target.value })
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Designation</Label>
                <Input
                  value={result.designation}
                  onChange={(e) =>
                    setResult({ ...result, designation: e.target.value })
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Textarea
                  rows={4}
                  value={result.description}
                  onChange={(e) =>
                    setResult({ ...result, description: e.target.value })
                  }
                />
              </div>
              <Button
                type="button"
                onClick={apply}
                className="w-full"
                variant="default"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Appliquer au formulaire
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Sous-composants ───────────────────────────────────────────

/** Section upload d'images */
function ImageUploadSection({
  imageFiles,
  imagePreviews,
  onImageSelect,
  onRemoveImage,
  onClearAll,
  maxImages,
}: {
  imageFiles: File[];
  imagePreviews: string[];
  onImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: (index: number) => void;
  onClearAll: () => void;
  maxImages: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">
          Images du produit{" "}
          <span className="text-muted-foreground">
            ({imageFiles.length}/{maxImages})
          </span>
        </Label>
        {imageFiles.length > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80"
          >
            <Trash2 className="h-3 w-3" />
            Tout supprimer
          </button>
        )}
      </div>

      {/* Grille de previews */}
      {imageFiles.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {imagePreviews.map((preview, i) => (
            <div
              key={`${imageFiles[i].name}-${i}`}
              className="group relative aspect-square overflow-hidden rounded-lg border"
            >
              <img
                src={preview}
                alt=""
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => onRemoveImage(i)}
                className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}

          {/* Bouton ajouter (galerie) */}
          {imageFiles.length < maxImages && (
            <>
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-muted-foreground transition hover:border-primary hover:bg-primary/5">
                <Upload className="h-4 w-4" />
                <span className="text-[10px]">+</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={onImageSelect}
                />
              </label>

              {/* Bouton prendre une photo */}
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 text-primary transition hover:border-primary hover:bg-primary/10">
                <Camera className="h-4 w-4" />
                <span className="text-[10px]">Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={onImageSelect}
                />
              </label>
            </>
          )}
        </div>
      )}

      {/* Zone d'upload initiale : Galerie + Photo */}
      {imageFiles.length === 0 && (
        <div className="grid grid-cols-2 gap-3">
          {/* Bouton Galerie */}
          <label
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 py-6 text-muted-foreground transition hover:border-primary hover:bg-primary/5",
            )}
          >
            <Upload className="h-5 w-5" />
            <p className="text-xs font-medium">Galerie</p>
            <p className="text-[10px] text-muted-foreground">Choisir des images</p>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={onImageSelect}
            />
          </label>

          {/* Bouton Prendre une photo */}
          <label
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 py-6 text-primary transition hover:border-primary hover:bg-primary/10",
            )}
          >
            <Camera className="h-5 w-5" />
            <p className="text-xs font-medium">Prendre une photo</p>
            <p className="text-[10px] text-primary/70">Appareil photo</p>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={onImageSelect}
            />
          </label>
        </div>
      )}
    </div>
  );
}

/** Section input de texte avec slash commands */
import { forwardRef } from "react";

const TextInputSection = forwardRef<
  HTMLTextAreaElement,
  {
    text: string;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    placeholder: string;
    label: string;
    showSlashMenu: boolean;
    slashMenuItems: { id: string; label: string; text: string; icon?: string }[];
    onSlashSelect: (cmd: { id: string; label: string; text: string }) => void;
    onSlashClose: () => void;
  }
>(
  (
    {
      text,
      onChange,
      placeholder,
      label,
      showSlashMenu,
      slashMenuItems,
      onSlashSelect,
      onSlashClose,
    },
    ref,
  ) => {
    return (
      <div className="relative space-y-1.5">
        <Label className="text-xs font-medium">{label}</Label>
        <div className="relative">
          <Textarea
            ref={ref}
            rows={6}
            value={text}
            onChange={onChange}
            placeholder={placeholder.replace(/\\n/g, "\n")}
            className="resize-none pr-3 leading-relaxed"
          />
          {showSlashMenu && (
            <div className="absolute bottom-full left-0 mb-1">
              <SlashCommandMenu
                items={slashMenuItems}
                onSelect={onSlashSelect}
                onClose={onSlashClose}
              />
            </div>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">
          Tapez <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">/</kbd> pour
          inserer un modele rapide
        </p>
      </div>
    );
  },
);
TextInputSection.displayName = "TextInputSection";
