import { createFileRoute } from "@tanstack/react-router";

// Réveil du travailleur d'import CJ (appelé chaque minute par le planificateur
// de la base). Aucun paramètre accepté : il ne fait qu'avancer les imports
// DÉJÀ créés par un administrateur (jamais les annulés/en pause) et lancer
// les règles programmées actives. Un bail exclusif par job empêche tout
// double traitement, même en cas d'appels répétés.
export const Route = createFileRoute("/api/public/cj-worker")({
  server: {
    handlers: {
      POST: async () => {
        const { runWorkerTick } = await import("@/lib/cj/jobs.server");
        try {
          const r = await runWorkerTick(50_000);
          return Response.json({ ok: true, created: r.created, jobs: r.jobs.length });
        } catch (e) {
          return Response.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
        }
      },
    },
  },
});
