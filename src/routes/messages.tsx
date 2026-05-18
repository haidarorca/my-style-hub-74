import { useState, useEffect, useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send, MessageSquare, ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { listConversations, getConversation, replyConversation } from "@/lib/support.functions";

export const Route = createFileRoute("/messages")({
  component: MessagesPage,
});

function MessagesPage() {
  const { user, loading } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);

  if (loading) return <div className="p-8 text-center text-sm text-muted-foreground">Chargement…</div>;
  if (!user)
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="page-container py-10 text-center">
          <p className="text-sm">Connectez-vous pour voir vos messages.</p>
          <Button asChild className="mt-4"><Link to="/login">Se connecter</Link></Button>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="page-container pb-safe">
        <h1 className="my-3 text-xl font-bold">Mes messages</h1>
        {selected ? (
          <ConversationDetail id={selected} onBack={() => setSelected(null)} />
        ) : (
          <ConversationList scope="client" onSelect={setSelected} />
        )}
      </main>
    </div>
  );
}

export function ConversationList({
  scope,
  onSelect,
}: {
  scope: "client" | "vendor" | "admin";
  onSelect: (id: string) => void;
}) {
  const listFn = useServerFn(listConversations);
  const { data, isLoading } = useQuery({
    queryKey: ["conversations", scope],
    queryFn: () => listFn({ data: { scope } }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  const rows = data ?? [];
  if (!rows.length)
    return (
      <div className="rounded-xl border border-dashed bg-card p-10 text-center">
        <MessageSquare className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
        <p className="text-sm">Aucune conversation pour l'instant.</p>
      </div>
    );

  const unreadKey = scope === "client" ? "unread_count_client" : scope === "vendor" ? "unread_count_vendor" : "unread_count_admin";

  return (
    <ul className="space-y-2">
      {rows.map((c) => {
        const unread = (c as unknown as Record<string, number>)[unreadKey] || 0;
        return (
          <li key={c.id}>
            <button
              onClick={() => onSelect(c.id)}
              className="flex w-full items-start gap-3 rounded-xl border bg-card p-3 text-left hover:bg-accent"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold">{c.subject}</p>
                  {unread > 0 && <Badge className="bg-rose-500 text-white">{unread}</Badge>}
                  <Badge variant="outline" className="ml-auto text-[10px]">{c.status}</Badge>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">{c.last_message_preview ?? "—"}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{new Date(c.last_message_at).toLocaleString()}</p>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function ConversationDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getConversation);
  const replyFn = useServerFn(replyConversation);
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["conversation", id],
    queryFn: () => getFn({ data: { conversationId: id } }),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data]);

  const mutation = useMutation({
    mutationFn: () => replyFn({ data: { conversationId: id, body: body.trim(), isInternalNote: internal } }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["conversation", id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  const viewerRole = data.viewerRole;

  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1"><ArrowLeft className="h-4 w-4" /> Retour</Button>
      <div className="rounded-xl border bg-card p-3">
        <p className="font-semibold">{data.conversation.subject}</p>
        <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
          <Badge variant="outline">{data.conversation.status}</Badge>
          <Badge variant="outline">{data.conversation.priority}</Badge>
          {data.conversation.is_commission_protected && (
            <Badge className="bg-amber-500 text-white">Commission protégée</Badge>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {data.messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-xl border p-3 text-sm ${
              m.is_internal_note
                ? "border-amber-300 bg-amber-50"
                : m.sender_role === viewerRole
                  ? "ml-8 bg-primary/10"
                  : "mr-8 bg-card"
            }`}
          >
            <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
              <span className="font-semibold uppercase">{m.sender_role}{m.is_internal_note ? " · note interne" : ""}</span>
              <span>{new Date(m.created_at).toLocaleString()}</span>
            </div>
            <p className="whitespace-pre-wrap">{m.body}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="space-y-2">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Votre réponse…" maxLength={5000} />
        {viewerRole === "admin" && (
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
            Note interne (visible admins uniquement)
          </label>
        )}
        <Button onClick={() => mutation.mutate()} disabled={!body.trim() || mutation.isPending} className="gap-1.5">
          <Send className="h-4 w-4" /> Envoyer
        </Button>
      </div>
    </div>
  );
}
