// ═══════════════════════════════════════════════════════════════
// CockpitFilterPanel — Moteur de filtres métier multi-dimensions.
// Mobile / Tablette  : Sheet plein écran à droite.
// Desktop (≥ lg)     : panneau inline dépliable au-dessus de la liste.
//
// AND entre catégories, OR à l'intérieur d'une catégorie.
// ═══════════════════════════════════════════════════════════════

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  Filter, X, Search, Globe, MapPin, Package2, Tag, ClipboardList,
  CreditCard, AlertOctagon, Calendar as CalIcon, Clock,
} from "lucide-react";
import type { CockpitFilterState } from "@/cockpit/lib/cockpit-filters";
import {
  OP_PROBLEMS, FINANCIAL_LABELS, type FinancialState, type OpProblemKey,
} from "@/cockpit/lib/cockpit-filters";

const STATUS_LABELS: Record<string, string> = {
  new: "À confirmer",
  confirmed: "Confirmée",
  preparing: "En préparation",
  ordered_supplier: "Commandée fournisseur",
  received_warehouse: "Reçue entrepôt",
  awaiting_weighing: "À peser",
  fees_calculated: "Frais calculés",
  payment_fees: "Paiement frais",
  ready: "Prête (local)",
  ready_delivery: "Prête (import)",
  shipped: "Expédiée",
  delivered: "Livrée",
  cancelled: "Annulée",
};

interface Props {
  filters: CockpitFilterState;
  count: number;
  total: number;
  filteredCount: number;
  options: {
    statuses: string[];
    vendorCountries: Array<[string, string]>;
    marketCountries: Array<[string, string]>;
    productOrigins: string[];
  };
  onUpdate: <K extends keyof CockpitFilterState>(k: K, v: CockpitFilterState[K]) => void;
  onToggleArray: <K extends keyof CockpitFilterState>(k: K, v: string) => void;
  onReset: () => void;
}

