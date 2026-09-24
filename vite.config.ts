// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
// Version unique de chaque publication (même valeur pour le navigateur et le
// serveur, car calculée une seule fois par construction).
const d = new Date();
const pad = (n: number) => String(n).padStart(2, "0");
const KAWZONE_VERSION = `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}.${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;

export default defineConfig({
  vite: {
    define: { __KAWZONE_VERSION__: JSON.stringify(KAWZONE_VERSION) },
  },
  tanstackStart: {
    server: { entry: "server" },
  },
});
