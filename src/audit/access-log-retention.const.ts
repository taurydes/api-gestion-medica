export const ACCESS_LOG_PURGE_JOB = 'access-log-purge';

export const DEFAULT_ACCESS_LOG_RETENTION_DAYS = 90;
export const ACCESS_LOG_PURGE_BATCH = 5000;
/** Daily at 03:00 in the app TZ, the lowest-traffic hour of the clinic. */
export const ACCESS_LOG_PURGE_CRON = '0 3 * * *';
export const ACCESS_LOG_PURGE_LOCK_KEY = 'lock:access-log-purge';
export const ACCESS_LOG_PURGE_LOCK_SECONDS = 60 * 60;
