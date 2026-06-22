import { Input } from "@/components/ui/input";
import { parseVideoUrl } from "@/lib/product-video";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function VideoUrlInput({ value, onChange }: Props) {
  const parsed = parseVideoUrl(value);
  const showPreview = parsed && parsed.embedUrl;

  return (
    <div className="space-y-2">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://youtube.com/… · vimeo.com/… · tiktok.com/…"
      />
      <p className="text-[11px] text-muted-foreground">
        Collez une URL YouTube, Vimeo, TikTok ou un lien direct vers un fichier vidéo. Upload direct depuis votre appareil — bientôt disponible.
      </p>
      {parsed && parsed.provider === "unknown" && value.trim().length > 5 && (
        <p className="text-[11px] text-amber-700">
          Plateforme non reconnue — l'aperçu ne sera pas affiché.
        </p>
      )}
      {showPreview && (
        <div className="overflow-hidden rounded-lg border bg-black aspect-video">
          {parsed.provider === "direct" ? (
            <video src={parsed.embedUrl!} controls className="h-full w-full" />
          ) : (
            <iframe
              src={parsed.embedUrl!}
              title="Aperçu vidéo"
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}
        </div>
      )}
    </div>
  );
}
