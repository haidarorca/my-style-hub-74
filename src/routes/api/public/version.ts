import { createFileRoute } from "@tanstack/react-router";

// Version actuellement publiée — jamais mise en cache.
export const Route = createFileRoute("/api/public/version")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ version: __KAWZONE_VERSION__ }), {
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store, max-age=0" },
        }),
    },
  },
});
