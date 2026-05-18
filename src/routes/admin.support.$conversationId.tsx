import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { ConversationDetail } from "@/routes/messages";

export const Route = createFileRoute("/admin/support/$conversationId")({
  component: () => (
    <PermissionGate perm="support">
      <AdminSupportDetail />
    </PermissionGate>
  ),
});

function AdminSupportDetail() {
  const { conversationId } = Route.useParams();
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Conversation</h1>
      <ConversationDetail id={conversationId} onBack={() => navigate({ to: "/admin/support" })} />
    </div>
  );
}
