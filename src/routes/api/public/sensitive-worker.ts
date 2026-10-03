import { createFileRoute } from "@tanstack/react-router";

// Réveil de la file OpenAI Vision (planificateur, toutes les 5 min).
// Aucun paramètre : traite seulement les images DÉJÀ mises en file par
// l'analyse ou un administrateur, dans la limite horaire configurée.
// Verrou exclusif + pause persistée (429/quota/clé) : jamais de boucle d'appels.
export const Route = createFileRoute("/api/public/sensitive-worker")({
  server: {
    handlers: {
      POST: async () => {
        const { runVisionTick, sbAdmin } = await import("@/lib/sensitive/vision.server");
        try {
          // Nouveaux produits (CJ, CSV, Excel…) : règles validées appliquées automatiquement, SANS appel IA.
          const { runBatchCore } = await import("@/lib/sensitive.functions");
          const sb = await sbAdmin();
          let classified = 0;
          for (let i = 0; i < 3; i++) {
            const b = await runBatchCore(sb, { ai: false, limit: 300 });
            classified += b.processed;
            if (!b.processed) break;
          }
          const r = await runVisionTick(30_000);
          return Response.json({ ok: true, classified, ...r });
        } catch {
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
