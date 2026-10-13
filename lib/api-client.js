const DEFAULT_BASE = "http://localhost:3847";

export async function getApiBase() {
  const { apiBaseUrl } = await chrome.storage.sync.get(["apiBaseUrl"]);
  return apiBaseUrl || DEFAULT_BASE;
}

export async function getAuthToken() {
  const { authToken } = await chrome.storage.local.get(["authToken"]);
  return authToken || null;
}

export async function setAuthSession(token, user) {
  await chrome.storage.local.set({ authToken: token, authUser: user });
}

export async function clearAuthSession() {
  await chrome.storage.local.remove(["authToken", "authUser"]);
}

async function apiFetch(path, options = {}) {
  const base = await getApiBase();
  const token = await getAuthToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${base}${path}`, { ...options, headers });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { error: text };
  }
  if (!res.ok) {
    throw new Error(body?.error || res.statusText || "Request failed");
  }
  return body;
}

export function login(email, password) {
  return apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function register(email, password, displayName) {
  return apiFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName }),
  });
}

export function listBackups() {
  return apiFetch("/api/backups");
}

export function uploadBackup(label, payload) {
  return apiFetch("/api/backups", {
    method: "POST",
    body: JSON.stringify({ label, payload }),
  });
}

export function fetchBackup(id) {
  return apiFetch(`/api/backups/${id}`);
}

export function deleteBackup(id) {
  return apiFetch(`/api/backups/${id}`, { method: "DELETE" });
}
