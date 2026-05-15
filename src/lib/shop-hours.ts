export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface TimeSlot {
  from: string; // "HH:MM"
  to: string;   // "HH:MM"
}

export interface DaySchedule {
  open: boolean;
  slots: TimeSlot[];
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

const defaultDay = (open: boolean): DaySchedule => ({
  open,
  slots: [{ from: "09:00", to: "19:00" }],
});

export const DEFAULT_SCHEDULE: ShopSchedule = {
  mon: defaultDay(true),
  tue: defaultDay(true),
  wed: defaultDay(true),
  thu: defaultDay(true),
  fri: defaultDay(true),
  sat: defaultDay(true),
  sun: defaultDay(false),
};

function normalizeSlots(raw: unknown): TimeSlot[] {
  if (Array.isArray(raw)) {
    const slots = raw
      .map((s) => {
        if (s && typeof s === "object") {
          const o = s as Partial<TimeSlot>;
          return {
            from: typeof o.from === "string" ? o.from : "09:00",
            to: typeof o.to === "string" ? o.to : "19:00",
          };
        }
        return null;
      })
      .filter((s): s is TimeSlot => !!s);
    return slots.length > 0 ? slots : [{ from: "09:00", to: "19:00" }];
  }
  return [{ from: "09:00", to: "19:00" }];
}

export function normalizeSchedule(raw: unknown): ShopSchedule {
  const out: ShopSchedule = {
    mon: defaultDay(true), tue: defaultDay(true), wed: defaultDay(true),
    thu: defaultDay(true), fri: defaultDay(true), sat: defaultDay(true),
    sun: defaultDay(false),
  };
  if (raw && typeof raw === "object") {
    for (const k of DAY_ORDER) {
      const v = (raw as Record<string, unknown>)[k];
      if (v && typeof v === "object") {
        const d = v as { open?: boolean; slots?: unknown; from?: string; to?: string };
        // Backward compat: old shape had {open, from, to}
        let slots: TimeSlot[];
        if (Array.isArray(d.slots)) {
          slots = normalizeSlots(d.slots);
        } else if (typeof d.from === "string" && typeof d.to === "string") {
          slots = [{ from: d.from, to: d.to }];
        } else {
          slots = [{ from: "09:00", to: "19:00" }];
        }
        out[k] = { open: !!d.open, slots };
      }
    }
  }
  return out;
}

const fmtTime = (t: string) => {
  const [h, m] = t.split(":");
  return m === "00" ? `${parseInt(h, 10)}h` : `${parseInt(h, 10)}h${m}`;
};

export function formatDayValue(d: DaySchedule): string {
  if (!d.open || d.slots.length === 0) return "Fermé";
  return d.slots.map((s) => `${fmtTime(s.from)} – ${fmtTime(s.to)}`).join(", ");
}

/** Group consecutive days with same hours, e.g. "Lun – Sam : 9h–12h, 14h–19h". */
export function summarizeSchedule(schedule: ShopSchedule): { label: string; value: string }[] {
  const groups: { days: DayKey[]; value: string }[] = [];
  for (const day of DAY_ORDER) {
    const value = formatDayValue(schedule[day]);
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
  return today.slots.some((s) => {
    const [fh, fm] = s.from.split(":").map(Number);
    const [th, tm] = s.to.split(":").map(Number);
    return cur >= fh * 60 + fm && cur <= th * 60 + tm;
  });
}
