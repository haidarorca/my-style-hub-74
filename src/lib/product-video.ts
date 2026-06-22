// Détection plateforme vidéo + génération d'URL d'embed.

export type VideoProvider = "youtube" | "vimeo" | "tiktok" | "direct" | "unknown";

export interface ParsedVideo {
  provider: VideoProvider;
  embedUrl: string | null;
  originalUrl: string;
}

export function parseVideoUrl(raw: string | null | undefined): ParsedVideo | null {
  if (!raw) return null;
  const url = raw.trim();
  if (!url) return null;

  // YouTube
  let m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  if (m) {
    return { provider: "youtube", embedUrl: `https://www.youtube.com/embed/${m[1]}`, originalUrl: url };
  }

  // Vimeo
  m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) {
    return { provider: "vimeo", embedUrl: `https://player.vimeo.com/video/${m[1]}`, originalUrl: url };
  }

  // TikTok
  m = url.match(/tiktok\.com\/@[\w.-]+\/video\/(\d+)/);
  if (m) {
    return { provider: "tiktok", embedUrl: `https://www.tiktok.com/embed/v2/${m[1]}`, originalUrl: url };
  }

  // Direct video file
  if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url)) {
    return { provider: "direct", embedUrl: url, originalUrl: url };
  }

  return { provider: "unknown", embedUrl: null, originalUrl: url };
}
