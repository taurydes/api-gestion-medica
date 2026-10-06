export const MAINTENANCE_QUEUE = 'maintenance';
export const ACCESS_LOG_PURGE_JOB = 'access-log-purge';

export const DEFAULT_ACCESS_LOG_RETENTION_DAYS = 90;
export const ACCESS_LOG_PURGE_BATCH = 5000;
/** Daily at 03:00 in the app TZ, the lowest-traffic hour of the clinic. */
export const ACCESS_LOG_PURGE_CRON = '0 3 * * *';
export const ACCESS_LOG_PURGE_LOCK_KEY = 'lock:access-log-purge';
export const ACCESS_LOG_PURGE_LOCK_SECONDS = 60 * 60;

/** Days from ACCESS_LOG_RETENTION_DAYS; null when the value is set but not an integer >= 1. */
export function parseRetentionDays(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_ACCESS_LOG_RETENTION_DAYS;
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
}
