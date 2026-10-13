import { saveCookieBackup, ensureBackupProfile } from "./backup-storage.js";

async function collectAll(label) {
  const res = await chrome.runtime.sendMessage({ type: "COLLECT_ALL", label });
  if (!res?.ok) throw new Error(res?.error || "Cookie collection failed.");
  return res.backup;
}

/**
 * Same pipeline as website → Supabase Storage + cookie_backups table.
 * @param {{ label?: string }} [options]
 */
export async function collectAndUploadCookies(options = {}) {
  const label = options.label || `Backup ${new Date().toISOString()}`;

  await ensureBackupProfile();

  const backup = await collectAll(label);
  if (!backup?.cookies?.length && !backup?.siteStorage?.length) {
    throw new Error("No cookies found to backup.");
  }

  const saved = await saveCookieBackup(backup, {
    label,
    source: "extension",
  });

  return { backup, saved };
}
