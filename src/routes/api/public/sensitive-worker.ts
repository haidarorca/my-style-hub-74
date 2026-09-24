import { createFileRoute } from "@tanstack/react-router";

// Réveil de la file OpenAI Vision (planificateur, toutes les 5 min).
// Aucun paramètre : traite seulement les images DÉJÀ mises en file par
// l'analyse ou un administrateur, dans la limite horaire configurée.
// Verrou exclusif + pause persistée (429/quota/clé) : jamais de boucle d'appels.
export const Route = createFileRoute("/api/public/sensitive-worker")({
  server: {
    handlers: {
      POST: async () => {
        const { runVisionTick } = await import("@/lib/sensitive/vision.server");
        try {
          const r = await runVisionTick(45_000);
          return Response.json({ ok: true, ...r });
        } catch {
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
