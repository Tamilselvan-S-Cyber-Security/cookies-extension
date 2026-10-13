/** Shared cookie backup schema (website + extension). */
export const BACKUP_FORMAT = "site-data-backup-v1";
export const BACKUP_STORAGE_BUCKET = "cookie-backups";

/** @param {Array<{ domain?: string }>} cookies */
export function summarizeCookieDomains(cookies) {
  const counts = new Map();
  for (const cookie of cookies || []) {
    const host = String(cookie.domain || "")
      .replace(/^\./, "")
      .toLowerCase();
    if (!host) continue;
    counts.set(host, (counts.get(host) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([domain, count]) => ({ domain, count }));
}

/**
 * @param {object} backup
 * @param {{ label?: string, source: 'website' | 'extension' }} opts
 */
export function prepareBackupPayload(backup, opts) {
  const cookies = Array.isArray(backup.cookies) ? backup.cookies : [];
  return {
    version: backup.version || "1.0",
    createdAt: backup.createdAt || new Date().toISOString(),
    label: (opts.label || backup.label || "Backup").slice(0, 200),
    cookies,
    siteStorage: Array.isArray(backup.siteStorage) ? backup.siteStorage : [],
    source: opts.source,
    format: BACKUP_FORMAT,
    domainSummary: backup.domainSummary || summarizeCookieDomains(cookies),
    collectNote: backup.collectNote || undefined,
  };
}

/**
 * @param {object} preparedBackup
 * @param {string} json
 */
export function buildBackupMeta(preparedBackup, json) {
  return {
    label: preparedBackup.label,
    cookieCount: preparedBackup.cookies.length,
    storageOriginCount: preparedBackup.siteStorage.length,
    sizeBytes: json.length,
    version: preparedBackup.version,
    format: BACKUP_FORMAT,
    source: preparedBackup.source,
  };
}
