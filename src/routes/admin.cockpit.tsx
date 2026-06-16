import { createFileRoute, Outlet } from "@tanstack/react-router";
import { z } from "zod";

// Deep-link params : permet à Cockpit Next (et à n'importe quel lien externe)
// d'ouvrir directement une commande sur sa section pertinente.
//   /admin/cockpit?orderId=<uuid>&focus=money
const searchSchema = z.object({
  orderId: z.string().optional(),
  focus: z.enum(["money"]).optional(),
});

export const Route = createFileRoute("/admin/cockpit")({
  validateSearch: searchSchema,
  component: () => <Outlet />,
});
