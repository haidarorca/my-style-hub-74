/**
 * ShopBrandingSettings - Aperçu visuel + upload logo & bannière
 */

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ImageIcon, Camera, Trash2, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useImageCompression } from "@/hooks/use-image-compression";
import { cn } from "@/lib/utils";

interface Props {
  shopId: string;
  isAdmin?: boolean;
}

type Kind = "logo" | "banner";

export function ShopBrandingSettings({ shopId, isAdmin = false }: Props) {
  const qc = useQueryClient();
  const { compress } = useImageCompression();
  const [busy, setBusy] = useState<Kind | null>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);

  const folderRoot = isAdmin ? "shops" : "vendors";

  const { data: profile, isLoading } = useQuery({
    queryKey: ["shop-branding", shopId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("shop_name, shop_logo_url, shop_banner_url")
        .eq("id", shopId)
        .maybeSingle();
      return data;
    },
  });

  const saveBranding = async (updates: { shop_logo_url?: string | null; shop_banner_url?: string | null }) => {
    const { error } = await supabase.from("profiles").update(updates).eq("id", shopId);
    if (error) {
      toast.error("Erreur : " + error.message);
      return false;
    }
    qc.invalidateQueries({ queryKey: ["shop-branding", shopId] });
    return true;
  };

  const handleFile = async (kind: Kind, file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Veuillez sélectionner une image.");
      return;
    }
    setBusy(kind);
    try {
      const isBanner = kind === "banner";
      const compressed = await compress(file, {
        maxWidth: isBanner ? 1600 : 400,
        maxHeight: isBanner ? 500 : 400,
        quality: 0.85,
        maxSizeMB: 5,
      });
      const ext = compressed.name.split(".").pop() || "jpg";
      const path = `${folderRoot}/${shopId}/${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("site-assets")
        .upload(path, compressed, { upsert: true, contentType: compressed.type });
      if (upErr) throw new Error(upErr.message);
      const { data } = supabase.storage.from("site-assets").getPublicUrl(path);
      if (!data?.publicUrl) throw new Error("URL introuvable.");
      const ok = await saveBranding(
        isBanner ? { shop_banner_url: data.publicUrl } : { shop_logo_url: data.publicUrl },
      );
      if (ok) toast.success(isBanner ? "Bannière mise à jour" : "Logo mis à jour");
    } catch (err: any) {
      console.error("[ShopBrandingSettings]", err);
      toast.error(err?.message || "Échec du téléchargement.");
    } finally {
      setBusy(null);
      if (bannerInput.current) bannerInput.current.value = "";
      if (logoInput.current) logoInput.current.value = "";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border bg-card py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const banner = profile?.shop_banner_url ?? null;
  const logo = profile?.shop_logo_url ?? null;

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Image de la boutique</h3>
        </div>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
          Visible publiquement
        </span>
      </div>

      {/* Aperçu hero */}
      <div className="relative">
        <div
          className={cn(
            "relative aspect-[3/1] w-full overflow-hidden",
            !banner && "bg-gradient-to-br from-primary/15 via-accent/10 to-muted",
          )}
        >
          {banner ? (
            <img src={banner} alt="Bannière" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
            </div>
          )}
          {busy === "banner" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            </div>
          )}
        </div>

        {/* Logo overlay */}
        <div className="absolute -bottom-8 left-4">
          <div className="relative h-16 w-16 overflow-hidden rounded-2xl border-4 border-card bg-muted shadow-md ring-1 ring-border">
            {logo ? (
              <img src={logo} alt="Logo" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 to-accent/20">
                <Store className="h-6 w-6 text-primary/60" />
              </div>
            )}
            {busy === "logo" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2 px-4 pb-4 pt-10">
        <p className="text-xs text-muted-foreground">
          Bannière&nbsp;: 1600 × 500&nbsp;px (3:1) · Logo&nbsp;: 400 × 400&nbsp;px (carré)
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => bannerInput.current?.click()}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
          >
            <Camera className="h-3.5 w-3.5" />
            {banner ? "Changer la bannière" : "Ajouter une bannière"}
          </button>
          {banner && (
            <button
              type="button"
              onClick={() => saveBranding({ shop_banner_url: null })}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-background px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Supprimer
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => logoInput.current?.click()}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
          >
            <Camera className="h-3.5 w-3.5" />
            {logo ? "Changer le logo" : "Ajouter un logo"}
          </button>
          {logo && (
            <button
              type="button"
              onClick={() => saveBranding({ shop_logo_url: null })}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-background px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Supprimer
            </button>
          )}
        </div>
      </div>

      <input
        ref={bannerInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile("banner", f);
        }}
      />
      <input
        ref={logoInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile("logo", f);
        }}
      />
    </div>
  );
}
