function toDateOnly(date) {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Today's date, as both `from` and `to` (the shops' reports treat this inclusively). */
export function todayRange() {
  const today = toDateOnly(new Date());
  return { from: today, to: today };
}

/** From the 1st of the current calendar month through today. */
export function monthToDateRange() {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: toDateOnly(firstOfMonth), to: toDateOnly(now) };
}
