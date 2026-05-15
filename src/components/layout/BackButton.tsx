import { ArrowLeft } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";

interface BackButtonProps {
  label?: string;
  fallbackTo?: string;
  className?: string;
}

export function BackButton({ label, fallbackTo = "/", className }: BackButtonProps) {
  const router = useRouter();
  const { t } = useI18n();
  const finalLabel = label ?? t("common.back");

  const handleClick = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      router.navigate({ to: fallbackTo });
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className={`-ms-2 h-9 gap-1 rounded-full px-2 text-sm font-medium ${className ?? ""}`}
    >
      {/* Arrow auto-flips in RTL via global CSS rule on .lucide-arrow-left */}
      <ArrowLeft className="h-4 w-4" />
      {finalLabel}
    </Button>
  );
}
