// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import Admin1WorkflowCenter from "@/admin1/pages/WorkflowCenter";

export const Route = createFileRoute("/admin/admin1")({
  component: Admin1WorkflowCenter,
});
