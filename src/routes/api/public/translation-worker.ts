import { createFileRoute } from "@tanstack/react-router";

// Réveil du Centre de traduction (planifié chaque minute uniquement tant qu'une
// tâche lancée par un administrateur est active). Aucun paramètre accepté :
// il ne fait qu'avancer une tâche existante ; un bail exclusif évite tout doublon.
export const Route = createFileRoute("/api/public/translation-worker")({
  server: {
    handlers: {
      POST: async () => {
        const { runTranslationTick } = await import("@/lib/translation/center.server");
        try {
          return Response.json(await runTranslationTick());
        } catch (e) {
          return Response.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
        }
      },
    },
  },
});
