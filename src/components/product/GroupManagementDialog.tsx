import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Layers, Trash2 } from "lucide-react";
import {
  createProductGroup, getGroupCandidates, getProductGroup, setProductGroupMembers,
  ungroupProductGroup, updateProductGroup,
  type GroupMedia,
} from "@/lib/product-groups.functions";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type MemberDraft = {
  product_id: string;
  name: string;
  code: string;
  price: number;
  image_url: string | null;
  option_label: string;
  show_individually: boolean;
};

/** Préfixe commun des noms → nom de groupe proposé automatiquement. */
function commonPrefix(names: string[]): string {
  if (names.length === 0) return "";
  const words = names.map((n) => n.trim().split(/\s+/));
  const out: string[] = [];
  for (let i = 0; i < words[0]!.length; i++) {
    const w = words[0]![i]!;
    if (words.every((ws) => (ws[i] ?? "").toLowerCase() === w.toLowerCase())) out.push(w);
    else break;
  }
  return out.join(" ").trim();
}

/** Différence de nom par rapport au préfixe commun → libellé d'option proposé. */
function suggestOption(name: string, prefix: string): string {
  const rest = prefix && name.toLowerCase().startsWith(prefix.toLowerCase()) ? name.slice(prefix.length) : name;
  return rest.replace(/^[\s\-–—:,/]+/, "").trim() || name;
}

