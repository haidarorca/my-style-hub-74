import { Check, X } from "lucide-react";

export interface StrengthResult {
  score: number; // 0-4
  ok: boolean;
  checks: { label: string; pass: boolean }[];
}

export function checkPasswordStrength(pw: string): StrengthResult {
  const checks = [
    { label: "Au moins 8 caractères", pass: pw.length >= 8 },
    { label: "Une majuscule", pass: /[A-Z]/.test(pw) },
    { label: "Une minuscule", pass: /[a-z]/.test(pw) },
    { label: "Un chiffre", pass: /[0-9]/.test(pw) },
    { label: "Un caractère spécial", pass: /[^A-Za-z0-9]/.test(pw) },
  ];
  const score = checks.filter((c) => c.pass).length;
  // Require at least 4/5 (length + 3 categories) to be "ok"
  const ok = checks[0].pass && checks.filter((c) => c.pass).length >= 4;
  return { score, ok, checks };
}

export function PasswordStrengthMeter({ password }: { password: string }) {
  const { score, checks } = checkPasswordStrength(password);
  const colors = ["bg-muted", "bg-destructive", "bg-orange-500", "bg-yellow-500", "bg-lime-500", "bg-green-600"];
  const labels = ["", "Très faible", "Faible", "Moyen", "Fort", "Excellent"];
  if (!password) return null;
  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${i <= score ? colors[score] : "bg-muted"}`}
          />
        ))}
      </div>
      <p className="text-xs font-medium text-muted-foreground">{labels[score]}</p>
      <ul className="space-y-0.5">
        {checks.map((c) => (
          <li key={c.label} className="flex items-center gap-1.5 text-[11px]">
            {c.pass ? (
              <Check className="h-3 w-3 text-green-600" />
            ) : (
              <X className="h-3 w-3 text-muted-foreground" />
            )}
            <span className={c.pass ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
