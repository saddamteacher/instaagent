/**
 * Vaqt mintaqasi yordamchilari (kutubxonasiz, Intl orqali).
 * Jadval va kalendar foydalanuvchi mintaqasida (standart: Asia/Tashkent) ishlaydi, bazada — UTC.
 */
export const DEFAULT_TZ = "Asia/Tashkent";

/** 1 = Dushanba … 7 = Yakshanba */
export const WEEKDAYS_UZ = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"] as const;

export interface ZonedParts {
  year: number;
  month: number; // 1..12
  day: number;
  hour: number;
  minute: number;
  /** 1 = Dushanba … 7 = Yakshanba */
  weekday: number;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

const WD: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function zonedParts(d: Date, tz = DEFAULT_TZ): ZonedParts {
  const p = Object.fromEntries(fmt(tz).formatToParts(d).map((x) => [x.type, x.value]));
  return {
    year: +p.year!,
    month: +p.month!,
    day: +p.day!,
    hour: +p.hour! % 24,
    minute: +p.minute!,
    weekday: WD[p.weekday!]!,
  };
}

/** Mintaqaning UTC'dan siljishi (ms) berilgan paytda. */
function offsetMs(d: Date, tz: string) {
  const p = Object.fromEntries(fmt(tz).formatToParts(d).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour! % 24, +p.minute!, +p.second!);
  return asUtc - Math.floor(d.getTime() / 1000) * 1000;
}

/** Mintaqadagi mahalliy sana-vaqt → UTC Date (yozgi vaqt o'tishlarini ham hisobga oladi). */
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, tz = DEFAULT_TZ): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let t = guess - offsetMs(new Date(guess), tz);
  t = guess - offsetMs(new Date(t), tz);
  return new Date(t);
}

/** "2026-11-20T09:30" (datetime-local) mintaqada → UTC */
export function parseLocalDateTime(value: string, tz = DEFAULT_TZ): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  return zonedToUtc(+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!, tz);
}

/** UTC → datetime-local qiymati (mintaqada) */
export function toLocalInput(d: Date, tz = DEFAULT_TZ) {
  const p = zonedParts(d, tz);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${z(p.month)}-${z(p.day)}T${z(p.hour)}:${z(p.minute)}`;
}

export const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Haftalik jadvalning `after` dan keyingi birinchi paytini topadi.
 * weekdays: 1..7 (bo'sh bo'lsa — har kuni), timeOfDay: "HH:MM" mintaqada.
 */
export function nextOccurrence(weekdays: number[], timeOfDay: string, tz: string, after: Date): Date {
  const m = TIME_RE.exec(timeOfDay);
  if (!m) throw new Error(`Vaqt formati noto'g'ri: ${timeOfDay}`);
  const days = weekdays.length ? weekdays : [1, 2, 3, 4, 5, 6, 7];
  const start = zonedParts(after, tz);
  for (let i = 0; i <= 8; i++) {
    // Mintaqadagi kalendar kuni (+i kun); 12:00 UTC atrofida hisoblash — sana chegarasidan xavfsiz
    const noon = new Date(Date.UTC(start.year, start.month - 1, start.day + i, 12));
    const wd = ((noon.getUTCDay() + 6) % 7) + 1;
    if (!days.includes(wd)) continue;
    const at = zonedToUtc(noon.getUTCFullYear(), noon.getUTCMonth() + 1, noon.getUTCDate(), +m[1]!, +m[2]!, tz);
    if (at.getTime() > after.getTime()) return at;
  }
  throw new Error("Keyingi vaqt topilmadi");
}
