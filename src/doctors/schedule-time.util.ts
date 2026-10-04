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
