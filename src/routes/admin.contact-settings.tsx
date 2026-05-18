import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, Save, ShieldCheck, MessageSquare, Mail, Phone as PhoneIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { getContactSettings, updateContactSettings } from "@/lib/support.functions";
import type { ContactSettings } from "@/lib/contact-policy";

export const Route = createFileRoute("/admin/contact-settings")({
  component: ContactSettingsPage,
});

const DEFAULT: ContactSettings = {
  id: "main",
  support_enabled: true,
  whatsapp_enabled: true,
  internal_messaging_enabled: true,
  vendor_contact_enabled: true,
  commission_hides_vendor_contact: true,
  whatsapp_support_numbers: [],
  support_emails: [],
  telegram_url: null,
  messenger_url: null,
  support_hours_i18n: {},
  auto_reply_message_i18n: {},
  default_assigned_admin_ids: [],
};

function ContactSettingsPage() {
  const { isSuperAdmin, isAdmin } = useAuth();
  const qc = useQueryClient();
  const getFn = useServerFn(getContactSettings);
  const updateFn = useServerFn(updateContactSettings);

  const { data, isLoading } = useQuery({
    queryKey: ["contact-settings"],
    queryFn: () => getFn(),
  });

  const [form, setForm] = useState<ContactSettings>(DEFAULT);

  useEffect(() => {
    if (data) setForm({ ...DEFAULT, ...data });
  }, [data]);

  const mutation = useMutation({
    mutationFn: (patch: Partial<ContactSettings>) => updateFn({ data: patch }),
    onSuccess: () => {
      toast.success("Paramètres enregistrés");
      qc.invalidateQueries({ queryKey: ["contact-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin && !isSuperAdmin) return <div className="p-6 text-sm">Accès refusé.</div>;
  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Chargement…</p>;

  const set = <K extends keyof ContactSettings>(k: K, v: ContactSettings[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const addNumber = () =>
    set("whatsapp_support_numbers", [...form.whatsapp_support_numbers, { label: "", number: "", enabled: true }]);
  const addEmail = () =>
    set("support_emails", [...form.support_emails, { label: "", email: "" }]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <ShieldCheck className="h-5 w-5" /> Réglages contacts & support
        </h1>
        <p className="text-xs text-muted-foreground">
          Système unifié de contact, messagerie interne, WhatsApp support et protection commission.
        </p>
      </div>

      {/* Switches globaux */}
      <Card className="space-y-4 p-4">
        <h2 className="text-sm font-semibold">Activations globales</h2>
        {[
          ["support_enabled", "Service client activé"],
          ["whatsapp_enabled", "WhatsApp activé"],
          ["internal_messaging_enabled", "Messagerie interne activée"],
          ["vendor_contact_enabled", "Contact direct vendeur autorisé"],
          ["commission_hides_vendor_contact", "Cacher les coordonnées vendeur en mode commission (recommandé)"],
        ].map(([key, label]) => (
          <div key={key as string} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
            <Label htmlFor={key as string} className="text-sm">{label}</Label>
            <Switch
              id={key as string}
              checked={Boolean(form[key as keyof ContactSettings])}
              onCheckedChange={(v) => set(key as keyof ContactSettings, v as never)}
            />
          </div>
        ))}
      </Card>

      {/* Numéros WhatsApp support */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><MessageSquare className="h-4 w-4" /> Numéros WhatsApp support</h2>
          <Button size="sm" variant="outline" onClick={addNumber} className="gap-1"><Plus className="h-3 w-3" /> Ajouter</Button>
        </div>
        {form.whatsapp_support_numbers.length === 0 && (
          <p className="text-xs text-muted-foreground">Aucun numéro. Ajoutez au moins un numéro principal.</p>
        )}
        {form.whatsapp_support_numbers.map((n, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-2">
            <Input placeholder="Libellé (ex: Principal)" value={n.label} maxLength={80} onChange={(e) => {
              const arr = [...form.whatsapp_support_numbers]; arr[i] = { ...n, label: e.target.value }; set("whatsapp_support_numbers", arr);
            }} />
            <Input placeholder="+221 77 000 0000" value={n.number} maxLength={20} onChange={(e) => {
              const arr = [...form.whatsapp_support_numbers]; arr[i] = { ...n, number: e.target.value }; set("whatsapp_support_numbers", arr);
            }} />
            <Switch checked={n.enabled} onCheckedChange={(v) => {
              const arr = [...form.whatsapp_support_numbers]; arr[i] = { ...n, enabled: v }; set("whatsapp_support_numbers", arr);
            }} />
            <Button size="icon" variant="ghost" onClick={() => {
              const arr = form.whatsapp_support_numbers.filter((_, j) => j !== i); set("whatsapp_support_numbers", arr);
            }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
      </Card>

      {/* Emails support */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Mail className="h-4 w-4" /> Emails support</h2>
          <Button size="sm" variant="outline" onClick={addEmail} className="gap-1"><Plus className="h-3 w-3" /> Ajouter</Button>
        </div>
        {form.support_emails.map((e, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
            <Input placeholder="Libellé" value={e.label} maxLength={80} onChange={(ev) => {
              const arr = [...form.support_emails]; arr[i] = { ...e, label: ev.target.value }; set("support_emails", arr);
            }} />
            <Input placeholder="support@example.com" type="email" value={e.email} maxLength={200} onChange={(ev) => {
              const arr = [...form.support_emails]; arr[i] = { ...e, email: ev.target.value }; set("support_emails", arr);
            }} />
            <Button size="icon" variant="ghost" onClick={() => {
              set("support_emails", form.support_emails.filter((_, j) => j !== i));
            }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
      </Card>

      {/* Réseaux */}
      <Card className="space-y-3 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><PhoneIcon className="h-4 w-4" /> Autres canaux</h2>
        <div>
          <Label>Telegram (URL)</Label>
          <Input value={form.telegram_url ?? ""} maxLength={300} onChange={(e) => set("telegram_url", e.target.value || null)} placeholder="https://t.me/..." />
        </div>
        <div>
          <Label>Messenger (URL)</Label>
          <Input value={form.messenger_url ?? ""} maxLength={300} onChange={(e) => set("messenger_url", e.target.value || null)} placeholder="https://m.me/..." />
        </div>
      </Card>

      {/* Horaires & auto-reply */}
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">Horaires & réponse automatique</h2>
        <div>
          <Label>Horaires support (FR)</Label>
          <Input value={form.support_hours_i18n?.fr ?? ""} maxLength={200} onChange={(e) => set("support_hours_i18n", { ...form.support_hours_i18n, fr: e.target.value })} placeholder="Lun-Ven 9h-18h" />
        </div>
        <div>
          <Label>Message d'accueil automatique (FR)</Label>
          <Textarea rows={3} maxLength={500} value={form.auto_reply_message_i18n?.fr ?? ""} onChange={(e) => set("auto_reply_message_i18n", { ...form.auto_reply_message_i18n, fr: e.target.value })} placeholder="Merci, nous répondons sous 24h." />
        </div>
      </Card>

      <div className="sticky bottom-0 -mx-3 border-t bg-background/95 p-3 backdrop-blur">
        <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending} className="w-full gap-2">
          <Save className="h-4 w-4" /> {mutation.isPending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}
