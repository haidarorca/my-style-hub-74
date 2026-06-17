import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ConversationList, ConversationDetail } from "@/routes/messages";

export const Route = createFileRoute("/vendor/messages")({
  component: VendorMessages,
});

function VendorMessages() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Messages clients</h1>
      <p className="text-xs text-muted-foreground">Les boutiques avec commission sont gérées directement par le service client.</p>
      {selected ? (
        <ConversationDetail id={selected} onBack={() => setSelected(null)} />
      ) : (
        <ConversationList scope="vendor" onSelect={setSelected} />
      )}
    </div>
  );
}