export function CockpitFilterPanel(props: Props) {
  const [openSheet, setOpenSheet] = useState(false);
  const [openInline, setOpenInline] = useState(false);

  const triggerBtn = (onClick: () => void) => (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors",
        props.count > 0
          ? "bg-orange-100 text-orange-700 border-orange-300"
          : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50",
      )}
    >
      <Filter className="h-3.5 w-3.5" />
      Filtres
      {props.count > 0 && (
        <Badge variant="default" className="h-4 min-w-4 px-1 text-[10px]">{props.count}</Badge>
      )}
    </button>
  );

  return (
    <>
      {/* Mobile + Tablette : Sheet */}
      <div className="lg:hidden">
        {triggerBtn(() => setOpenSheet(true))}
        <Sheet open={openSheet} onOpenChange={setOpenSheet}>
          <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
            <SheetHeader className="border-b p-4">
              <SheetTitle className="text-base flex items-center gap-2">
                <Filter className="h-4 w-4" /> Filtres Cockpit
              </SheetTitle>
              <p className="text-xs text-muted-foreground text-left">
                {props.filteredCount} / {props.total} sous-commandes
              </p>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-4">
              <PanelBody {...props} />
            </div>
            <div className="border-t p-3 flex items-center justify-between bg-background">
              <Button variant="ghost" size="sm" onClick={props.onReset} disabled={props.count === 0}>
                <X className="h-3.5 w-3.5 mr-1" /> Effacer ({props.count})
              </Button>
              <Button size="sm" onClick={() => setOpenSheet(false)}>Voir résultats</Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop : panneau inline dépliable */}
      <div className="hidden lg:block">
        {triggerBtn(() => setOpenInline(v => !v))}
        {openInline && (
          <div className="absolute left-0 right-0 mt-2 mx-4 bg-white border rounded-xl shadow-xl z-30">
            <div className="border-b p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                <span className="text-sm font-semibold">Filtres Cockpit</span>
                <span className="text-xs text-muted-foreground">
                  {props.filteredCount} / {props.total}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={props.onReset} disabled={props.count === 0}>
                  <X className="h-3.5 w-3.5 mr-1" /> Effacer ({props.count})
                </Button>
                <Button size="sm" variant="outline" onClick={() => setOpenInline(false)}>Fermer</Button>
              </div>
            </div>
            <div className="p-4 max-h-[70vh] overflow-y-auto">
              <PanelBody {...props} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Corps du panneau (partagé Sheet + Inline) ─────────────────

function PanelBody({ filters, options, onUpdate, onToggleArray }: Props) {
  return (
    <div className="space-y-5">
      {/* 1. Recherche */}
      <Section icon={<Search className="h-3.5 w-3.5" />} title="Recherche">
        <Input
          placeholder="Boutique, vendeur, téléphone, n° sous-commande, n° commande mère…"
          value={filters.search}
          onChange={e => onUpdate("search", e.target.value)}
          className="h-9 text-sm"
        />
      </Section>

      {/* 2. Type de gestion */}
      <Section icon={<Tag className="h-3.5 w-3.5" />} title="Type de gestion">
        <ChipRow>
          <Chip label="Boutique Admin" active={filters.mgmtTypes.includes("kawzone")} onClick={() => onToggleArray("mgmtTypes", "kawzone")} activeClass="bg-blue-600 text-white border-blue-700" />
          <Chip label="Boutique Commission" active={filters.mgmtTypes.includes("commission")} onClick={() => onToggleArray("mgmtTypes", "commission")} activeClass="bg-purple-600 text-white border-purple-700" />
        </ChipRow>
      </Section>

      {/* 3. Statut logistique */}
      <Section icon={<ClipboardList className="h-3.5 w-3.5" />} title="Statut logistique">
        <ChipRow>
          {options.statuses.length === 0 && <Empty>Aucun statut</Empty>}
          {options.statuses.map(s => (
            <Chip key={s} label={STATUS_LABELS[s] ?? s} active={filters.statuses.includes(s)} onClick={() => onToggleArray("statuses", s)} />
          ))}
        </ChipRow>
      </Section>

      {/* 4. Flux */}
      <Section icon={<Package2 className="h-3.5 w-3.5" />} title="Flux">
        <ChipRow>
          <Chip label="Local" active={filters.flows.includes("local")} onClick={() => onToggleArray("flows", "local")} activeClass="bg-emerald-600 text-white border-emerald-700" />
          <Chip label="Import" active={filters.flows.includes("import")} onClick={() => onToggleArray("flows", "import")} activeClass="bg-indigo-600 text-white border-indigo-700" />
        </ChipRow>
      </Section>

      {/* 5. Pays vendeur */}
      <Section icon={<Globe className="h-3.5 w-3.5" />} title="Pays vendeur" hint="Où le vendeur est basé">
        <SearchableChips
          items={options.vendorCountries}
          selected={filters.vendorCountries}
          onToggle={v => onToggleArray("vendorCountries", v)}
          emptyLabel="Aucun pays vendeur"
        />
      </Section>

      {/* 6. Marché de vente */}
      <Section icon={<MapPin className="h-3.5 w-3.5" />} title="Marché de vente" hint="Pays de destination">
        <SearchableChips
          items={options.marketCountries}
          selected={filters.marketCountries}
          onToggle={v => onToggleArray("marketCountries", v)}
          emptyLabel="Aucun marché"
        />
      </Section>

      {/* 7. Pays d'origine produit */}
      <Section icon={<Package2 className="h-3.5 w-3.5" />} title="Pays d'origine produit">
        <SearchableChips
          items={options.productOrigins.map(o => [o, o] as [string, string])}
          selected={filters.productOriginCountries}
          onToggle={v => onToggleArray("productOriginCountries", v)}
          emptyLabel="Aucune origine connue"
        />
      </Section>

      {/* 8. Situation financière */}
      <Section icon={<CreditCard className="h-3.5 w-3.5" />} title="Situation financière">
        <ChipRow>
          {(Object.keys(FINANCIAL_LABELS) as FinancialState[]).map(k => (
            <Chip
              key={k}
              label={FINANCIAL_LABELS[k]}
              active={filters.financial.includes(k)}
              onClick={() => onToggleArray("financial", k)}
              activeClass={k === "none" ? "bg-gray-600 text-white border-gray-700" : "bg-amber-100 text-amber-800 border-amber-300"}
            />
          ))}
        </ChipRow>
      </Section>

      {/* 9. Problèmes opérationnels */}
      <Section icon={<AlertOctagon className="h-3.5 w-3.5" />} title="Problèmes opérationnels">
        <ChipRow>
          {OP_PROBLEMS.map(p => (
            <Chip
              key={p.key}
              label={p.label}
              active={filters.opProblems.includes(p.key as OpProblemKey)}
              onClick={() => onToggleArray("opProblems", p.key)}
              activeClass={p.tone === "red" ? "bg-red-100 text-red-800 border-red-300" : "bg-amber-100 text-amber-800 border-amber-300"}
            />
          ))}
        </ChipRow>
      </Section>

      {/* 10. Dates */}
      <Section icon={<CalIcon className="h-3.5 w-3.5" />} title="Date de création">
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" value={filters.dateFrom ?? ""} onChange={e => onUpdate("dateFrom", e.target.value || null)} className="h-8 text-xs" />
          <Input type="date" value={filters.dateTo ?? ""} onChange={e => onUpdate("dateTo", e.target.value || null)} className="h-8 text-xs" />
        </div>
      </Section>

      {/* 11. Ancienneté */}
      <Section icon={<Clock className="h-3.5 w-3.5" />} title="Ancienneté (jours)">
        <DaysRange filters={filters} onUpdate={onUpdate} />
      </Section>
    </div>
  );
}

// ─── Sous-composants ───────────────────────────────────────────

function Section({ icon, title, hint, children }: { icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-1.5">
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-700 flex items-center gap-1.5">
          {icon} {title}
        </h3>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

function Chip({ label, active, onClick, activeClass }: { label: string; active: boolean; onClick: () => void; activeClass?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all",
        active
          ? activeClass ?? "bg-primary text-primary-foreground border-primary"
          : "bg-white text-gray-700 border-gray-200 hover:border-gray-400",
      )}
    >
      {label}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] italic text-muted-foreground">{children}</span>;
}

/** Liste de puces avec recherche intégrée si > 8 éléments. */
function SearchableChips({
  items, selected, onToggle, emptyLabel,
}: {
  items: Array<[string, string]>;
  selected: string[];
  onToggle: (id: string) => void;
  emptyLabel: string;
}) {
  const [q, setQ] = useState("");
  if (items.length === 0) return <Empty>{emptyLabel}</Empty>;
  const filtered = q.trim()
    ? items.filter(([, name]) => name.toLowerCase().includes(q.toLowerCase()))
    : items;
  return (
    <div className="space-y-2">
      {items.length > 8 && (
        <Input
          placeholder="Rechercher…"
          value={q}
          onChange={e => setQ(e.target.value)}
          className="h-7 text-xs"
        />
      )}
      <ChipRow>
        {filtered.map(([id, name]) => (
          <Chip key={id} label={name} active={selected.includes(id)} onClick={() => onToggle(id)} />
        ))}
        {filtered.length === 0 && <Empty>Aucun résultat</Empty>}
      </ChipRow>
    </div>
  );
}

function DaysRange({ filters, onUpdate }: { filters: CockpitFilterState; onUpdate: Props["onUpdate"] }) {
  const min = filters.daysMin ?? 0;
  const max = filters.daysMax ?? 60;
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>≥ {min} j</span>
        <span>≤ {max} j</span>
      </div>
      <Slider
        value={[min, max]}
        max={120}
        step={1}
        onValueChange={([a, b]) => {
          onUpdate("daysMin", a > 0 ? a : null);
          onUpdate("daysMax", b < 120 ? b : null);
        }}
      />
    </div>
  );
}
