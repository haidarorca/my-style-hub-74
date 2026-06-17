import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { ConversationList, ConversationDetail } from "@/routes/messages";

export const Route = createFileRoute("/admin/support")({
  component: () => <PermissionGate perm="support"><AdminSupport /></PermissionGate>,
});

function AdminSupport() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Centre de support</h1>
      {selected ? (
        <ConversationDetail id={selected} onBack={() => setSelected(null)} />
      ) : (
        <ConversationList scope="admin" onSelect={setSelected} />
      )}
    </div>
  );
}
