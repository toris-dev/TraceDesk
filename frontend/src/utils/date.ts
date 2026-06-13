/** YYYY-MM-DD (로컬 타임존) */
export function todayISO(): string {
  const d = new Date();
  return toISO(d);
}

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDateKo(iso: string, short = false): string {
  const d = parseISO(iso);
  if (short) {
    return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric", weekday: "short" });
  }
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

export function addDays(iso: string, delta: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + delta);
  return toISO(d);
}

export function isToday(iso: string): boolean {
  return iso === todayISO();
}

export function isFuture(iso: string): boolean {
  return iso > todayISO();
}

/** 오늘 포함 최근 n일 (YYYY-MM-DD, 내림차순) */
export function recentDays(count: number): string[] {
  const days: string[] = [];
  let cur = todayISO();
  for (let i = 0; i < count; i++) {
    days.push(cur);
    cur = addDays(cur, -1);
  }
  return days;
}

export function compareISO(a: string, b: string): number {
  return a.localeCompare(b);
}
