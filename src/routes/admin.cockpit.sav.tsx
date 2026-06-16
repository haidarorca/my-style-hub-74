import { createFileRoute } from "@tanstack/react-router";
import SavCenter from "@/cockpit/pages/SavCenter";

export const Route = createFileRoute("/admin/cockpit/sav")({
  component: SavCenter,
});
