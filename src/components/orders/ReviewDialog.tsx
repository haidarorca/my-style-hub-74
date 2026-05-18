import { useState } from "react";
import { Star, Loader2, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  productId: string;
  productName: string;
  orderId: string;
  userId: string;
  onSuccess?: () => void;
};

export function ReviewDialog({
  open,
  onOpenChange,
  productId,
  productName,
  orderId,
  userId,
  onSuccess,
}: Props) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setRating(0);
    setHover(0);
    setComment("");
    setPhotos([]);
  };

  const uploadFiles = async (files: FileList) => {
    if (photos.length + files.length > 5) {
      toast.error("Maximum 5 photos");
      return;
    }
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`${file.name}: max 5 Mo`);
          continue;
        }
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${userId}/${productId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage
          .from("review-photos")
          .upload(path, file, { upsert: false });
        if (error) {
          toast.error(error.message);
          continue;
        }
        const { data } = supabase.storage.from("review-photos").getPublicUrl(path);
        uploaded.push(data.publicUrl);
      }
      setPhotos((p) => [...p, ...uploaded]);
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (rating < 1) {
      toast.error("Notez avec au moins 1 étoile");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("product_reviews").insert({
      product_id: productId,
      user_id: userId,
      order_id: orderId,
      rating,
      comment: comment.trim() || null,
      photos,
    } as any);
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Merci pour votre avis !");
    reset();
    onOpenChange(false);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Laisser un avis</DialogTitle>
          <DialogDescription className="line-clamp-2">{productName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Étoiles */}
          <div className="flex items-center justify-center gap-1.5 py-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                className="rounded-full p-1 transition active:scale-90"
                aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
              >
                <Star
                  className={cn(
                    "h-9 w-9 transition",
                    (hover || rating) >= n
                      ? "fill-amber-400 text-amber-400"
                      : "text-muted-foreground/40",
                  )}
                />
              </button>
            ))}
          </div>

          <Textarea
            placeholder="Partagez votre expérience (optionnel)…"
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 1000))}
            rows={4}
            className="resize-none"
          />
          <div className="text-right text-[10px] text-muted-foreground">{comment.length}/1000</div>

          {/* Photos */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold">Photos (max 5)</label>
            <div className="flex flex-wrap gap-2">
              {photos.map((url) => (
                <div key={url} className="relative h-16 w-16 overflow-hidden rounded-lg border">
                  <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  <button
                    type="button"
                    onClick={() => setPhotos((p) => p.filter((u) => u !== url))}
                    className="absolute right-0.5 top-0.5 rounded-full bg-foreground/80 p-0.5 text-background"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {photos.length < 5 && (
                <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground hover:bg-accent">
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <ImagePlus className="h-4 w-4" />
                      <span className="text-[9px]">Ajouter</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => e.target.files && uploadFiles(e.target.files)}
                  />
                </label>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={submitting || rating < 1}>
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Publier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
