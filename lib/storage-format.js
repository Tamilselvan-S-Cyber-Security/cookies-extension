/** @typedef {Object} SerializableCookie
 * @property {string} name
 * @property {string} value
 * @property {string} domain
 * @property {string} path
 * @property {boolean} secure
 * @property {boolean} httpOnly
 * @property {'no_restriction'|'lax'|'strict'|'unspecified'} sameSite
 * @property {boolean} session
 * @property {number} [expirationDate]
 * @property {string} [storeId]
 */

/** @typedef {Object} SiteStorageEntry
 * @property {string} origin
 * @property {Record<string, string>} localStorage
 * @property {Record<string, string>} sessionStorage
 */

/** @typedef {Object} SiteDataBackup
 * @property {string} version
 * @property {string} createdAt
 * @property {string} [label]
 * @property {SerializableCookie[]} cookies
 * @property {SiteStorageEntry[]} siteStorage
 */

export const BACKUP_VERSION = "1.0";

/**
 * @param {chrome.cookies.Cookie[]} cookies
 * @returns {SerializableCookie[]}
 */
export function serializeCookies(cookies) {
  return cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path || "/",
    secure: Boolean(c.secure),
    httpOnly: Boolean(c.httpOnly),
    sameSite: c.sameSite || "unspecified",
    session: c.session ?? !c.expirationDate,
    expirationDate: c.expirationDate,
    storeId: c.storeId,
    hostOnly: Boolean(c.hostOnly),
    partitionKey: c.partitionKey || undefined,
  }));
}

/**
 * @param {SerializableCookie} c
 * @returns {chrome.cookies.SetDetails}
 */
export function toSetDetails(c) {
  const hostOnly = c.name?.startsWith("__Host-") || c.hostOnly !== false;
  /** @type {chrome.cookies.SetDetails} */
  const details = {
    url: cookieUrl(c),
    name: c.name,
    value: c.value,
    path: c.name?.startsWith("__Host-") ? "/" : c.path || "/",
    secure: Boolean(c.secure) || c.name?.startsWith("__Secure-") || c.name?.startsWith("__Host-"),
    httpOnly: Boolean(c.httpOnly),
    storeId: c.storeId,
  };
  if (!hostOnly && c.domain) {
    details.domain = c.domain.replace(/^\./, "");
  }
  if (c.sameSite && c.sameSite !== "unspecified") {
    details.sameSite = c.sameSite === "no_restriction" && !details.secure ? "lax" : c.sameSite;
  }
  if (c.partitionKey) details.partitionKey = c.partitionKey;
  if (!c.session && c.expirationDate) {
    details.expirationDate = c.expirationDate;
  }
  return details;
}

/**
 * @param {SerializableCookie} c
 */
export function cookieUrl(c) {
  const host = c.domain.startsWith(".") ? c.domain.slice(1) : c.domain;
  const scheme = c.secure ? "https" : "http";
  return `${scheme}://${host}${c.path || "/"}`;
}

/**
 * @param {Partial<SiteDataBackup>} partial
 * @returns {SiteDataBackup}
 */
export function normalizeBackup(partial) {
  return {
    version: partial.version || BACKUP_VERSION,
    createdAt: partial.createdAt || new Date().toISOString(),
    label: partial.label,
    cookies: Array.isArray(partial.cookies) ? partial.cookies : [],
    siteStorage: Array.isArray(partial.siteStorage) ? partial.siteStorage : [],
  };
}
