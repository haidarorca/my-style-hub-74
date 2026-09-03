import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/kawscan")({
  component: () => (
    <div className="min-h-screen bg-background text-foreground">
      <Outlet />
    </div>
  ),
});
