import { createFileRoute } from "@tanstack/react-router";
import DailyClose from "@/cockpit/pages/DailyClose";

export const Route = createFileRoute("/admin/cockpit/daily")({
  component: DailyClose,
});
