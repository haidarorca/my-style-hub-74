import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MessageSquare, Phone, ShieldCheck, LifeBuoy } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { runtimeSettings } from "@/hooks/use-site-settings";
import {
  getContactPolicy,
  getPublicVendorContacts,
  createConversation,
} from "@/lib/support.functions";
import type { SupportConvType } from "@/lib/contact-policy";

interface Props {
  vendorId: string;
  productId?: string | null;
  productName?: string | null;
  orderId?: string | null;
  className?: string;
}

export function ContactActions({ vendorId, productId, productName, orderId, className }: Props) {
  const { user } = useAuth();
  const [openTicket, setOpenTicket] = useState(false);
  const [ticketType, setTicketType] = useState<SupportConvType>("client_support");

  const policyFn = useServerFn(getContactPolicy);
  const contactsFn = useServerFn(getPublicVendorContacts);

  const { data: policy } = useQuery({
    queryKey: ["contact-policy", vendorId, productId ?? null],
    queryFn: () => policyFn({ data: { vendorId, productId: productId ?? null } }),
  });

  const { data: contacts } = useQuery({
    queryKey: ["vendor-contacts", vendorId],
    queryFn: () => contactsFn({ data: { vendorId } }),
    enabled: !!policy?.can_contact_vendor,
  });

  if (!policy) return null;

  const supportNumbers = runtimeSettings.whatsapp_number ? [runtimeSettings.whatsapp_number] : [];
  const supportWaUrl = supportNumbers[0]
    ? `https://wa.me/${supportNumbers[0].replace(/\D/g, "")}?text=${encodeURIComponent(
        productName
          ? `Bonjour, j'ai besoin d'aide concernant ce produit : ${productName}`
          : "Bonjour, j'ai besoin d'aide",
      )}`
    : null;

  const vendorWaUrl = contacts?.shop_whatsapp
    ? `https://wa.me/${contacts.shop_whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(
        `Bonjour ${contacts.shop_name ?? ""}, à propos de : ${productName ?? "votre boutique"}`,
      )}`
    : null;

  return (
    <div className={className ?? "flex flex-wrap gap-2"}>
      {policy.is_commission && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
          <ShieldCheck className="h-3 w-3" /> Contact via service client
        </span>
      )}

      {policy.can_use_support && supportWaUrl && (
        <a
          href={supportWaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#25D366] px-3 py-2 text-xs font-semibold text-white shadow"
        >
          <LifeBuoy className="h-3.5 w-3.5" /> Service client WhatsApp
        </a>
      )}

      {policy.can_contact_vendor && vendorWaUrl && (
        <a
          href={vendorWaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow"
        >
          <Phone className="h-3.5 w-3.5" /> Contacter la boutique
        </a>
      )}

      {user && (policy.can_use_internal_messaging || policy.can_use_support) && (
        <Dialog open={openTicket} onOpenChange={setOpenTicket}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTicketType(policy.is_commission || !policy.can_contact_vendor ? "client_support" : "client_vendor")}
              className="gap-1.5"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {policy.is_commission ? "Poser une question" : "Message"}
            </Button>
          </DialogTrigger>
          <NewTicketDialogContent
            vendorId={vendorId}
            productId={productId ?? null}
            orderId={orderId ?? null}
            defaultType={ticketType}
            onCreated={() => setOpenTicket(false)}
          />
        </Dialog>
      )}

      {!user && policy.can_use_support && (
        <Button asChild size="sm" variant="outline">
          <Link to="/login">Connexion pour contacter</Link>
        </Button>
      )}
    </div>
  );
}

function friendlyFormError(e: Error): string {
  const m = e.message;
  if (m.includes("String must contain") || m.startsWith("[") || m.includes("validation") || m.includes("Invalid")) {
    return "Veuillez vérifier vos informations et réessayer.";
  }
  return m;
}

function NewTicketDialogContent({
  vendorId,
  productId,
  orderId,
  defaultType,
  onCreated,
}: {
  vendorId: string;
  productId: string | null;
  orderId: string | null;
  defaultType: SupportConvType;
  onCreated: () => void;
}) {
  const createFn = useServerFn(createConversation);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const subjectTrimmed = subject.trim();
  const bodyTrimmed = body.trim();

  const subjectError = subjectTrimmed.length === 1 ? "Le sujet doit contenir au moins 2 caractères." : null;
  const bodyError = bodyTrimmed.length === 0 && body.length > 0 ? "Le message ne peut pas être vide." : null;

  const canSubmit = (subjectTrimmed.length === 0 || subjectTrimmed.length >= 2) && bodyTrimmed.length >= 1;

  const mutation = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          subject: subjectTrimmed || "Demande",
          body: bodyTrimmed,
          type: defaultType,
          vendorId,
          productId,
          orderId,
        },
      }),
    onSuccess: () => {
      toast.success("Message envoyé. Vous recevrez une réponse rapidement.");
      setSubject("");
      setBody("");
      onCreated();
    },
    onError: (e: Error) => toast.error(friendlyFormError(e)),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Nouveau message</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Sujet</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="Ex: Question sur le produit" />
          {subjectError && <p className="mt-1 text-xs text-destructive">{subjectError}</p>}
        </div>
        <div>
          <Label>Message</Label>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={5000} />
          {bodyError && <p className="mt-1 text-xs text-destructive">{bodyError}</p>}
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}>
          {mutation.isPending ? "Envoi…" : "Envoyer"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
