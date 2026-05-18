import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";

import appCss from "../styles.css?url";
import { installGlobalErrorLogger } from "@/lib/error-logger";
import { runPwaCleanup } from "@/lib/pwa-cleanup";
import { startBuildVersionWatcher } from "@/lib/build-version-watcher";
import { AuthProvider } from "@/hooks/use-auth";
import { SiteSettingsProvider } from "@/hooks/use-site-settings";
import { UiOverridesProvider } from "@/hooks/use-ui-overrides";
import { I18nProvider } from "@/hooks/use-i18n";
import { DeliveryCountryProvider } from "@/hooks/use-delivery-country";
import { PromoBar } from "@/components/layout/PromoBar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { SwipeNavigator } from "@/components/layout/SwipeNavigator";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/ErrorBoundary";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page introuvable</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Cette page n'existe pas ou a été déplacée.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            Retour à l'accueil
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Une erreur est survenue
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            Réessayer
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Accueil
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Kawzone — Marketplace Shopping" },
      { name: "description", content: "Marketplace moderne au Sénégal : vêtements, accessoires, maison, électronique et plus." },
      { name: "theme-color", content: "#e5277a" },
      { property: "og:title", content: "Kawzone — Marketplace Shopping" },
      { name: "twitter:title", content: "Kawzone — Marketplace Shopping" },
      { property: "og:description", content: "Marketplace moderne au Sénégal : vêtements, accessoires, maison, électronique et plus." },
      { name: "twitter:description", content: "Marketplace moderne au Sénégal : vêtements, accessoires, maison, électronique et plus." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/e7eef435-ad39-4663-8cab-2411ae8231c0" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/e7eef435-ad39-4663-8cab-2411ae8231c0" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "Kawzone" },
      { name: "application-name", content: "Kawzone" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AuthInvalidator() {
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      router.invalidate();
      queryClient.invalidateQueries();
    });
    return () => subscription.unsubscribe();
  }, [router, queryClient]);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => { installGlobalErrorLogger(); runPwaCleanup(); startBuildVersionWatcher(); }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <I18nProvider>
          <SiteSettingsProvider>
            <UiOverridesProvider>
              <DeliveryCountryProvider>
                <AuthInvalidator />
                <PromoBar />
                <ErrorBoundary label="Application" resetKey={pathname}>
                  <SwipeNavigator><Outlet /></SwipeNavigator>
                </ErrorBoundary>
                <MobileBottomNav />
                <Toaster richColors position="top-center" />
              </DeliveryCountryProvider>
            </UiOverridesProvider>
          </SiteSettingsProvider>
        </I18nProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
