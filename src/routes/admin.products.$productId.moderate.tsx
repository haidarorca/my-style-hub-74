import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronLeft, Plus, MessageCircle, Check, X, Edit, Trash2, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  listReasonTemplates,
  createReasonTemplate,
  deleteReasonTemplate,
  submitModerationDecision,
  getVendorContact,
  STEP_LABELS,
  type ModerationStep,
  type ReasonTemplate,
} from "@/lib/admin-moderation.functions";

export const Route = createFileRoute("/admin/products/$productId/moderate")({
  component: ModeratePage,
});

const STEPS_ORDER: ModerationStep[] = [
  "name", "code", "designation", "description", "category", "subcategory",
  "images", "price", "stock", "variants", "countries", "global",
];

type SelectedReason = { reason_text: string; video_url: string | null };
type SelectedByStep = Partial<Record<ModerationStep, SelectedReason[]>>;

function ModeratePage() {
  const { productId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [openSteps, setOpenSteps] = useState<Set<ModerationStep>>(new Set());
  const [selected, setSelected] = useState<SelectedByStep>({});
  const [globalMessage, setGlobalMessage] = useState("");

  const { data: product, isLoading } = useQuery({
    queryKey: ["admin", "moderate", productId],
    queryFn: async () => {
      const [prod, imgs, variants, cust, countries] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, code, designation, description, price, status, is_edit, vendor_id, category_id, rejection_reason")
          .eq("id", productId)
          .single(),
        supabase.from("product_images").select("url, position").eq("product_id", productId).order("position"),
        supabase.from("product_variants").select("*").eq("product_id", productId),
        supabase.from("product_customizations").select("*").eq("product_id", productId),
        supabase.from("countries").select("id, name, flag_emoji").order("position"),
      ]);
      if (prod.error) throw prod.error;
      const vendor = await supabase
        .from("profiles")
        .select("id, full_name, shop_name, email, phone, shop_whatsapp, ships_internationally, source_country_id, allowed_destination_country_ids")
        .eq("id", prod.data.vendor_id)
        .maybeSingle();
      return {
        product: prod.data,
        images: imgs.data ?? [],
        variants: variants.data ?? [],
        customizations: cust.data ?? [],
        countries: countries.data ?? [],
        vendor: vendor.data,
      };
    },
  });

  const submitFn = useServerFn(submitModerationDecision);
  const submitMutation = useMutation({
    mutationFn: submitFn,
    onSuccess: () => {
      toast.success("Décision envoyée au vendeur");
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
      navigate({ to: "/admin/products" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const itemsForSubmit = useMemo(() => {
    const arr: { step: ModerationStep; reason_text: string; video_url: string | null }[] = [];
    for (const step of STEPS_ORDER) {
      const list = selected[step] ?? [];
      for (const r of list) arr.push({ step, reason_text: r.reason_text, video_url: r.video_url });
    }
    return arr;
  }, [selected]);

  function toggleStep(step: ModerationStep, on: boolean) {
    const next = new Set(openSteps);
    if (on) next.add(step);
    else {
      next.delete(step);
      setSelected((s) => ({ ...s, [step]: [] }));
    }
    setOpenSteps(next);
  }

  function handleSubmit(decision: "approved" | "rejected" | "changes_requested") {
    if (decision !== "approved" && itemsForSubmit.length === 0 && !globalMessage.trim()) {
      toast.error("Sélectionnez au moins un motif ou écrivez un message global.");
      return;
    }
    submitMutation.mutate({
      data: {
        product_id: productId,
        decision,
        items: itemsForSubmit,
        global_message: globalMessage.trim() || null,
        send_notification: true,
      },
    });
  }

  function buildWhatsAppMessage() {
    const lines: string[] = [];
    lines.push(`*Produit : ${product?.product.name ?? ""}*`);
    lines.push("");
    const grouped = new Map<ModerationStep, SelectedReason[]>();
    for (const step of STEPS_ORDER) {
      const arr = selected[step] ?? [];
      if (arr.length) grouped.set(step, arr);
    }
    let i = 1;
    for (const step of STEPS_ORDER) {
      if (step === "global") continue;
      const arr = grouped.get(step);
      if (!arr) continue;
      lines.push(`${i}. *${STEP_LABELS[step]}*`);
      for (const r of arr) {
        lines.push(`   • ${r.reason_text}`);
        if (r.video_url) lines.push(`     🎥 ${r.video_url}`);
      }
      lines.push("");
      i++;
    }
    const globals = grouped.get("global");
    if (globals) {
      lines.push("*Message global :*");
      for (const r of globals) {
        lines.push(`• ${r.reason_text}`);
        if (r.video_url) lines.push(`  🎥 ${r.video_url}`);
      }
      lines.push("");
    }
    if (globalMessage.trim()) lines.push(globalMessage.trim());
    return lines.join("\n").trim();
  }

  const vendorContactFn = useServerFn(getVendorContact);

  async function sendWhatsApp() {
    if (!product?.vendor) return;
    const contact = await vendorContactFn({ data: { vendor_id: product.product.vendor_id } });
    const phone = (contact?.shop_whatsapp || contact?.phone || "").replace(/[^\d]/g, "");
    if (!phone) {
      toast.error("Aucun numéro WhatsApp pour ce vendeur.");
      return;
    }
    const msg = buildWhatsAppMessage();
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  if (isLoading || !product) {
    return <div className="p-4 text-sm text-muted-foreground">Chargement…</div>;
  }

  const p = product.product;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/admin/products" })}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Retour
        </Button>
        <h1 className="text-lg font-bold">Modération produit</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* LEFT — product preview */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="text-base">{p.name}</CardTitle>
                <div className="mt-1 text-xs text-muted-foreground">
                  Code {p.code} • {p.price} FCFA
                </div>
              </div>
              <Badge variant={p.status === "approved" ? "default" : p.status === "rejected" ? "destructive" : "secondary"}>
                {p.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {product.vendor && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-xs font-semibold text-muted-foreground">Vendeur</div>
                <div>{product.vendor.shop_name || product.vendor.full_name || "—"}</div>
                <div className="text-xs text-muted-foreground">
                  {product.vendor.email}
                  {product.vendor.phone ? ` • ${product.vendor.phone}` : ""}
                </div>
              </div>
            )}

            <Button asChild size="sm" variant="outline" className="w-full">
              <Link to="/admin/products/$productId/edit" params={{ productId }}>
                <Edit className="mr-1 h-4 w-4" /> Modifier le produit avant validation
              </Link>
            </Button>

            {p.designation && (
              <Field label="Désignation">{p.designation}</Field>
            )}
            {p.description && (
              <Field label="Description"><span className="whitespace-pre-wrap">{p.description}</span></Field>
            )}
            {product.product.categories && (
              <Field label="Catégorie">{(product.product.categories as { name: string }).name}</Field>
            )}

            <div>
              <div className="mb-2 text-xs font-semibold text-muted-foreground">
                Images ({product.images.length})
              </div>
              <div className="grid grid-cols-3 gap-2">
                {product.images.map((im: { url: string }, i: number) => (
                  <a key={i} href={im.url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg bg-muted">
                    <img src={im.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </a>
                ))}
                {product.images.length === 0 && (
                  <div className="col-span-3 text-xs text-muted-foreground">Aucune image.</div>
                )}
              </div>
            </div>

            {product.variants.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-semibold text-muted-foreground">
                  Variantes ({product.variants.length})
                </div>
                <ul className="space-y-1.5">
                  {product.variants.map((v: { id: string; color: string | null; size: string | null; stock: number; price_override: number | null }) => (
                    <li key={v.id} className="rounded border p-2 text-xs">
                      {v.color && <span><b>Couleur :</b> {v.color} </span>}
                      {v.size && <span><b>Taille :</b> {v.size} </span>}
                      <span className="text-muted-foreground">Stock {v.stock}</span>
                      {v.price_override != null && <span className="text-muted-foreground"> • {v.price_override} FCFA</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {product.vendor && (
              <Field label="Pays de livraison">
                {product.vendor.ships_internationally
                  ? `International (${(product.vendor.allowed_destination_country_ids ?? []).length} pays)`
                  : "Local uniquement"}
              </Field>
            )}
          </CardContent>
        </Card>

        {/* RIGHT — moderation panel */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Décision et motifs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              {STEPS_ORDER.map((step) => (
                <StepRow
                  key={step}
                  step={step}
                  isOpen={openSteps.has(step)}
                  onToggle={(on) => toggleStep(step, on)}
                  selected={selected[step] ?? []}
                  onChange={(arr) => setSelected((s) => ({ ...s, [step]: arr }))}
                />
              ))}
            </div>

            <div className="space-y-2 pt-2">
              <Label className="text-xs">Message libre additionnel</Label>
              <Textarea
                placeholder="Optionnel — message libre pour le vendeur"
                value={globalMessage}
                onChange={(e) => setGlobalMessage(e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                onClick={() => handleSubmit("approved")}
                disabled={submitMutation.isPending}
                className="flex-1"
              >
                <Check className="mr-1 h-4 w-4" /> Approuver
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleSubmit("changes_requested")}
                disabled={submitMutation.isPending}
                className="flex-1"
              >
                <Edit className="mr-1 h-4 w-4" /> Modification
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleSubmit("rejected")}
                disabled={submitMutation.isPending}
                className="flex-1"
              >
                <X className="mr-1 h-4 w-4" /> Rejeter
              </Button>
            </div>

            <Button variant="outline" onClick={sendWhatsApp} className="w-full">
              <MessageCircle className="mr-1 h-4 w-4" /> Envoyer par WhatsApp
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function StepRow({
  step, isOpen, onToggle, selected, onChange,
}: {
  step: ModerationStep;
  isOpen: boolean;
  onToggle: (on: boolean) => void;
  selected: SelectedReason[];
  onChange: (arr: SelectedReason[]) => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listReasonTemplates);
  const createFn = useServerFn(createReasonTemplate);
  const deleteFn = useServerFn(deleteReasonTemplate);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newVideo, setNewVideo] = useState("");

  const { data: templates, isLoading } = useQuery({
    queryKey: ["moderation-templates", step],
    queryFn: () => listFn({ data: { step } }),
    enabled: isOpen,
    staleTime: 60_000,
  });

  const isChecked = (label: string) => selected.some((r) => r.reason_text === label);
  function toggleReason(t: ReasonTemplate, on: boolean) {
    if (on) onChange([...selected, { reason_text: t.label, video_url: t.video_url }]);
    else onChange(selected.filter((r) => r.reason_text !== t.label));
  }

  const createMutation = useMutation({
    mutationFn: createFn,
    onSuccess: (row) => {
      toast.success("Motif ajouté");
      qc.invalidateQueries({ queryKey: ["moderation-templates", step] });
      onChange([...selected, { reason_text: row.label, video_url: row.video_url }]);
      setNewLabel("");
      setNewVideo("");
      setAdding(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["moderation-templates", step] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-lg border bg-card">
      <label className="flex cursor-pointer items-center gap-3 p-3">
        <Checkbox checked={isOpen} onCheckedChange={(v) => onToggle(!!v)} />
        <span className="flex-1 text-sm font-medium">{STEP_LABELS[step]}</span>
        {selected.length > 0 && (
          <Badge variant="secondary">{selected.length}</Badge>
        )}
      </label>
      {isOpen && (
        <div className="space-y-2 border-t p-3">
          {isLoading && <div className="text-xs text-muted-foreground">Chargement des motifs…</div>}
          {templates?.map((t) => (
            <div key={t.id} className="flex items-start gap-2">
              <Checkbox
                checked={isChecked(t.label)}
                onCheckedChange={(v) => toggleReason(t, !!v)}
                className="mt-1"
              />
              <div className="flex-1 text-sm">
                <div>{t.label}</div>
                {t.video_url && (
                  <a href={t.video_url} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <Video className="h-3 w-3" /> Vidéo explicative
                  </a>
                )}
              </div>
              {!t.is_default && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => deleteMutation.mutate({ data: { id: t.id } })}
                  title="Supprimer ce motif"
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground" />
                </Button>
              )}
            </div>
          ))}

          {adding ? (
            <div className="space-y-2 rounded-md border border-dashed p-2">
              <Textarea
                placeholder="Nouveau motif…"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                rows={2}
              />
              <Input
                placeholder="Lien vidéo (optionnel)"
                value={newVideo}
                onChange={(e) => setNewVideo(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => createMutation.mutate({
                    data: { step, label: newLabel.trim(), video_url: newVideo.trim() || null },
                  })}
                  disabled={newLabel.trim().length < 3 || createMutation.isPending}
                >
                  Enregistrer
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewLabel(""); setNewVideo(""); }}>
                  Annuler
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setAdding(true)} className="text-xs">
              <Plus className="mr-1 h-3 w-3" /> Ajouter un motif
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