export function GroupManagementDialog({
  open, onOpenChange, productIds, groupId, onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Mode création : produits sélectionnés dans la liste. */
  productIds?: string[];
  /** Mode édition : groupe existant. */
  groupId?: string;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const fetchCandidates = useServerFn(getGroupCandidates);
  const fetchGroup = useServerFn(getProductGroup);
  const create = useServerFn(createProductGroup);
  const update = useServerFn(updateProductGroup);
  const setMembers = useServerFn(setProductGroupMembers);
  const ungroup = useServerFn(ungroupProductGroup);

  const isEdit = !!groupId;

  const candidatesQ = useQuery({
    queryKey: ["group-candidates", productIds],
    enabled: open && !isEdit && !!productIds?.length,
    queryFn: () => fetchCandidates({ data: { product_ids: productIds! } }),
  });

  const groupQ = useQuery({
    queryKey: ["product-group", groupId],
    enabled: open && isEdit,
    queryFn: () => fetchGroup({ data: { group_id: groupId! } }),
  });

  const [name, setName] = useState("");
  const [criterion, setCriterion] = useState("Modèle");
  const [description, setDescription] = useState("");
  const [showInCatalog, setShowInCatalog] = useState(true);
  const [members, setMembersState] = useState<MemberDraft[]>([]);
  const [mediaPool, setMediaPool] = useState<GroupMedia[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Init depuis les produits sélectionnés
  useEffect(() => {
    if (isEdit || !candidatesQ.data) return;
    const rows = candidatesQ.data;
    const prefix = commonPrefix(rows.map((r) => r.name));
    setName(prefix || rows[0]?.name || "");
    setDescription(rows.find((r) => r.description)?.description ?? "");
    setMembersState(
      rows.map((r) => ({
        product_id: r.id,
        name: r.name,
        code: r.code,
        price: r.price,
        image_url: r.media.find((m) => m.media_type === "image")?.url ?? null,
        option_label: suggestOption(r.name, prefix),
        show_individually: true,
      })),
    );
    const pool: GroupMedia[] = [];
    rows.forEach((r) =>
      r.media.forEach((m, i) =>
        pool.push({ url: m.url, media_type: m.media_type, poster_url: m.poster_url, position: pool.length + i, source_product_id: r.id }),
      ),
    );
    setMediaPool(pool);
    setSelectedMedia(pool.slice(0, 8).map((m) => m.url));
  }, [candidatesQ.data, isEdit]);

  // Init depuis un groupe existant
  useEffect(() => {
    if (!isEdit || !groupQ.data) return;
    const g = groupQ.data;
    setName(g.name);
    setCriterion(g.criterion_label);
    setDescription(g.description ?? "");
    setShowInCatalog(g.show_in_catalog);
    setMembersState(
      g.members.map((m) => ({
        product_id: m.id,
        name: m.name,
        code: m.code,
        price: m.price,
        image_url: m.image_url,
        option_label: m.option_label ?? m.name,
        show_individually: m.show_individually,
      })),
    );
    setMediaPool(g.media);
    setSelectedMedia(g.media.map((m) => m.url));
  }, [groupQ.data, isEdit]);

  const chosenMedia = useMemo(
    () =>
      selectedMedia
        .map((url) => mediaPool.find((m) => m.url === url))
        .filter(Boolean)
        .map((m, i) => ({ ...(m as GroupMedia), position: i })),
    [selectedMedia, mediaPool],
  );

  function move(idx: number, dir: -1 | 1) {
    setMembersState((prev) => {
      const next = [...prev];
      const t = idx + dir;
      if (t < 0 || t >= next.length) return prev;
      [next[idx], next[t]] = [next[t]!, next[idx]!];
      return next;
    });
  }

  async function save() {
    if (name.trim().length < 2) return toast.error("Le nom du groupe est requis.");
    if (members.length < 2) return toast.error("Un groupe doit contenir au moins 2 produits.");
    setSaving(true);
    try {
      const payloadMembers = members.map((m, i) => ({
        product_id: m.product_id,
        option_label: m.option_label.trim(),
        position: i,
        show_individually: m.show_individually,
      }));
      const cover = chosenMedia.find((m) => m.media_type === "image")?.url ?? null;

      if (isEdit) {
        await update({
          data: {
            group_id: groupId!,
            name: name.trim(),
            description: description.trim() || null,
            criterion_label: criterion.trim() || "Modèle",
            cover_url: cover,
            show_in_catalog: showInCatalog,
            media: chosenMedia.map(({ url, media_type, poster_url, position, source_product_id }) => ({
              url, media_type, poster_url: poster_url ?? null, position, source_product_id: source_product_id ?? null,
            })),
          },
        });
        await setMembers({ data: { group_id: groupId!, members: payloadMembers } });
        toast.success("Groupe mis à jour");
      } else {
        await create({
          data: {
            name: name.trim(),
            description: description.trim() || null,
            category_id: candidatesQ.data?.[0]?.category_id ?? null,
            criterion_label: criterion.trim() || "Modèle",
            cover_url: cover,
            show_in_catalog: showInCatalog,
            media: chosenMedia.map(({ url, media_type, poster_url, position, source_product_id }) => ({
              url, media_type, poster_url: poster_url ?? null, position, source_product_id: source_product_id ?? null,
            })),
            members: payloadMembers,
          },
        });
        toast.success("Groupe créé");
      }
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
      qc.invalidateQueries({ queryKey: ["product-groups"] });
      onDone?.();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function doUngroup() {
    if (!groupId) return;
    setSaving(true);
    try {
      await ungroup({ data: { group_id: groupId } });
      toast.success("Groupe dissocié — les produits restent inchangés");
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
      qc.invalidateQueries({ queryKey: ["product-groups"] });
      onDone?.();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const loading = isEdit ? groupQ.isLoading : candidatesQ.isLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4" /> {isEdit ? "Modifier le groupe" : "Regrouper les produits"}
          </DialogTitle>
          <DialogDescription>
            Le groupe partage le titre, la description et les médias. Chaque produit garde son code, son prix,
            son stock, son poids et ses variantes.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Nom du groupe</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Motoculteur Diesel" />
              </div>
              <div className="space-y-1">
                <Label>Critère de choix</Label>
                <Input value={criterion} onChange={(e) => setCriterion(e.target.value)} placeholder="Puissance, Capacité, Modèle…" />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Description commune</Label>
              <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">Afficher le groupe dans le catalogue</div>
                <div className="text-xs text-muted-foreground">Une seule carte « groupe » au lieu de plusieurs.</div>
              </div>
              <Switch checked={showInCatalog} onCheckedChange={setShowInCatalog} />
            </div>

            {mediaPool.length > 0 && (
              <div className="space-y-2">
                <Label>Médias communs ({selectedMedia.length})</Label>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {mediaPool.map((m) => {
                    const on = selectedMedia.includes(m.url);
                    return (
                      <button
                        key={m.url}
                        type="button"
                        onClick={() =>
                          setSelectedMedia((prev) => (on ? prev.filter((u) => u !== m.url) : [...prev, m.url]))
                        }
                        className={cn(
                          "relative aspect-square overflow-hidden rounded-lg border-2 bg-muted",
                          on ? "border-primary" : "border-transparent opacity-60",
                        )}
                      >
                        <img
                          src={m.media_type === "video" ? (m.poster_url ?? "") : m.url}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                        {m.media_type === "video" && (
                          <Badge className="absolute bottom-1 left-1 h-4 px-1 text-[10px]">Vidéo</Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Produits du groupe ({members.length})</Label>
              <ul className="space-y-2">
                {members.map((m, i) => (
                  <li key={m.product_id} className="flex items-start gap-2 rounded-lg border p-2">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-muted">
                      {m.image_url ? <img src={m.image_url} alt="" className="h-full w-full object-cover" loading="lazy" /> : null}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="truncate text-xs font-medium">{m.name} <span className="text-muted-foreground">#{m.code}</span></div>
                      <Input
                        className="h-8 text-xs"
                        value={m.option_label}
                        placeholder="Libellé de l'option (ex. 7 CV)"
                        onChange={(e) =>
                          setMembersState((prev) => prev.map((x, j) => (j === i ? { ...x, option_label: e.target.value } : x)))
                        }
                      />
                      <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Switch
                          checked={m.show_individually}
                          onCheckedChange={(v) =>
                            setMembersState((prev) => prev.map((x, j) => (j === i ? { ...x, show_individually: v } : x)))
                          }
                        />
                        Visible aussi seul dans le catalogue
                      </label>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => move(i, -1)}>
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => move(i, 1)}>
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button" size="icon" variant="ghost"
                        className="h-6 w-6 text-destructive"
                        onClick={() => setMembersState((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {isEdit ? (
            <Button variant="outline" onClick={doUngroup} disabled={saving} className="text-destructive">
              Dissocier le groupe
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Annuler</Button>
            <Button onClick={save} disabled={saving || loading}>{saving ? "Enregistrement…" : "Enregistrer"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
