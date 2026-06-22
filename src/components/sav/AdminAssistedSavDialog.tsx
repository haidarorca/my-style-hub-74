// Admin-assisted SAV case creation (Sénégal use-case)
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { openSavCase } from "@/lib/sav-workflow.functions";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Search } from "lucide-react";
import { toast } from "sonner";

interface Props {
  onCreated?: () => void;
}

export function AdminAssistedSavDialog({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [itemId, setItemId] = useState<string>("");
  const [caseType, setCaseType] = useState<string>("return");
  const [resolution, setResolution] = useState<string>("refund");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [channel, setChannel] = useState<string>("phone");
  const [reason, setReason] = useState("");

  const openFn = useServerFn(openSavCase);
  const mut = useMutation({
    mutationFn: (payload: any) => openFn({ data: payload }),
    onSuccess: () => {
      toast.success("Dossier SAV créé pour le client");
      setOpen(false);
      reset();
      onCreated?.();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  function reset() {
    setSearch(""); setResults([]); setSelectedOrder(null); setItems([]); setItemId("");
    setTitle(""); setDescription(""); setReason("");
  }

  async function doSearch() {
    if (!search.trim()) return;
    const term = `%${search.trim()}%`;
    const { data } = await supabase
      .from("orders")
      .select("id, buyer_id, customer_name, customer_phone, total, status, destination_country_id, created_at")
      .or(`customer_name.ilike.${term},customer_phone.ilike.${term},id.eq.${search.trim()}`)
      .order("created_at", { ascending: false })
      .limit(20);
    setResults(data ?? []);
  }

  async function pickOrder(o: any) {
    setSelectedOrder(o);
    const { data } = await supabase.from("order_items")
      .select("id, product_id, product_name, vendor_id, quantity, unit_price")
      .eq("order_id", o.id);
    setItems(data ?? []);
  }

  function submit() {
    if (!selectedOrder) return toast.error("Choisissez une commande");
    if (!title.trim()) return toast.error("Titre requis");
    mut.mutate({
      order_id: selectedOrder.id,
      order_item_id: itemId || null,
      case_type: caseType,
      requested_resolution: resolution,
      title,
      description: description || null,
      on_behalf_of_user_id: selectedOrder.buyer_id ?? null,
      assisted_channel: channel,
      assisted_reason: reason || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="default">
          <UserPlus className="w-4 h-4 mr-1" /> Créer pour un client
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Créer un dossier SAV pour un client (assistance)</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Rechercher la commande</Label>
            <div className="flex gap-2">
              <Input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Nom, téléphone, ID commande" onKeyDown={(e) => e.key === "Enter" && doSearch()} />
              <Button onClick={doSearch} variant="outline"><Search className="w-4 h-4" /></Button>
            </div>
            {results.length > 0 && !selectedOrder && (
              <div className="border rounded mt-2 max-h-48 overflow-y-auto">
                {results.map((o) => (
                  <button key={o.id} type="button" onClick={() => pickOrder(o)}
                    className="w-full text-left p-2 hover:bg-muted text-sm border-b">
                    <div className="font-medium">{o.customer_name ?? "—"} · {o.customer_phone ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">#{o.id.slice(0,8)} · {o.total} XOF · {o.status}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedOrder && (
            <>
              <div className="p-2 bg-muted rounded text-sm flex justify-between">
                <span>Commande #{selectedOrder.id.slice(0,8)} — {selectedOrder.customer_name}</span>
                <button onClick={() => { setSelectedOrder(null); setItems([]); setItemId(""); }} className="text-xs underline">changer</button>
              </div>

              <div>
                <Label>Article concerné (optionnel)</Label>
                <Select value={itemId} onValueChange={setItemId}>
                  <SelectTrigger><SelectValue placeholder="Toute la commande" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Toute la commande</SelectItem>
                    {items.map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.product_name} · {i.quantity}× {i.unit_price} XOF</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Type de dossier</Label>
                  <Select value={caseType} onValueChange={setCaseType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cancellation">Annulation</SelectItem>
                      <SelectItem value="return">Retour</SelectItem>
                      <SelectItem value="exchange">Échange</SelectItem>
                      <SelectItem value="warranty">Garantie</SelectItem>
                      <SelectItem value="repair">Réparation</SelectItem>
                      <SelectItem value="refund">Remboursement</SelectItem>
                      <SelectItem value="dispute">Litige</SelectItem>
                      <SelectItem value="other">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Résolution demandée</Label>
                  <Select value={resolution} onValueChange={setResolution}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="refund">Remboursement</SelectItem>
                      <SelectItem value="exchange">Échange</SelectItem>
                      <SelectItem value="repair">Réparation</SelectItem>
                      <SelectItem value="credit">Avoir</SelectItem>
                      <SelectItem value="replacement">Remplacement</SelectItem>
                      <SelectItem value="none">À déterminer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Titre</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex : Produit reçu cassé" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Canal d'assistance</Label>
                  <Select value={channel} onValueChange={setChannel}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="phone">Téléphone</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="in_person">En personne</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="other">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Motif assistance</Label>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex : client âgé, pas d'app" />
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={submit} disabled={!selectedOrder || mut.isPending}>
            {mut.isPending ? "Création…" : "Créer le dossier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
