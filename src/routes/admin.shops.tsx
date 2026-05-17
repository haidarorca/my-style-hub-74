import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Store, Globe2, MapPin, Image as ImageIcon, ShoppingBag, Upload, PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CountrySelect } from "@/components/CountrySelect";
import { useCountries } from "@/hooks/use-countries";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  listAdminShops, createAdminShop, updateAdminShop, deleteAdminShop, getAdminShop,
  getAdminShopDeletionInfo,
  type AdminShopRow,
} from "@/lib/admin-shops.functions";

export const Route = createFileRoute("/admin/shops")({
  component: AdminShopsPage,
});

type ShopType = "local" | "international";
type Mode = "commission" | "no_commission";

type FormState = {
  shop_name: string;
  shop_description: string;
  shop_logo_url: string | null;
  shop_banner_url: string | null;
  shop_type: ShopType;
  source_country_id: string | null;
  allowed_destination_country_ids: string[];
  vendor_mode: Mode;
};

const emptyForm: FormState = {
  shop_name: "",
  shop_description: "",
  shop_logo_url: null,
  shop_banner_url: null,
  shop_type: "international",
  source_country_id: null,
  allowed_destination_country_ids: [],
  vendor_mode: "no_commission",
};

function AdminShopsPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listAdminShops);
  const fetchOne = useServerFn(getAdminShop);
  const createFn = useServerFn(createAdminShop);
  const updateFn = useServerFn(updateAdminShop);
  const deleteFn = useServerFn(deleteAdminShop);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-shops"],
    queryFn: () => fetchList(),
  });

  const [openCreate, setOpenCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: (input: FormState) =>
      createFn({
        data: {
          shop_name: input.shop_name.trim(),
          shop_description: input.shop_description.trim() || null,
          shop_logo_url: input.shop_logo_url,
          shop_banner_url: input.shop_banner_url,
          shop_type: input.shop_type,
          source_country_id: input.source_country_id,
          allowed_destination_country_ids: input.allowed_destination_country_ids,
          vendor_mode: input.vendor_mode,
        },
      }),
    onSuccess: () => {
      toast.success("Boutique créée");
      qc.invalidateQueries({ queryKey: ["admin-shops"] });
      setOpenCreate(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (input: FormState & { id: string }) =>
      updateFn({
        data: {
          id: input.id,
          shop_name: input.shop_name.trim(),
          shop_description: input.shop_description.trim() || null,
          shop_logo_url: input.shop_logo_url,
          shop_banner_url: input.shop_banner_url,
          shop_type: input.shop_type,
          source_country_id: input.source_country_id,
          allowed_destination_country_ids: input.allowed_destination_country_ids,
          vendor_mode: input.vendor_mode,
        },
      }),
    onSuccess: () => {
      toast.success("Boutique mise à jour");
      qc.invalidateQueries({ queryKey: ["admin-shops"] });
      setEditingId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (input: { id: string; password: string }) => deleteFn({ data: input }),
    onSuccess: () => {
      toast.success("Boutique supprimée");
      qc.invalidateQueries({ queryKey: ["admin-shops"] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [deleteTarget, setDeleteTarget] = useState<AdminShopRow | null>(null);

  const rows = (data?.rows ?? []) as AdminShopRow[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Store className="h-5 w-5" /> Boutiques admin
          </h1>
          <p className="text-xs text-muted-foreground">
            Boutiques internes gérées par l'équipe — affichées comme des vendeurs normaux côté client.
          </p>
        </div>
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" /> Créer une boutique
            </Button>
          </DialogTrigger>
          <ShopFormDialog
            title="Créer une boutique admin"
            initial={emptyForm}
            submitting={createMut.isPending}
            onSubmit={(f) => createMut.mutate(f)}
            onClose={() => setOpenCreate(false)}
          />
        </Dialog>
      </div>

      {isLoading ? (
        <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">Chargement…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <Store className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">Aucune boutique admin pour le moment.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Exemples : Boutique Turquie, Boutique Chine, SHEIN Import, Taobao, Dubai…
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((s) => (
            <ShopCard
              key={s.id}
              row={s}
              onEdit={() => setEditingId(s.id)}
              onDelete={() => setDeleteTarget(s)}
            />
          ))}
        </div>
      )}

      {editingId && (
        <EditDialog
          shopId={editingId}
          fetchOne={fetchOne}
          submitting={updateMut.isPending}
          onSubmit={(f) => updateMut.mutate({ ...f, id: editingId })}
          onClose={() => setEditingId(null)}
        />
      )}

      {deleteTarget && (
        <DeleteShopDialog
          shop={deleteTarget}
          submitting={deleteMut.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={(password) => deleteMut.mutate({ id: deleteTarget.id, password })}
        />
      )}
    </div>
  );
}

function DeleteShopDialog({
  shop, submitting, onCancel, onConfirm,
}: {
  shop: AdminShopRow;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (password: string) => void;
}) {
  const fetchInfo = useServerFn(getAdminShopDeletionInfo);
  const { data: info, isLoading } = useQuery({
    queryKey: ["admin-shop-deletion-info", shop.id],
    queryFn: () => fetchInfo({ data: { id: shop.id } }),
  });

  const [step, setStep] = useState<1 | 2>(1);
  const [password, setPassword] = useState("");

  return (
    <AlertDialog open onOpenChange={(o) => { if (!o && !submitting) onCancel(); }}>
      <AlertDialogContent>
        {step === 1 ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-destructive">
                Voulez-vous vraiment supprimer cette boutique ?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <div className="rounded-md border bg-muted/40 p-3 text-sm">
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      <Store className="h-4 w-4" /> {shop.shop_name}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-muted-foreground">Produits</div>
                        <div className="font-semibold text-foreground">
                          {isLoading ? "…" : info?.product_count ?? 0}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Lignes de commande</div>
                        <div className="font-semibold text-foreground">
                          {isLoading ? "…" : info?.order_item_count ?? 0}
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-destructive">
                    ⚠️ Cette action est irréversible. La boutique et son compte interne seront supprimés définitivement.
                  </p>
                  {!isLoading && (info?.product_count ?? 0) > 0 && (
                    <p className="text-xs text-amber-600">
                      Cette boutique contient encore des produits. Supprimez-les d'abord avant de pouvoir supprimer la boutique.
                    </p>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={submitting}>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); setStep(2); }}
                disabled={isLoading || (info?.product_count ?? 0) > 0}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Continuer
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmation par mot de passe</AlertDialogTitle>
              <AlertDialogDescription>
                Pour confirmer la suppression de <span className="font-semibold text-foreground">{shop.shop_name}</span>,
                entrez votre mot de passe administrateur.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="admin-pwd">Mot de passe admin</Label>
              <Input
                id="admin-pwd"
                type="password"
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={submitting}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && password.length > 0 && !submitting) {
                    onConfirm(password);
                  }
                }}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={submitting} onClick={() => setStep(1)}>Retour</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); onConfirm(password); }}
                disabled={submitting || password.length === 0}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {submitting ? "Suppression…" : "Supprimer définitivement"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ShopCard({ row, onEdit, onDelete }: { row: AdminShopRow; onEdit: () => void; onDelete: () => void }) {
  return (
    <Card>
      <div
        className="h-24 w-full rounded-t-lg bg-muted bg-cover bg-center"
        style={row.shop_banner_url ? { backgroundImage: `url(${row.shop_banner_url})` } : undefined}
      />
      <CardContent className="p-3">
        <div className="-mt-8 mb-2 flex items-end gap-3">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border-4 border-card bg-muted">
            {row.shop_logo_url ? (
              <img src={row.shop_logo_url} alt={row.shop_name ?? ""} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Store className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 pt-6">
            <div className="truncate text-sm font-bold">{row.shop_name}</div>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {row.ships_internationally ? <Globe2 className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
              {row.ships_internationally ? "International" : "Local"}
              <span>·</span>
              <span>{row.vendor_mode === "commission" ? "Commission" : "Sans commission"}</span>
            </div>
          </div>
        </div>
        {row.shop_description ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">{row.shop_description}</p>
        ) : null}
        <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
          <ShoppingBag className="h-3 w-3" /> {row.product_count ?? 0} produit(s)
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="default" className="flex-1">
            <Link to="/admin/shops/$shopId/manage" params={{ shopId: row.id }}>
              <Store className="mr-1 h-3.5 w-3.5" /> Gérer
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/shops/$shopId/products/new" params={{ shopId: row.id }}>
              <PackagePlus className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/shop/$vendorId" params={{ vendorId: row.id }}>
              Voir
            </Link>
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EditDialog({
  shopId,
  fetchOne,
  submitting,
  onSubmit,
  onClose,
}: {
  shopId: string;
  fetchOne: ReturnType<typeof useServerFn<typeof getAdminShop>>;
  submitting: boolean;
  onSubmit: (f: FormState) => void;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-shop", shopId],
    queryFn: () => fetchOne({ data: { id: shopId } }),
  });

  const initial: FormState | null = data
    ? {
        shop_name: data.shop_name ?? "",
        shop_description: data.shop_description ?? "",
        shop_logo_url: data.shop_logo_url,
        shop_banner_url: data.shop_banner_url,
        shop_type: data.ships_internationally ? "international" : "local",
        source_country_id: data.source_country_id,
        allowed_destination_country_ids: data.allowed_destination_country_ids ?? [],
        vendor_mode: data.vendor_mode,
      }
    : null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      {isLoading || !initial ? (
        <DialogContent>
          <DialogHeader><DialogTitle>Chargement…</DialogTitle></DialogHeader>
        </DialogContent>
      ) : (
        <ShopFormDialog
          title="Modifier la boutique"
          initial={initial}
          submitting={submitting}
          onSubmit={onSubmit}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function ShopFormDialog({
  title,
  initial,
  submitting,
  onSubmit,
  onClose,
}: {
  title: string;
  initial: FormState;
  submitting: boolean;
  onSubmit: (f: FormState) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState<FormState>(initial);
  const { data: countries = [] } = useCountries({ onlyEnabled: true });
  const { user } = useAuth();
  const [uploading, setUploading] = useState<"logo" | "banner" | null>(null);

  useEffect(() => { setF(initial); }, [initial]);

  const upload = async (file: File, kind: "logo" | "banner") => {
    if (!user) return;
    setUploading(kind);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `admin-shops/${user.id}/${kind}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("site-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("site-assets").getPublicUrl(path);
      setF((prev) => ({ ...prev, [kind === "logo" ? "shop_logo_url" : "shop_banner_url"]: data.publicUrl }));
    } catch (e: any) {
      toast.error("Upload : " + e.message);
    } finally {
      setUploading(null);
    }
  };

  const canSubmit = f.shop_name.trim().length > 0 && !!f.source_country_id && !submitting;

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          Aucun numéro de téléphone ni adresse — boutique gérée en interne par l'équipe admin.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div>
          <Label>Nom de la boutique *</Label>
          <Input
            value={f.shop_name}
            onChange={(e) => setF((p) => ({ ...p, shop_name: e.target.value }))}
            placeholder="Ex : Boutique Turquie"
          />
        </div>

        <div>
          <Label>Description</Label>
          <Textarea
            value={f.shop_description}
            onChange={(e) => setF((p) => ({ ...p, shop_description: e.target.value }))}
            rows={3}
            placeholder="Présentez la boutique (origine, spécialités, délais…)"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Logo</Label>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-14 w-14 overflow-hidden rounded-full border bg-muted">
                {f.shop_logo_url ? (
                  <img src={f.shop_logo_url} alt="logo" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center"><ImageIcon className="h-5 w-5 text-muted-foreground" /></div>
                )}
              </div>
              <label className="cursor-pointer">
                <input
                  type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file, "logo"); }}
                />
                <Button asChild size="sm" variant="outline" disabled={uploading === "logo"}>
                  <span><Upload className="mr-1 h-3 w-3" />{uploading === "logo" ? "…" : "Téléverser"}</span>
                </Button>
              </label>
            </div>
          </div>

          <div>
            <Label>Bannière</Label>
            <div className="mt-1 flex items-center gap-2">
              <div
                className="h-14 w-28 overflow-hidden rounded-md border bg-muted bg-cover bg-center"
                style={f.shop_banner_url ? { backgroundImage: `url(${f.shop_banner_url})` } : undefined}
              />
              <label className="cursor-pointer">
                <input
                  type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file, "banner"); }}
                />
                <Button asChild size="sm" variant="outline" disabled={uploading === "banner"}>
                  <span><Upload className="mr-1 h-3 w-3" />{uploading === "banner" ? "…" : "Téléverser"}</span>
                </Button>
              </label>
            </div>
          </div>
        </div>

        <div>
          <Label>Type de boutique *</Label>
          <Select value={f.shop_type} onValueChange={(v) => setF((p) => ({ ...p, shop_type: v as ShopType }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="local">Locale (livraison dans un seul pays)</SelectItem>
              <SelectItem value="international">Internationale (livraison multi-pays)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>{f.shop_type === "local" ? "Pays de la boutique *" : "Pays source (origine des produits) *"}</Label>
          <CountrySelect
            value={f.source_country_id}
            onChange={(v) => setF((p) => ({ ...p, source_country_id: v }))}
          />
        </div>

        {f.shop_type === "international" && (
          <div>
            <Label>Pays de livraison autorisés</Label>
            <div className="mt-1 max-h-44 overflow-y-auto rounded-md border p-2">
              {countries.map((c) => {
                const checked = f.allowed_destination_country_ids.includes(c.id);
                return (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setF((p) => ({
                          ...p,
                          allowed_destination_country_ids: e.target.checked
                            ? [...p.allowed_destination_country_ids, c.id]
                            : p.allowed_destination_country_ids.filter((x) => x !== c.id),
                        }))
                      }
                    />
                    <span>{c.flag_emoji} {c.name}</span>
                  </label>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Laisser vide pour ne pas activer la livraison internationale tout de suite.
            </p>
          </div>
        )}

        <div>
          <Label>Mode de tarification *</Label>
          <Select value={f.vendor_mode} onValueChange={(v) => setF((p) => ({ ...p, vendor_mode: v as Mode }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="no_commission">Sans commission</SelectItem>
              <SelectItem value="commission">Avec commission (règles s'appliquent)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button disabled={!canSubmit} onClick={() => onSubmit(f)}>
          {submitting ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
