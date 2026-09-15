import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Store } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { ProductImagesZipCard } from "./ProductImagesZipCard";

/** Bloc Import/Export ZIP d'images côté Admin, avec sélection de la boutique cible. */
export function AdminImagesZipSection() {
  const [shopId, setShopId] = useState<string>("");

  const { data: shops } = useQuery({
    queryKey: ["admin-shops-for-zip"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, shop_name, full_name")
        .order("shop_name", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as { id: string; shop_name: string | null; full_name: string | null }[];
    },
    staleTime: 60_000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Store className="h-4 w-4" /> Images produits par boutique
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select value={shopId} onValueChange={setShopId}>
          <SelectTrigger>
            <SelectValue placeholder="Choisir une boutique" />
          </SelectTrigger>
          <SelectContent>
            {(shops ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.shop_name || s.full_name || s.id.slice(0, 8)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {shopId ? (
          <ProductImagesZipCard scope="admin" shopId={shopId} />
        ) : (
          <p className="text-xs text-muted-foreground">
            Sélectionnez une boutique pour importer ou exporter ses images en ZIP.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
