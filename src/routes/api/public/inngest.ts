import { createFileRoute } from "@tanstack/react-router";
import { serve } from "inngest/edge";
import { inngest } from "@/lib/inngest/client";
import { inngestFunctions } from "@/lib/inngest/functions.server";

// Inngest serve endpoint. The Inngest cloud calls this URL to invoke
// scheduled jobs and event-driven functions. Signature verification is
// performed automatically via INNGEST_SIGNING_KEY.
const handler = serve({ client: inngest, functions: inngestFunctions });

export const Route = createFileRoute("/api/public/inngest")({
  server: {
    handlers: {
      GET: async ({ request }) => handler(request),
      POST: async ({ request }) => handler(request),
      PUT: async ({ request }) => handler(request),
    },
  },
});
