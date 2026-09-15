import { Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck, Sparkles, Store, Truck } from "lucide-react";

/**
 * Vitrine d'accueil KawZone — bannière marketing
 * (utilisée quand aucune bannière image n'est configurée).
 */
export function HomeHero({ title, subtitle }: { title?: string | null; subtitle?: string | null }) {
  return (
    <section className="mt-3 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary via-primary to-primary/80 p-5 text-primary-foreground shadow-card sm:p-8">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-90">
        KawZone
      </p>
      <h1 className="mt-2 text-2xl font-extrabold leading-tight sm:text-4xl">
        {title || "La marketplace du Sénégal"}
      </h1>
      <p className="mt-2 max-w-xl text-sm opacity-90 sm:text-base">
        {subtitle || "Mode • Maison • Électronique • Accessoires — livrés partout au Sénégal"}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {[
          { icon: Store, label: "Boutiques vérifiées" },
          { icon: Truck, label: "Livraison rapide" },
          { icon: ShieldCheck, label: "Achat protégé" },
          { icon: Sparkles, label: "Nouveautés" },
        ].map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-semibold backdrop-blur-sm"
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </span>
        ))}
      </div>

      <Link
        to="/categories"
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary-foreground px-4 py-2.5 text-sm font-bold text-primary shadow-soft transition-transform active:scale-95"
      >
        Voir les produits <ArrowRight className="h-4 w-4" />
      </Link>
    </section>
  );
}
