import { createFileRoute } from "@tanstack/react-router";
import CockpitNext from "@/cockpit/pages/CockpitNext";

export const Route = createFileRoute("/admin/cockpit-next")({
  component: CockpitNext,
});
