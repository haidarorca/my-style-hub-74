import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";

export const Route = createFileRoute("/vendor/messages")({
  component: VendorMessages,
});

function VendorMessages() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Messages clients</h1>
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card p-10 text-center">
        <MessageSquare className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-sm font-medium">Aucun message pour le moment</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Les messages de vos clients apparaîtront ici prochainement.
        </p>
      </div>
    </div>
  );
}
