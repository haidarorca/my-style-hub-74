import { createFileRoute, Link } from "@tanstack/react-router";
import { QrCode, ScanLine, Store } from "lucide-react";

export const Route = createFileRoute("/kawscan/")({
  head: () => ({
    meta: [
      { title: "KawScan — Prix en magasin" },
      { name: "description", content: "Scannez un produit et voyez son prix immédiatement. Outil de gestion des prix en magasin." },
      { property: "og:title", content: "KawScan — Prix en magasin" },
      { property: "og:description", content: "Scannez un produit et voyez son prix immédiatement." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KawscanLanding,
});

function KawscanLanding() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-12">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <ScanLine className="h-8 w-8 text-primary" />
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">KawScan</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Le prix de vos produits, affiché en un scan.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border p-4 text-sm">
        <p className="flex items-center gap-3"><QrCode className="h-4 w-4 text-primary" /> Le client scanne le QR du magasin.</p>
        <p className="flex items-center gap-3"><ScanLine className="h-4 w-4 text-primary" /> Il scanne le produit.</p>
        <p className="flex items-center gap-3"><Store className="h-4 w-4 text-primary" /> Le prix s'affiche immédiatement.</p>
      </div>

      <Link
        to="/kawscan/app"
        className="inline-flex h-12 items-center justify-center rounded-lg bg-primary px-4 font-semibold text-primary-foreground"
      >
        Espace commerçant
      </Link>
    </div>
  );
}
