import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";

export const Route = createFileRoute("/admin/products")({
  component: ProductsPage,
});

type ProductRow = {
  id: string; name: string; code: string; price: number;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  product_images: { url: string }[] | null;
  vendor_id: string;
};

function ProductList({ status }: { status: "pending" | "approved" | "rejected" }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState<Record<string, string>>({});

  const { data: items } = useQuery({
    queryKey: ["admin", "products", status],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, code, price, status, rejection_reason, vendor_id, product_images(url)")
        .eq("status", status)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
  });

  async function setStatus(id: string, next: "approved" | "rejected") {
    const payload: { status: "approved" | "rejected"; rejection_reason?: string | null } = { status: next };
    if (next === "rejected") payload.rejection_reason = reason[id] || "Non conforme";
    else payload.rejection_reason = null;
    const { error } = await supabase.from("products").update(payload).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(next === "approved" ? "Approuvé" : "Rejeté");
    qc.invalidateQueries({ queryKey: ["admin", "products"] });
  }

  if (!items) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Aucun produit.</p>;

  return (
    <ul className="space-y-3">
      {items.map((p) => {
        const img = p.product_images?.[0]?.url;
        return (
          <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
              {img && <img src={img} alt={p.name} className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{p.name}</div>
              <div className="text-xs text-muted-foreground">Code {p.code} • {p.price} FCFA</div>
              {p.rejection_reason && <div className="mt-1 text-xs text-destructive">Motif : {p.rejection_reason}</div>}
            </div>
            {status === "pending" ? (
              <div className="flex w-full items-center gap-2 md:w-auto">
                <Input
                  placeholder="Motif de rejet (optionnel)"
                  value={reason[p.id] ?? ""}
                  onChange={(e) => setReason({ ...reason, [p.id]: e.target.value })}
                  className="h-8"
                />
                <Button size="sm" variant="outline" onClick={() => setStatus(p.id, "rejected")}>
                  <X className="mr-1 h-4 w-4" /> Rejeter
                </Button>
                <Button size="sm" onClick={() => setStatus(p.id, "approved")}>
                  <Check className="mr-1 h-4 w-4" /> Approuver
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Badge variant={status === "approved" ? "default" : "destructive"}>{status}</Badge>
                {status === "rejected" && (
                  <Button size="sm" onClick={() => setStatus(p.id, "approved")}>Approuver</Button>
                )}
                {status === "approved" && (
                  <Button size="sm" variant="outline" onClick={() => setStatus(p.id, "rejected")}>Retirer</Button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ProductsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Validation des produits</h1>
      <Card>
        <CardHeader><CardTitle className="text-base">Modération</CardTitle></CardHeader>
        <CardContent>
          <Tabs defaultValue="pending">
            <TabsList>
              <TabsTrigger value="pending">À valider</TabsTrigger>
              <TabsTrigger value="approved">Approuvés</TabsTrigger>
              <TabsTrigger value="rejected">Rejetés</TabsTrigger>
            </TabsList>
            <TabsContent value="pending" className="mt-4"><ProductList status="pending" /></TabsContent>
            <TabsContent value="approved" className="mt-4"><ProductList status="approved" /></TabsContent>
            <TabsContent value="rejected" className="mt-4"><ProductList status="rejected" /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
