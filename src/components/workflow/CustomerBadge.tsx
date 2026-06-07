import type { CustomerSnapshot } from "@/types/workflow";

interface Props {
  customer?: CustomerSnapshot;
  compact?: boolean;
}

const TIER_CONFIG = {
  new: { icon: "🥉", label: "Nouveau", className: "bg-gray-100 text-gray-700" },
  regular: { icon: "🥈", label: "Régulier", className: "bg-blue-50 text-blue-700" },
  vip: { icon: "🥇", label: "VIP", className: "bg-amber-50 text-amber-700" },
  blocked: { icon: "🚫", label: "Bloqué", className: "bg-red-100 text-red-700" },
};

export function CustomerBadge({ customer, compact }: Props) {
  if (!customer) return null;

  const tier = TIER_CONFIG[customer.tier] ?? TIER_CONFIG.new;

  /* Mode compact (mobile) : emoji seul avec tooltip */
  if (compact) {
    return (
      <span
        className="text-[10px] shrink-0"
        title={`${tier.label} · ${customer.order_count} commandes · Solde: ${customer.total_remaining.toLocaleString("fr-FR")} FCFA`}
      >
        {tier.icon}
      </span>
    );
  }

  /* Mode standard (desktop) : badge complet */
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${tier.className}`}
        title={`${tier.label} · ${customer.order_count} commandes · Solde: ${customer.total_remaining.toLocaleString("fr-FR")} FCFA`}
      >
        <span>{tier.icon}</span>
        <span>{tier.label}</span>
      </span>
      {customer.total_remaining > 0 && (
        <span className="text-[10px] text-red-600 font-medium">
          {customer.total_remaining.toLocaleString("fr-FR")} FCFA
        </span>
      )}
    </div>
  );
}

export function CustomerTierIcon({ tier }: { tier?: string }) {
  if (!tier) return null;
  const config = TIER_CONFIG[tier as keyof typeof TIER_CONFIG];
  if (!config) return null;
  return (
    <span
      className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[8px] ${config.className}`}
      title={config.label}
    >
      {config.icon}
    </span>
  );
}
