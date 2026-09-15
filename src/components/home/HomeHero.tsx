import { Link } from "@tanstack/react-router";
import { MoveRight, BadgeCheck, Layers, Truck, Headset } from "lucide-react";

/**
 * Vitrine d'accueil KawZone — bannière éditoriale
 * (utilisée quand aucune bannière image n'est configurée).
 */
export function HomeHero({ title, subtitle }: { title?: string | null; subtitle?: string | null }) {
  return (
    <section className="relative mt-4 overflow-hidden rounded-[calc(var(--radius)+8px)] border border-border bg-[oklch(0.24_0.03_260)] text-[oklch(0.97_0.005_250)] shadow-[var(--shadow-card)]">
      {/* Halo cuivre discret */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-45 blur-3xl"
        style={{ background: "var(--brand)" }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
        style={{ backgroundImage: "var(--gradient-flash)" }}
      />

      <div className="relative grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.15fr_auto] lg:items-end">
        <div className="min-w-0">
          <p className="kz-eyebrow text-[oklch(0.86_0.09_70)]">Marketplace KawZone</p>
          <h1 className="mt-3 max-w-2xl text-[clamp(1.6rem,6vw,3rem)] font-bold leading-[1.05]">
            {title || "Acheter mieux, partout au Sénégal."}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-[oklch(0.86_0.01_250)] sm:text-base">
            {subtitle ||
              "Mode, maison, électronique, alimentation et services — des boutiques vérifiées, un prix clair, une livraison suivie."}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              to="/categories"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-[oklch(0.97_0.005_250)] px-5 text-sm font-semibold text-[oklch(0.24_0.03_260)] transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 active:scale-[0.97]"
            >
              Explorer le catalogue <MoveRight className="h-4 w-4" />
            </Link>
            <Link
              to="/search"
              search={{ q: "" }}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-[oklch(0.97_0.005_250/0.25)] px-5 text-sm font-semibold text-[oklch(0.95_0.005_250)] transition-colors hover:bg-[oklch(0.97_0.005_250/0.1)]"
            >
              Rechercher un produit
            </Link>
          </div>
        </div>

        <ul className="grid w-full grid-cols-2 gap-x-6 gap-y-4 border-t border-[oklch(0.97_0.005_250/0.14)] pt-6 lg:w-64 lg:grid-cols-1 lg:gap-y-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          {[
            { icon: BadgeCheck, label: "Boutiques vérifiées" },
            { icon: Layers, label: "Catalogue multi-univers" },
            { icon: Truck, label: "Livraison suivie" },
            { icon: Headset, label: "Support réactif" },
          ].map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-2.5 text-[0.8125rem] font-medium">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[oklch(0.97_0.005_250/0.12)]">
                <Icon className="h-[17px] w-[17px] text-[oklch(0.86_0.09_70)]" />
              </span>
              <span className="min-w-0 leading-snug text-[oklch(0.9_0.008_250)]">{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
