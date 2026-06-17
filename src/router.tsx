import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Fresh client per request (SSR-safe). Defaults are tuned for an
  // app with many listings: data stays fresh long enough to avoid
  // refetch storms on tab switches but short enough to feel live.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000, // 30s
        gcTime: 10 * 60_000, // 10min
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0, // Let Query control caching.
  });

  return router;
};
