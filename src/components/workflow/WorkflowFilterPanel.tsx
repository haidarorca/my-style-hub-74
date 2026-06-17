import { useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Filter, X, SlidersHorizontal, Calendar as CalIcon,
  Globe, Tag, CreditCard, Package, Clock, DollarSign, AlertCircle,
} from "lucide-react";
import type { FilterState } from "@/hooks/use-workflow-filters";

interface Props {
  filters: FilterState;
  activeCount: number;
  options: {
    countries: string[];
    orderTypes: string[];
    logisticsStatuses: string[];
    maxAmount: number;
    maxDays: number;
  };
  filteredCount: number;
  totalCount: number;
  onUpdate: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  onToggleArray: <K extends keyof FilterState>(key: K, value: string) => void;
  onReset: () => void;
}

/* ═══════════════════════════════════════════════════════════════
   WORKFLOW FILTER PANEL — Filtres combinatoires style Excel
   ═══════════════════════════════════════════════════════════════ */

export function WorkflowFilterPanel({
  filters,
  activeCount,
  options,
  filteredCount,
  totalCount,
  onUpdate,
  onToggleArray,
  onReset,
}: Props) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 relative">
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Filtres</span>
          {activeCount > 0 && (
            <Badge variant="default" className="h-5 w-5 p-0 text-[10px] flex items-center justify-center rounded-full">
              {activeCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="border-b pb-3 mb-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filtres avancés
            </SheetTitle>
            {activeCount > 0 && (
              <Button variant="ghost" size="sm" onClick={onReset} className="h-7 text-xs gap-1">
                <X className="h-3 w-3" />
                Réinitialiser
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {filteredCount} commande{filteredCount > 1 ? "s" : ""} sur {totalCount}
          </p>
        </SheetHeader>

        <div className="space-y-6 pr-2">
          {/* ── RECHERCHE ── */}
          <FilterSection icon={<SlidersHorizontal className="h-3.5 w-3.5" />} title="Recherche">
            <Input
              placeholder="Nom, téléphone, ID, tracking..."
              value={filters.search}
              onChange={(e) => onUpdate("search", e.target.value)}
              className="h-8 text-sm"
            />
          </FilterSection>

          {/* ── PAYS ── */}
          {options.countries.length > 0 && (
            <FilterSection icon={<Globe className="h-3.5 w-3.5" />} title="Pays">
              <div className="flex flex-wrap gap-1.5">
                {options.countries.map((c) => (
                  <FilterChip
                    key={c}
                    label={c}
                    active={filters.countries.includes(c)}
                    onClick={() => onToggleArray("countries", c)}
                  />
                ))}
              </div>
            </FilterSection>
          )}

          {/* ── TYPE ── */}
          <FilterSection icon={<Tag className="h-3.5 w-3.5" />} title="Type de commande">
            <div className="flex flex-wrap gap-1.5">
              {["local", "import", "mixed"].map((t) => (
                <FilterChip
                  key={t}
                  label={TYPE_LABELS[t] ?? t}
                  active={filters.orderTypes.includes(t)}
                  onClick={() => onToggleArray("orderTypes", t)}
                />
              ))}
            </div>
          </FilterSection>

          {/* ── STATUT LOGISTIQUE ── */}
          <FilterSection icon={<Package className="h-3.5 w-3.5" />} title="Statut logistique">
            <div className="flex flex-wrap gap-1.5">
              {[
                { key: "new", label: "Nouvelle" },
                { key: "confirmed", label: "Confirmée" },
                { key: "awaiting_weighing", label: "À peser" },
                { key: "fees_calculated", label: "Frais calculés" },
                { key: "awaiting_client_validation", label: "Attente client" },
                { key: "validated", label: "Validée" },
                { key: "ready_to_ship", label: "Prête" },
                { key: "shipped", label: "Expédiée" },
                { key: "delivered", label: "Livrée" },
                { key: "rejected", label: "Rejetée" },
              ].map((s) => (
                <FilterChip
                  key={s.key}
                  label={s.label}
                  active={filters.logisticsStatuses.includes(s.key)}
                  onClick={() => onToggleArray("logisticsStatuses", s.key)}
                />
              ))}
            </div>
          </FilterSection>

          {/* ── STATUT PAIEMENT ── */}
          <FilterSection icon={<CreditCard className="h-3.5 w-3.5" />} title="Statut paiement">
            <div className="flex flex-wrap gap-1.5">
              {[
                { key: "paid", label: "Payé", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
                { key: "partial", label: "Partiel", color: "bg-amber-100 text-amber-700 border-amber-300" },
                { key: "pending", label: "Non payé", color: "bg-red-100 text-red-700 border-red-300" },
                { key: "cod", label: "À réception", color: "bg-blue-100 text-blue-700 border-blue-300" },
              ].map((s) => (
                <FilterChip
                  key={s.key}
                  label={s.label}
                  active={filters.paymentStatuses.includes(s.key)}
                  onClick={() => onToggleArray("paymentStatuses", s.key)}
                  activeClass={s.color}
                />
              ))}
            </div>
          </FilterSection>

          {/* ── DETTE ── */}
          <FilterSection icon={<AlertCircle className="h-3.5 w-3.5" />} title="Dette">
            <div className="flex flex-wrap gap-1.5">
              <FilterChip
                label="Avec dette"
                active={filters.hasDebt === true}
                onClick={() => onUpdate("hasDebt", filters.hasDebt === true ? null : true)}
                activeClass="bg-red-100 text-red-700 border-red-300"
              />
              <FilterChip
                label="Soldé"
                active={filters.hasDebt === false}
                onClick={() => onUpdate("hasDebt", filters.hasDebt === false ? null : false)}
                activeClass="bg-emerald-100 text-emerald-700 border-emerald-300"
              />
            </div>
          </FilterSection>

          {/* ── DATE ── */}
          <FilterSection icon={<CalIcon className="h-3.5 w-3.5" />} title="Date de création">
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs flex-1">
                    {filters.dateFrom ? format(new Date(filters.dateFrom), "dd/MM/yyyy", { locale: fr }) : "Du"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filters.dateFrom ? new Date(filters.dateFrom) : undefined}
                    onSelect={(d) => onUpdate("dateFrom", d ? format(d, "yyyy-MM-dd") : null)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs flex-1">
                    {filters.dateTo ? format(new Date(filters.dateTo), "dd/MM/yyyy", { locale: fr }) : "Au"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filters.dateTo ? new Date(filters.dateTo) : undefined}
                    onSelect={(d) => onUpdate("dateTo", d ? format(d, "yyyy-MM-dd") : null)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </FilterSection>

          {/* ── MONTANT ── */}
          <FilterSection icon={<DollarSign className="h-3.5 w-3.5" />} title={`Montant (max ${formatF(options.maxAmount)})`}>
            <RangeSlider
              max={options.maxAmount}
              minValue={filters.amountMin ?? 0}
              maxValue={filters.amountMax ?? options.maxAmount}
              onChange={(min, max) => {
                onUpdate("amountMin", min > 0 ? min : null);
                onUpdate("amountMax", max < options.maxAmount ? max : null);
              }}
              format={formatF}
            />
          </FilterSection>

          {/* ── JOURS D'ATTENTE ── */}
          <FilterSection icon={<Clock className="h-3.5 w-3.5" />} title={`Jours d'attente (max ${options.maxDays})`}>
            <RangeSlider
              max={options.maxDays}
              minValue={filters.daysMin ?? 0}
              maxValue={filters.daysMax ?? options.maxDays}
              onChange={(min, max) => {
                onUpdate("daysMin", min > 0 ? min : null);
                onUpdate("daysMax", max < options.maxDays ? max : null);
              }}
              format={(v) => `${v}j`}
            />
          </FilterSection>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-background border-t pt-3 mt-6 pb-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {filteredCount} résultat{filteredCount > 1 ? "s" : ""}
            </span>
            {activeCount > 0 && (
              <Button variant="ghost" size="sm" onClick={onReset} className="h-7 text-xs gap-1">
                <X className="h-3 w-3" />
                Tout effacer ({activeCount})
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ── Sous-composants ─────────────────────────────────────── */

function FilterSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
        {icon} {title}
      </h3>
      {children}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  activeClass,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  activeClass?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all",
        active
          ? activeClass ?? "bg-primary text-primary-foreground border-primary"
          : "bg-white text-muted-foreground border-gray-200 hover:border-gray-300"
      )}
    >
      {label}
    </button>
  );
}

function RangeSlider({
  max,
  minValue,
  maxValue,
  onChange,
  format,
}: {
  max: number;
  minValue: number;
  maxValue: number;
  onChange: (min: number, max: number) => void;
  format: (v: number) => string;
}) {
  const step = Math.max(1, Math.round(max / 100));
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{format(minValue)}</span>
        <span>{format(maxValue)}</span>
      </div>
      <Slider
        value={[minValue, maxValue]}
        max={max}
        step={step}
        onValueChange={([min, maxVal]) => onChange(min, maxVal)}
        className="w-full"
      />
      <div className="flex gap-2">
        <Input
          type="number"
          value={minValue || ""}
          onChange={(e) => onChange(Number(e.target.value) || 0, maxValue)}
          placeholder="Min"
          className="h-7 text-xs"
        />
        <Input
          type="number"
          value={maxValue === max ? "" : maxValue}
          onChange={(e) => onChange(minValue, Number(e.target.value) || max)}
          placeholder="Max"
          className="h-7 text-xs"
        />
      </div>
    </div>
  );
}

const TYPE_LABELS: Record<string, string> = {
  local: "Local",
  import: "Import",
  mixed: "Mixte",
};

function formatF(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
}
