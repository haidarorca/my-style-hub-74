import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { LifeBuoy, MessageSquare, Mail, Send, Phone, ShieldCheck } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { getContactSettings, createConversation, createPublicSupportTicket } from "@/lib/support.functions";

export const Route = createFileRoute("/support")({
  component: SupportPage,
  head: () => ({
    meta: [
      { title: "Support client — Aide & contact" },
      { name: "description", content: "Contactez notre service client : WhatsApp, email, ou formulaire. Aide commandes, paiement, vendeurs et boutiques." },
    ],
  }),
});

function SupportPage() {
  const { user } = useAuth();
  const settingsFn = useServerFn(getContactSettings);
  const { data: settings } = useQuery({ queryKey: ["contact-settings"], queryFn: () => settingsFn() });

  const activeNumbers = (settings?.whatsapp_support_numbers ?? []).filter((n) => n.enabled && n.number);
  const emails = settings?.support_emails ?? [];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="page-container space-y-6 pb-safe">
        <header className="mt-4 space-y-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <LifeBuoy className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-extrabold">Service client</h1>
          <p className="text-sm text-muted-foreground">
            {settings?.support_hours_i18n?.fr ?? "Nous répondons généralement sous 24h."}
          </p>
        </header>

        {/* WhatsApp */}
        {settings?.support_enabled && settings.whatsapp_enabled && activeNumbers.length > 0 && (
          <Card className="space-y-2 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><MessageSquare className="h-4 w-4 text-[#25D366]" /> WhatsApp</h2>
            <div className="grid gap-2">
              {activeNumbers.map((n, i) => (
                <a key={i}
                  href={`https://wa.me/${n.number.replace(/\D/g, "")}?text=${encodeURIComponent("Bonjour, j'ai besoin d'aide.")}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-xl bg-[#25D366] px-4 py-3 text-sm font-semibold text-white shadow active:scale-[0.99]">
                  <span className="flex items-center gap-2"><Phone className="h-4 w-4" /> {n.label || "Support"}</span>
                  <span className="text-xs opacity-90">{n.number}</span>
                </a>
              ))}
            </div>
          </Card>
        )}

        {/* Emails */}
        {emails.length > 0 && (
          <Card className="space-y-2 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Mail className="h-4 w-4" /> Email</h2>
            {emails.map((e, i) => (
              <a key={i} href={`mailto:${e.email}`} className="block rounded-xl border p-3 text-sm hover:bg-accent">
                <span className="font-semibold">{e.label || "Email"}</span> · <span className="text-muted-foreground">{e.email}</span>
              </a>
            ))}
          </Card>
        )}

        {/* Ticket form */}
        {settings?.support_enabled && (
          <Card className="space-y-3 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Send className="h-4 w-4" /> Envoyer une demande
            </h2>
            {user ? <AuthTicketForm /> : <PublicTicketForm />}
          </Card>
        )}

        <Card className="space-y-2 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4" /> Sujets fréquents</h2>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>• Suivi de commande — utilisez <Link to="/orders" className="text-primary underline">Mes commandes</Link></li>
            <li>• Problème de paiement</li>
            <li>• Aide vendeur — contactez le service client</li>
            <li>• Signaler un produit ou une boutique</li>
          </ul>
        </Card>
      </main>
    </div>
  );
}

function AuthTicketForm() {
  const createFn = useServerFn(createConversation);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const m = useMutation({
    mutationFn: () => createFn({ data: { subject: subject.trim() || "Demande", body: body.trim(), type: "client_support" } }),
    onSuccess: () => { toast.success("Demande envoyée. Réponse dans Mes messages."); setSubject(""); setBody(""); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-2">
      <div><Label>Sujet</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} /></div>
      <div><Label>Message</Label><Textarea value={body} rows={5} maxLength={5000} onChange={(e) => setBody(e.target.value)} /></div>
      <Button onClick={() => m.mutate()} disabled={!body.trim() || m.isPending} className="w-full gap-2"><Send className="h-4 w-4" /> Envoyer</Button>
    </div>
  );
}

function PublicTicketForm() {
  const createFn = useServerFn(createPublicSupportTicket);
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const [subject, setSubject] = useState(""); const [body, setBody] = useState("");
  const m = useMutation({
    mutationFn: () => createFn({ data: { name: name.trim(), email: email.trim(), subject: subject.trim() || "Demande", body: body.trim() } }),
    onSuccess: () => { toast.success("Demande envoyée. Nous vous répondrons par email."); setName(""); setEmail(""); setSubject(""); setBody(""); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Nom</Label><Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></div>
        <div><Label>Email</Label><Input type="email" value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} /></div>
      </div>
      <div><Label>Sujet</Label><Input value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} /></div>
      <div><Label>Message</Label><Textarea rows={5} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} /></div>
      <Button onClick={() => m.mutate()} disabled={!name.trim() || !email.trim() || !body.trim() || m.isPending} className="w-full gap-2">
        <Send className="h-4 w-4" /> Envoyer
      </Button>
      <p className="text-[10px] text-muted-foreground">Connectez-vous pour suivre vos demandes dans Mes messages.</p>
    </div>
  );
}
