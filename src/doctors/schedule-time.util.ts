/** Minutes since midnight of a 'HH:mm' or 'HH:mm:ss' time; seconds are ignored. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Minutes since midnight of a Date in the server's local time (TZ=America/Caracas). */
export function dateToMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** True when [start, start + duration) fits inside the block: it may end exactly at block end, not start there. */
export function fitsInBlock(
  block: { startTime: string; endTime: string },
  startMinutes: number,
  durationMinutes: number,
): boolean {
  return (
    startMinutes >= timeToMinutes(block.startTime) &&
    startMinutes + durationMinutes <= timeToMinutes(block.endTime)
  );
}

/** Local midnight (server TZ) of a 'YYYY-MM-DD' date; new Date('YYYY-MM-DD') would be UTC midnight, the previous day in Caracas. */
export function parseLocalDate(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 'YYYY-MM-DD' of a Date in server local time, without the UTC shift of toISOString(). */
export function formatLocalDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Slots of the block's grid (every slotDurationMinutes from its start) touched by [start, start + duration). */
export function slotsCovering(
  block: { startTime: string; slotDurationMinutes?: number | null },
  startMinutes: number,
  durationMinutes: number,
): { start: number; end: number }[] {
  const size = block.slotDurationMinutes || 30;
  const origin = timeToMinutes(block.startTime);
  const first = Math.floor((startMinutes - origin) / size);
  const last = Math.floor((startMinutes + durationMinutes - 1 - origin) / size);
  const slots: { start: number; end: number }[] = [];
  for (let i = first; i <= last; i++) slots.push({ start: origin + i * size, end: origin + (i + 1) * size });
  return slots;
}

/** Local Date of a minute of the same day as `day`. */
export function atMinutes(day: Date, minutes: number): Date {
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes);
  return d;
}

/** 'HH:mm' of minutes since midnight. */
export function minutesToTime(minutes: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}
