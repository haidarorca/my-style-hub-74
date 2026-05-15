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
  const { t, dir } = useI18n();
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
      className={`-ml-2 h-9 gap-1 rounded-full px-2 text-sm font-medium ${className ?? ""}`}
    >
      <ArrowLeft className={`h-4 w-4 ${dir === "rtl" ? "rotate-180" : ""}`} />
      {finalLabel}
    </Button>
  );
}
