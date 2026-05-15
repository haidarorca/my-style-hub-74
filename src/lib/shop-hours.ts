export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface DaySchedule {
  open: boolean;
  from: string; // "HH:MM"
  to: string;   // "HH:MM"
}

export type ShopSchedule = Record<DayKey, DaySchedule>;

export const DAY_ORDER: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export const DAY_LABELS: Record<DayKey, string> = {
  mon: "Lundi",
  tue: "Mardi",
  wed: "Mercredi",
  thu: "Jeudi",
  fri: "Vendredi",
  sat: "Samedi",
  sun: "Dimanche",
};

export const DAY_SHORT: Record<DayKey, string> = {
  mon: "Lun", tue: "Mar", wed: "Mer", thu: "Jeu", fri: "Ven", sat: "Sam", sun: "Dim",
};

export const DEFAULT_SCHEDULE: ShopSchedule = {
  mon: { open: true, from: "09:00", to: "19:00" },
  tue: { open: true, from: "09:00", to: "19:00" },
  wed: { open: true, from: "09:00", to: "19:00" },
  thu: { open: true, from: "09:00", to: "19:00" },
  fri: { open: true, from: "09:00", to: "19:00" },
  sat: { open: true, from: "09:00", to: "19:00" },
  sun: { open: false, from: "09:00", to: "19:00" },
};

export function normalizeSchedule(raw: unknown): ShopSchedule {
  const out = { ...DEFAULT_SCHEDULE };
  if (raw && typeof raw === "object") {
    for (const k of DAY_ORDER) {
      const v = (raw as Record<string, unknown>)[k];
      if (v && typeof v === "object") {
        const d = v as Partial<DaySchedule>;
        out[k] = {
          open: !!d.open,
          from: typeof d.from === "string" ? d.from : "09:00",
          to: typeof d.to === "string" ? d.to : "19:00",
        };
      }
    }
  }
  return out;
}

/** Group consecutive days with same hours into ranges, e.g. "Lun – Sam : 9h–19h". */
export function summarizeSchedule(schedule: ShopSchedule): { label: string; value: string }[] {
  const fmt = (t: string) => {
    const [h, m] = t.split(":");
    return m === "00" ? `${parseInt(h, 10)}h` : `${parseInt(h, 10)}h${m}`;
  };
  const groups: { days: DayKey[]; value: string }[] = [];
  for (const day of DAY_ORDER) {
    const d = schedule[day];
    const value = d.open ? `${fmt(d.from)} – ${fmt(d.to)}` : "Fermé";
    const last = groups[groups.length - 1];
    if (last && last.value === value) last.days.push(day);
    else groups.push({ days: [day], value });
  }
  return groups.map((g) => ({
    label: g.days.length === 1
      ? DAY_SHORT[g.days[0]]
      : `${DAY_SHORT[g.days[0]]} – ${DAY_SHORT[g.days[g.days.length - 1]]}`,
    value: g.value,
  }));
}

/** Returns whether the shop is currently open based on the user's local time. */
export function isOpenNow(schedule: ShopSchedule, now = new Date()): boolean {
  const map: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const today = schedule[map[now.getDay()]];
  if (!today.open) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const [fh, fm] = today.from.split(":").map(Number);
  const [th, tm] = today.to.split(":").map(Number);
  return cur >= fh * 60 + fm && cur <= th * 60 + tm;
}
