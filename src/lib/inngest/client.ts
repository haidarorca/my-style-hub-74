import { Inngest } from "inngest";

// Inngest client. INNGEST_SIGNING_KEY is read automatically by serve()
// for incoming request verification. We send events via the Lovable
// connector gateway (proxy) instead of inn.gs directly.
export const inngest = new Inngest({ id: "kawzone" });

const GATEWAY_URL = "https://connector-gateway.lovable.dev/inngest";

export type InngestEvent =
  | { name: "translation/sync.requested"; data: Record<string, never> }
  | { name: "stats/refresh.requested"; data: Record<string, never> }
  | { name: "cleanup/expired-codes.requested"; data: Record<string, never> }
  | { name: "product/changed"; data: { product_id: string } };

/**
 * Send an event to Inngest through the Lovable gateway.
 * Fire-and-forget: failures are logged but do not throw to caller.
 */
export async function sendInngestEvent(event: InngestEvent): Promise<void> {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const INNGEST_API_KEY = process.env.INNGEST_API_KEY;
  if (!LOVABLE_API_KEY || !INNGEST_API_KEY) {
    console.warn("[inngest] keys missing, skipping event", event.name);
    return;
  }
  try {
    const res = await fetch(`${GATEWAY_URL}/e/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": INNGEST_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });
    if (!res.ok) {
      console.warn("[inngest] send failed", res.status, await res.text());
    }
  } catch (err) {
    console.warn("[inngest] send error", err);
  }
}
