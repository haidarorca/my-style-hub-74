import { createFileRoute } from "@tanstack/react-router";
import FinanceCenter from "@/cockpit/pages/FinanceCenter";

export const Route = createFileRoute("/admin/cockpit/finance")({
  component: FinanceCenter,
});
