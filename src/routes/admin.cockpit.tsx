import { createFileRoute } from "@tanstack/react-router";
import CockpitDashboard from "@/cockpit/pages/Dashboard";

export const Route = createFileRoute("/admin/cockpit")({
  component: CockpitDashboard,
});
