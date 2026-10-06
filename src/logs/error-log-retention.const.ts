export const ERROR_LOG_PURGE_JOB = 'error-log-purge';

export const DEFAULT_ERROR_LOG_RETENTION_DAYS = 7;
export const ERROR_LOG_PURGE_BATCH = 5000;
/** Daily at 03:15 in the app TZ, after the access-log purge so both never compete for I/O. */
export const ERROR_LOG_PURGE_CRON = '15 3 * * *';
export const ERROR_LOG_PURGE_LOCK_KEY = 'lock:error-log-purge';
export const ERROR_LOG_PURGE_LOCK_SECONDS = 60 * 60;

export const DAY_MS = 24 * 60 * 60 * 1000;
