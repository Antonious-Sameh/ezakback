/**
 * Date ranges as the shops understand them: YYYY-MM-DD calendar days in
 * CAIRO time (the shops anchor every from/to to Cairo day boundaries).
 *
 * The previous version used toISOString() on the server clock, which on
 * Vercel is UTC — so between midnight and ~3 AM Cairo time "today" was
 * still yesterday, and "today's sales" showed the wrong day.
 */
export const CAIRO_TZ = 'Africa/Cairo';
const DAY_MS = 86_400_000;

/** Today's date in Cairo as YYYY-MM-DD (en-CA formats as ISO). */
export function cairoToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CAIRO_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export function todayRange(now = new Date()) {
  const today = cairoToday(now);
  return { from: today, to: today };
}

export function monthToDateRange(now = new Date()) {
  const today = cairoToday(now);
  return { from: `${today.slice(0, 8)}01`, to: today };
}

const toUtc = (day) => new Date(`${day}T00:00:00Z`);
const toDay = (date) => date.toISOString().slice(0, 10);

/** Number of calendar days in an inclusive range. */
export function daysInRange({ from, to }) {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS) + 1;
}

/**
 * The period of the SAME length that ends the day before `from` — what a
 * "vs. previous period" comparison compares against:
 *   Sep 1–30 → Aug 2–31, one day → the day before, a week → the week before.
 */
export function previousRange({ from, to }) {
  const length = daysInRange({ from, to });
  const prevTo = new Date(toUtc(from).getTime() - DAY_MS);
  const prevFrom = new Date(prevTo.getTime() - (length - 1) * DAY_MS);
  return { from: toDay(prevFrom), to: toDay(prevTo) };
}

/** % change from `previous` to `current`, 1 decimal; null when there's no base to compare with. */
export function pctChange(current, previous) {
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}
