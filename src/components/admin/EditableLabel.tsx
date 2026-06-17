import { useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useOverride, useUiOverrides, SIZE_TO_CLASS, type ButtonSize } from "@/hooks/use-ui-overrides";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface EditableLabelProps {
  /** Stable identifier, e.g. "cart.checkout" */
  uiKey: string;
  /** Default text shown if no override */
  defaultLabel: string;
  /** Default size */
  defaultSize?: ButtonSize;
  /** Optional wrapper className */
  className?: string;
  /** Render a custom wrapper (e.g. inside a button). Defaults to <span>. */
  as?: "span" | "div";
  /** Optional render override around the label content */
  children?: (label: string, sizeClass: string) => ReactNode;
}

const SIZES: { value: ButtonSize; label: string }[] = [
  { value: "sm", label: "Petit" },
  { value: "md", label: "Normal" },
  { value: "lg", label: "Grand" },
  { value: "xl", label: "Très grand" },
];

export function EditableLabel({
  uiKey,
  defaultLabel,
  defaultSize = "md",
  className,
  as: As = "span",
  children,
}: EditableLabelProps) {
  const { isAdmin, user } = useAuth();
  const { upsert } = useUiOverrides();
  const { label, size } = useOverride(uiKey, { label: defaultLabel, size: defaultSize });

  const [open, setOpen] = useState(false);
  const [draftLabel, setDraftLabel] = useState(label);
  const [draftSize, setDraftSize] = useState<ButtonSize>(size);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const sizeClass = SIZE_TO_CLASS[size];

  const openDialog = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDraftLabel(label);
    setDraftSize(size);
    setPassword("");
    setOpen(true);
  };

  const save = async () => {
    if (!user?.email) return toast.error("Session invalide");
    if (!password) return toast.error("Mot de passe requis");
    setSaving(true);
    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });
      if (authErr) {
        toast.error("Mot de passe incorrect");
        setSaving(false);
        return;
      }
      await upsert(uiKey, { label: draftLabel.trim() || defaultLabel, size: draftSize });
      toast.success("Bouton mis à jour");
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <As className={cn("inline-flex items-center gap-1.5", className)}>
      {children ? children(label, sizeClass) : <span className={sizeClass}>{label}</span>}
      {isAdmin && (
        <>
          <button
            type="button"
            onClick={openDialog}
            aria-label="Modifier ce bouton (admin)"
            className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-background/90 text-foreground shadow ring-1 ring-border hover:bg-accent"
          >
            <Pencil className="h-3 w-3" />
          </button>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-sm" onClick={(e) => e.stopPropagation()}>
              <DialogHeader>
                <DialogTitle>Modifier le bouton</DialogTitle>
                <DialogDescription>
                  Personnalisez le texte et la taille. Confirmez avec votre mot de passe.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div>
                  <Label htmlFor={`lbl-${uiKey}`}>Texte affiché</Label>
                  <Input
                    id={`lbl-${uiKey}`}
                    value={draftLabel}
                    onChange={(e) => setDraftLabel(e.target.value)}
                    maxLength={80}
                  />
                </div>
                <div>
                  <Label>Taille</Label>
                  <div className="mt-1 grid grid-cols-4 gap-1.5">
                    {SIZES.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setDraftSize(s.value)}
                        className={cn(
                          "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                          draftSize === s.value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:bg-accent",
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label htmlFor={`pwd-${uiKey}`}>Votre mot de passe</Label>
                  <Input
                    id={`pwd-${uiKey}`}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Confirmation requise"
                    autoComplete="current-password"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Identifiant : <code className="rounded bg-muted px-1">{uiKey}</code>
                </p>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                  Annuler
                </Button>
                <Button onClick={save} disabled={saving}>
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </As>
  );
}
