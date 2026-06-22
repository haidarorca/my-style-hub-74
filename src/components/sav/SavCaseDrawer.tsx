import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listSavMessages, listSavActions, listSavAttachments, addSavMessage,
  vendorRecommend, adminDecide, adminOverride, adminIssueRefund, adminUpdateCase,
  type SavCaseRow, type SavVendorRecommendation, type SavAdminDecision, type SavResolution,
} from "@/lib/sav-workflow.functions";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CaseStatusBadge, CaseTypeBadge, VendorRecoBadge, AdminDecisionBadge, SlaBadge } from "./SavCaseBadges";
import { SavEvidenceUploader } from "./SavEvidenceUploader";
import { toast } from "sonner";
import { FileText, MessageSquare, Paperclip, Gavel, History, DollarSign, ArrowUpRight, ShieldAlert } from "lucide-react";
import { Link } from "@tanstack/react-router";

export type SavRole = "client" | "vendor" | "admin";

interface Props {
  caseRow: SavCaseRow | null;
  role: SavRole;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged?: () => void;
}

export function SavCaseDrawer({ caseRow, role, open, onOpenChange, onChanged }: Props) {
  const qc = useQueryClient();
  const listMsg = useServerFn(listSavMessages);
  const listAct = useServerFn(listSavActions);
  const listAtt = useServerFn(listSavAttachments);
  const sendMsg = useServerFn(addSavMessage);
  const vReco = useServerFn(vendorRecommend);
  const aDecide = useServerFn(adminDecide);
  const aOverride = useServerFn(adminOverride);
  const aRefund = useServerFn(adminIssueRefund);
  const aUpdate = useServerFn(adminUpdateCase);

  const caseId = caseRow?.id ?? null;

  const messages = useQuery({
    queryKey: ["sav-messages", caseId],
    queryFn: () => listMsg({ data: { case_id: caseId! } }),
    enabled: Boolean(caseId && open),
  });
  const actions = useQuery({
    queryKey: ["sav-actions", caseId],
    queryFn: () => listAct({ data: { case_id: caseId! } }),
    enabled: Boolean(caseId && open),
  });
  const atts = useQuery({
    queryKey: ["sav-attachments", caseId],
    queryFn: () => listAtt({ data: { case_id: caseId! } }),
    enabled: Boolean(caseId && open),
  });

  const [msgBody, setMsgBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [recoVal, setRecoVal] = useState<SavVendorRecommendation>("accept");
  const [recoNote, setRecoNote] = useState("");
  const [adminDec, setAdminDec] = useState<SavAdminDecision>("accepted");
  const [adminRes, setAdminRes] = useState<SavResolution>("refund");
  const [adminReason, setAdminReason] = useState("");
  const [refundAmt, setRefundAmt] = useState<string>("");
  const [refundMethod, setRefundMethod] = useState<"wave"|"orange_money"|"cash"|"bank_transfer"|"credit_note"|"other">("wave");

  const sendMsgM = useMutation({
    mutationFn: () => sendMsg({ data: { case_id: caseId!, body: msgBody, is_internal_note: internal } }),
    onSuccess: () => { setMsgBody(""); setInternal(false); messages.refetch(); actions.refetch(); toast.success("Message envoyé"); },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const vRecoM = useMutation({
    mutationFn: () => vReco({ data: { case_id: caseId!, recommendation: recoVal, note: recoNote || null } }),
    onSuccess: () => { toast.success("Recommandation envoyée"); onChanged?.(); qc.invalidateQueries({ queryKey: ["sav-actions", caseId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const aDecideM = useMutation({
    mutationFn: () => aDecide({ data: { case_id: caseId!, decision: adminDec, decided_resolution: adminRes, reason: adminReason || null } }),
    onSuccess: () => { toast.success("Décision enregistrée"); onChanged?.(); qc.invalidateQueries({ queryKey: ["sav-actions", caseId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const aOverrideM = useMutation({
    mutationFn: () => aOverride({ data: { case_id: caseId!, decision: adminDec, decided_resolution: adminRes, reason: adminReason || "Override" } }),
    onSuccess: () => { toast.success("Décision surchargée"); onChanged?.(); qc.invalidateQueries({ queryKey: ["sav-actions", caseId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const aRefundM = useMutation({
    mutationFn: () => aRefund({ data: { case_id: caseId!, amount: Number(refundAmt), method: refundMethod } }),
    onSuccess: () => { setRefundAmt(""); toast.success("Remboursement émis"); onChanged?.(); },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const aCloseM = useMutation({
    mutationFn: () => aUpdate({ data: { case_id: caseId!, status: "closed" } }),
    onSuccess: () => { toast.success("Dossier clôturé"); onChanged?.(); onOpenChange(false); },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const aReopenM = useMutation({
    mutationFn: () => aUpdate({ data: { case_id: caseId!, status: "reopened" } }),
    onSuccess: () => { toast.success("Dossier réouvert"); onChanged?.(); },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  if (!caseRow) return null;

  const visibleMessages = useMemo(() => {
    const list = (messages.data ?? []) as any[];
    if (role === "client") return list.filter((m) => !m.is_internal_note);
    return list;
  }, [messages.data, role]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 flex-wrap">
            <CaseTypeBadge type={caseRow.case_type} />
            {caseRow.title}
          </SheetTitle>
          <SheetDescription className="flex flex-wrap gap-2 items-center">
            <CaseStatusBadge status={caseRow.status} />
            <VendorRecoBadge reco={caseRow.vendor_recommendation} />
            <AdminDecisionBadge decision={caseRow.admin_decision} />
            <SlaBadge deadline={caseRow.sla_deadline_at} />
            {role === "admin" && (
              <Link to="/admin/cockpit" search={{ orderId: caseRow.order_id }}>
                <Badge variant="outline" className="cursor-pointer">Commande <ArrowUpRight className="w-3 h-3 ml-1" /></Badge>
              </Link>
            )}
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="details" className="mt-4">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="details"><FileText className="w-4 h-4" /></TabsTrigger>
            <TabsTrigger value="messages"><MessageSquare className="w-4 h-4" /></TabsTrigger>
            <TabsTrigger value="evidence"><Paperclip className="w-4 h-4" /></TabsTrigger>
            <TabsTrigger value="decision"><Gavel className="w-4 h-4" /></TabsTrigger>
            <TabsTrigger value="history"><History className="w-4 h-4" /></TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-3">
            <Card><CardContent className="p-4 space-y-2 text-sm">
              <div><span className="text-muted-foreground">Description : </span>{caseRow.description ?? "—"}</div>
              <div><span className="text-muted-foreground">Résolution demandée : </span>{caseRow.requested_resolution}</div>
              {caseRow.decided_resolution && <div><span className="text-muted-foreground">Résolution décidée : </span>{caseRow.decided_resolution}</div>}
              <div><span className="text-muted-foreground">Ouvert : </span>{new Date(caseRow.opened_at).toLocaleString("fr-FR")}</div>
              {caseRow.on_behalf_of_user_id && (
                <div className="flex items-center gap-1 text-amber-700">
                  <ShieldAlert className="w-3 h-3"/> Créé par l'administration pour le client
                </div>
              )}
              {caseRow.rules_snapshot && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Règles appliquées</summary>
                  <pre className="mt-1 bg-muted p-2 rounded overflow-auto">{JSON.stringify(caseRow.rules_snapshot, null, 2)}</pre>
                </details>
              )}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="messages" className="space-y-3">
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {visibleMessages.map((m) => (
                <Card key={m.id}><CardContent className="p-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span className="font-medium">{m.sender_role}</span>
                    <span>{new Date(m.created_at).toLocaleString("fr-FR")}</span>
                  </div>
                  {m.is_internal_note && <Badge variant="outline" className="bg-amber-100 text-amber-800 mb-1">Note interne</Badge>}
                  <div className="text-sm whitespace-pre-wrap">{m.body}</div>
                </CardContent></Card>
              ))}
              {visibleMessages.length === 0 && <div className="text-sm text-muted-foreground text-center py-4">Aucun message</div>}
            </div>
            <div className="space-y-2">
              <Textarea value={msgBody} onChange={(e) => setMsgBody(e.target.value)} placeholder="Votre message…" rows={3} />
              {role !== "client" && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={internal} onCheckedChange={(v) => setInternal(v === true)} />
                  Note interne (invisible côté client)
                </label>
              )}
              <Button onClick={() => sendMsgM.mutate()} disabled={!msgBody.trim() || sendMsgM.isPending}>Envoyer</Button>
            </div>
          </TabsContent>

          <TabsContent value="evidence" className="space-y-3">
            <SavEvidenceUploader caseId={caseRow.id} onUploaded={() => atts.refetch()} />
            <div className="grid grid-cols-2 gap-2">
              {(atts.data ?? []).map((a: any) => (
                <a key={a.id} href={a.signed_url ?? "#"} target="_blank" rel="noreferrer" className="block border rounded p-2 text-xs hover:bg-muted">
                  {a.mime_type?.startsWith("image/") && a.signed_url
                    ? <img src={a.signed_url} alt="" className="w-full h-32 object-cover rounded" />
                    : <div className="h-32 flex items-center justify-center bg-muted rounded"><Paperclip className="w-6 h-6" /></div>}
                  <div className="mt-1 truncate">{a.caption ?? a.storage_path.split("/").pop()}</div>
                </a>
              ))}
              {(atts.data ?? []).length === 0 && <div className="text-sm text-muted-foreground col-span-2 text-center py-4">Aucune preuve</div>}
            </div>
          </TabsContent>

          <TabsContent value="decision" className="space-y-3">
            {role === "vendor" && (
              <Card><CardContent className="p-4 space-y-3">
                <div className="text-sm font-medium">Votre recommandation (non décisionnelle)</div>
                <Select value={recoVal} onValueChange={(v) => setRecoVal(v as SavVendorRecommendation)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="accept">Accepter</SelectItem>
                    <SelectItem value="refuse">Refuser</SelectItem>
                    <SelectItem value="propose_refund">Proposer un remboursement</SelectItem>
                    <SelectItem value="propose_exchange">Proposer un échange</SelectItem>
                    <SelectItem value="propose_other">Autre proposition</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea value={recoNote} onChange={(e) => setRecoNote(e.target.value)} placeholder="Commentaire pour l'administration" rows={3} />
                <Button onClick={() => vRecoM.mutate()} disabled={vRecoM.isPending}>Envoyer la recommandation</Button>
                <p className="text-xs text-muted-foreground">La décision finale appartient à l'administration KawZone.</p>
              </CardContent></Card>
            )}

            {role === "admin" && (
              <>
                <Card><CardContent className="p-4 space-y-3">
                  <div className="text-sm font-medium">Décision finale</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Décision</Label>
                      <Select value={adminDec} onValueChange={(v) => setAdminDec(v as SavAdminDecision)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="accepted">Accepter</SelectItem>
                          <SelectItem value="refused">Refuser</SelectItem>
                          <SelectItem value="partially_accepted">Accepter partiellement</SelectItem>
                          <SelectItem value="escalated">Escalader</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Résolution</Label>
                      <Select value={adminRes} onValueChange={(v) => setAdminRes(v as SavResolution)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="refund">Remboursement</SelectItem>
                          <SelectItem value="exchange">Échange</SelectItem>
                          <SelectItem value="repair">Réparation</SelectItem>
                          <SelectItem value="credit">Avoir</SelectItem>
                          <SelectItem value="replacement">Remplacement</SelectItem>
                          <SelectItem value="partial_refund">Remboursement partiel</SelectItem>
                          <SelectItem value="none">Aucune</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Textarea value={adminReason} onChange={(e) => setAdminReason(e.target.value)} placeholder="Motivation de la décision" rows={3} />
                  <div className="flex gap-2">
                    <Button onClick={() => aDecideM.mutate()} disabled={aDecideM.isPending}>Décider</Button>
                    <Button variant="outline" onClick={() => aOverrideM.mutate()} disabled={aOverrideM.isPending}>
                      Surcharger (override)
                    </Button>
                  </div>
                </CardContent></Card>

                <Card><CardContent className="p-4 space-y-3">
                  <div className="text-sm font-medium flex items-center gap-2"><DollarSign className="w-4 h-4" />Émettre un remboursement</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="number" value={refundAmt} onChange={(e) => setRefundAmt(e.target.value)} placeholder="Montant (XOF)" />
                    <Select value={refundMethod} onValueChange={(v) => setRefundMethod(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="wave">Wave</SelectItem>
                        <SelectItem value="orange_money">Orange Money</SelectItem>
                        <SelectItem value="cash">Espèces</SelectItem>
                        <SelectItem value="bank_transfer">Virement</SelectItem>
                        <SelectItem value="credit_note">Avoir</SelectItem>
                        <SelectItem value="other">Autre</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={() => aRefundM.mutate()} disabled={!refundAmt || aRefundM.isPending}>Émettre</Button>
                </CardContent></Card>

                <div className="flex gap-2">
                  {caseRow.status !== "closed" && <Button variant="outline" onClick={() => aCloseM.mutate()}>Clôturer</Button>}
                  {caseRow.status === "closed" && <Button variant="outline" onClick={() => aReopenM.mutate()}>Réouvrir</Button>}
                </div>
              </>
            )}

            {role === "client" && (
              <div className="text-sm text-muted-foreground">
                Votre dossier est en cours de traitement. Vous serez notifié de la décision.
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-2">
            {(actions.data ?? []).map((a: any) => (
              <div key={a.id} className="text-xs border-l-2 pl-2 py-1">
                <div className="flex justify-between">
                  <span className="font-medium">{a.action_type}</span>
                  <span className="text-muted-foreground">{new Date(a.created_at).toLocaleString("fr-FR")}</span>
                </div>
                <div className="text-muted-foreground">{a.actor_role}{a.note ? ` — ${a.note}` : ""}</div>
              </div>
            ))}
            {(actions.data ?? []).length === 0 && <div className="text-sm text-muted-foreground text-center py-4">Aucune action</div>}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
