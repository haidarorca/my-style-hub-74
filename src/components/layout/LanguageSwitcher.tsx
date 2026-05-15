import { Globe, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/hooks/use-i18n";
import { LANG_META, SUPPORTED_LANGS, type Lang } from "@/lib/i18n/translations";

interface Props {
  variant?: "icon" | "compact";
}

export function LanguageSwitcher({ variant = "icon" }: Props) {
  const { lang, setLang, t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={variant === "icon" ? "icon" : "sm"}
          className={variant === "icon" ? "h-8 w-8 rounded-full sm:h-9 sm:w-9" : "h-8 rounded-full px-2 text-xs"}
          aria-label={t("common.language")}
        >
          {variant === "icon" ? (
            <Globe className="h-[18px] w-[18px]" />
          ) : (
            <span className="flex items-center gap-1">
              <Globe className="h-3.5 w-3.5" /> {lang.toUpperCase()}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>{t("common.language")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SUPPORTED_LANGS.map((l: Lang) => (
          <DropdownMenuItem key={l} onClick={() => setLang(l)} className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span aria-hidden>{LANG_META[l].flag}</span>
              {LANG_META[l].nativeLabel}
            </span>
            {lang === l && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
