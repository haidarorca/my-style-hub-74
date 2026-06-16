import { createFileRoute } from "@tanstack/react-router";
import ArchiveCenter from "@/cockpit/pages/ArchiveCenter";

export const Route = createFileRoute("/admin/cockpit/archive")({
  component: ArchiveCenter,
});
