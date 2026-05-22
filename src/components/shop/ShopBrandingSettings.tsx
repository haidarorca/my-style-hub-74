/**
 * ShopBrandingSettings - Upload logo + banniere pour boutique
 * --------------------------------------------------------------
 * Utilise SmartImageUpload avec compression automatique.
 * Fonctionne pour l'espace vendeur ET l'espace admin.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SmartImageUpload } from "@/components/images/SmartImageUpload";

interface Props {
  shopId: string;
  isAdmin?: boolean;
}

export function ShopBrandingSettings({ shopId, isAdmin = false }: Props) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

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
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", shopId);
    if (error) {
      toast.error("Erreur : " + error.message);
    } else {
      toast.success("Mise a jour enregistree");
      qc.invalidateQueries({ queryKey: ["shop-branding", shopId] });
    }
    setSaving(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Image de la boutique</h3>
          <p className="text-xs text-muted-foreground">Logo et banniere visibles publiquement</p>
        </div>
        {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Banner */}
      <SmartImageUpload
        value={profile?.shop_banner_url ?? null}
        onUpload={(url) => saveBranding({ shop_banner_url: url })}
        onRemove={() => saveBranding({ shop_banner_url: null })}
        bucket="site-assets"
        folder={`shops/${shopId}`}
        maxWidth={1200}
        maxHeight={400}
        aspectRatio="wide"
        label="Banniere"
        hint="Format recommande : 1200 x 400px"
      />

      {/* Logo */}
      <SmartImageUpload
        value={profile?.shop_logo_url ?? null}
        onUpload={(url) => saveBranding({ shop_logo_url: url })}
        onRemove={() => saveBranding({ shop_logo_url: null })}
        bucket="site-assets"
        folder={`shops/${shopId}`}
        maxWidth={400}
        maxHeight={400}
        aspectRatio="square"
        label="Logo"
        hint="Format recommande : 400 x 400px, fond transparent ideal"
      />
    </div>
  );
}
