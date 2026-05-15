import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Languages, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import { LANG_META, SUPPORTED_LANGS, type Lang } from "@/lib/i18n/translations";
import { translateText } from "@/lib/translate.functions";
import { toast } from "sonner";

export type I18nMap = Partial<Record<Lang, string>>;

interface CommonProps {
  label: string;
  baseValue: string;
  onBaseChange: (v: string) => void;
  i18nValue: I18nMap;
  onI18nChange: (v: I18nMap) => void;
  required?: boolean;
  placeholder?: string;
}

interface InputProps extends CommonProps {
  multiline?: false;
}

interface TextareaProps extends CommonProps {
  multiline: true;
  rows?: number;
}

type Props = InputProps | TextareaProps;

/**
 * 3-tab multilingual input (FR / EN / AR).
 * - FR is the base value (lives in legacy column).
 * - EN/AR live in a JSONB i18n map.
 * - "Translate from French" button auto-fills the active tab using Lovable AI.
 *
 * Brand names, prices and codes should NEVER be passed through this — only
 * names/designations/descriptions/marketing copy.
 */
export function MultilingualInput(props: Props) {
  const { t } = useI18n();
  const [active, setActive] = useState<Lang>("fr");
  const [translating, setTranslating] = useState(false);
  const translate = useServerFn(translateText);

  const value = active === "fr" ? props.baseValue : (props.i18nValue[active] ?? "");

  const setValue = (v: string) => {
    if (active === "fr") {
      props.onBaseChange(v);
    } else {
      props.onI18nChange({ ...props.i18nValue, [active]: v });
    }
  };

  const handleTranslate = async () => {
    if (active === "fr") return;
    if (!props.baseValue.trim()) {
      toast.error("Veuillez d’abord saisir le texte en français");
      return;
    }
    setTranslating(true);
    try {
      const res = await translate({ data: { text: props.baseValue, from: "fr", to: active } });
      if (res.text) {
        props.onI18nChange({ ...props.i18nValue, [active]: res.text });
      }
      if ("error" in res && res.error) {
        toast.error("Traduction indisponible");
      }
    } finally {
      setTranslating(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm">
          {props.label}
          {props.required && <span className="ml-1 text-destructive">*</span>}
        </Label>
        <div className="flex items-center gap-1">
          {SUPPORTED_LANGS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setActive(l)}
              className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                active === l
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
              aria-pressed={active === l}
              aria-label={LANG_META[l].nativeLabel}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {props.multiline ? (
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={props.placeholder}
          rows={props.rows ?? 4}
          dir={active === "ar" ? "rtl" : "ltr"}
        />
      ) : (
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={props.placeholder}
          dir={active === "ar" ? "rtl" : "ltr"}
        />
      )}

      {active !== "fr" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleTranslate}
          disabled={translating || !props.baseValue.trim()}
          className="h-7 text-[11px]"
        >
          {translating ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Languages className="mr-1 h-3 w-3" />
          )}
          {t("lang.translate_from_fr")}
        </Button>
      )}
    </div>
  );
}
