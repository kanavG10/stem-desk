/** All dates in this app are plain YYYY-MM-DD strings in the newsroom's local timezone. */

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00`);
  const b = Date.parse(`${to}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** Negative = overdue by N days, 0 = due today, positive = N days out. */
export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  return daysBetween(today(), date);
}

export function relativeDue(date: string | null): string {
  const n = daysUntil(date);
  if (n === null) return "—";
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "1 day late";
  if (n < 0) return `${-n} days late`;
  return `in ${n} days`;
}

export function formatDate(date: string | null): string {
  if (!date) return "—";
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
