import {
  Shirt,
  Sparkles,
  Baby,
  Smartphone,
  Home,
  Wrench,
  Dumbbell,
  Car,
  HeartPulse,
  UtensilsCrossed,
  PawPrint,
  Briefcase,
  Gamepad2,
  BookOpen,
  Luggage,
  Tag,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Shirt,
  Sparkles,
  Baby,
  Smartphone,
  Home,
  Wrench,
  Dumbbell,
  Car,
  HeartPulse,
  UtensilsCrossed,
  PawPrint,
  Briefcase,
  Gamepad2,
  BookOpen,
  Luggage,
  Tag,
};

interface Props {
  logoUrl?: string | null;
  name: string;
  className?: string;
  iconClassName?: string;
}

/**
 * Renders a category icon.
 * - If logo_url starts with "lucide:" → renders the matching Lucide icon (modern outline).
 * - Else if it's a URL → renders an <img>.
 * - Fallback → first letter of the name.
 */
export function CategoryIcon({ logoUrl, name, className, iconClassName }: Props) {
  const wrapper =
    className ??
    "flex h-full w-full items-center justify-center bg-gradient-to-br from-accent to-muted text-foreground transition-transform duration-200 active:scale-95";
  const iconCls = iconClassName ?? "h-1/2 w-1/2";

  if (logoUrl?.startsWith("lucide:")) {
    const key = logoUrl.slice(7);
    const Icon = ICONS[key] ?? Tag;
    return (
      <div className={wrapper}>
        <Icon className={iconCls} strokeWidth={1.75} aria-hidden />
      </div>
    );
  }

  if (logoUrl) {
    return <img src={logoUrl} alt={name} className="h-full w-full object-cover" loading="lazy" />;
  }

  return (
    <div className={wrapper}>
      <span className="text-base font-bold text-primary">{name.charAt(0).toUpperCase()}</span>
    </div>
  );
}
