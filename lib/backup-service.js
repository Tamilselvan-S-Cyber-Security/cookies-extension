import {
  serializeCookies,
  toSetDetails,
  normalizeBackup,
  BACKUP_VERSION,
} from "./storage-format.js";

/**
 * @returns {Promise<import('./storage-format.js').SiteDataBackup>}
 */
function cookieKey(cookie, storeId = "") {
  const partition = cookie.partitionKey?.topLevelSite || "";
  return `${storeId || cookie.storeId || ""}|${cookie.domain}|${cookie.path}|${cookie.name}|${partition}`;
}

/** Every cookie Chrome exposes: all profiles/stores (Instagram, LinkedIn, GitHub, etc.). */
async function collectAllCookies() {
  const seen = new Set();
  const all = [];

  function addBatch(batch, storeId = "") {
    for (const cookie of batch || []) {
      const key = cookieKey(cookie, storeId);
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(cookie);
    }
  }

  try {
    addBatch(await chrome.cookies.getAll({}));
  } catch {
    /* continue */
  }

  try {
    const stores = await chrome.cookies.getAllCookieStores();
    for (const store of stores) {
      addBatch(await chrome.cookies.getAll({ storeId: store.id }), store.id);
    }
  } catch {
    /* continue */
  }

  return all;
}

export async function collectAllSiteData(label) {
  const cookies = await collectAllCookies();
  const siteStorage = await collectStorageFromOpenTabs();

  return normalizeBackup({
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    label: label || `Backup ${new Date().toLocaleString()}`,
    cookies: serializeCookies(cookies),
    siteStorage,
  });
}

/**
 * Collect localStorage/sessionStorage from tabs the user has open (best-effort for MV3).
 * @returns {Promise<import('./storage-format.js').SiteStorageEntry[]>}
 */
async function collectStorageFromOpenTabs() {
  const tabs = await chrome.tabs.query({});
  /** @type {Map<string, import('./storage-format.js').SiteStorageEntry>} */
  const byOrigin = new Map();

  for (const tab of tabs) {
    if (!tab.id || !tab.url || !/^https?:\/\//i.test(tab.url)) continue;
    let origin;
    try {
      origin = new URL(tab.url).origin;
    } catch {
      continue;
    }
    if (byOrigin.has(origin)) continue;

    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const read = (storage) => {
            const out = {};
            for (let i = 0; i < storage.length; i++) {
              const key = storage.key(i);
              if (key != null) out[key] = storage.getItem(key) ?? "";
            }
            return out;
          };
          return {
            localStorage: read(localStorage),
            sessionStorage: read(sessionStorage),
          };
        },
      });
      if (result?.result) {
        byOrigin.set(origin, {
          origin,
          localStorage: result.result.localStorage || {},
          sessionStorage: result.result.sessionStorage || {},
        });
      }
    } catch {
      // Cross-origin, restricted page, or no permission — skip
    }
  }

  return [...byOrigin.values()];
}

/**
 * @param {import('./storage-format.js').SiteDataBackup} backup
 * @param {{ restoreCookies?: boolean, restoreStorage?: boolean }} options
 */
export async function restoreSiteData(backup, options = {}) {
  const { restoreCookies = true, restoreStorage = true } = options;
  const data = normalizeBackup(backup);
  const report = { cookiesSet: 0, cookiesFailed: 0, storageOrigins: 0, errors: [] };

  if (restoreCookies) {
    for (const c of data.cookies) {
      try {
        await chrome.cookies.set(toSetDetails(c));
        report.cookiesSet++;
      } catch (e) {
        try {
          const details = toSetDetails(c);
          delete details.storeId;
          delete details.partitionKey;
          await chrome.cookies.set(details);
          report.cookiesSet++;
        } catch (retryError) {
          report.cookiesFailed++;
          if (report.errors.length < 8) {
            report.errors.push(`Cookie ${c.name}@${c.domain}: ${retryError.message || e.message}`);
          }
        }
      }
    }
  }

  if (restoreStorage && data.siteStorage.length) {
    for (const entry of data.siteStorage) {
      const opened = await openTabForOrigin(entry.origin);
      if (!opened) continue;
      const { tabId } = opened;
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (payload) => {
            for (const [k, v] of Object.entries(payload.localStorage || {})) {
              localStorage.setItem(k, v);
            }
            for (const [k, v] of Object.entries(payload.sessionStorage || {})) {
              sessionStorage.setItem(k, v);
            }
          },
          args: [
            {
              localStorage: entry.localStorage,
              sessionStorage: entry.sessionStorage,
            },
          ],
        });
        report.storageOrigins++;
      } catch (e) {
        report.errors.push(`Storage ${entry.origin}: ${e.message}`);
      } finally {
        if (opened.created) {
          await chrome.tabs.remove(tabId);
        }
      }
    }
  }

  return report;
}

/**
 * @param {string} origin
 */
async function openTabForOrigin(origin) {
  const tabs = await chrome.tabs.query({ url: `${origin}/*` });
  if (tabs[0]?.id) {
    return { tabId: tabs[0].id, created: false };
  }
  const tab = await chrome.tabs.create({ url: origin, active: false });
  if (!tab.id) return null;
  await waitForTabLoad(tab.id);
  return { tabId: tab.id, created: true };
}

/**
 * @param {number} tabId
 */
function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, 15000);
    const listener = (updatedId, info) => {
      if (updatedId === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timeout);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

export function downloadBackupJson(backup, filename) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `site-data-backup-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
