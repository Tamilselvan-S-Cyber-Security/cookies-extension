import { initSupabaseExtension as initSupabase } from "./supabase-init.js";
import {
  BACKUP_STORAGE_BUCKET,
  buildBackupMeta,
  prepareBackupPayload,
} from "./backup-format.js";

async function ctx() {
  const sb = await initSupabase();
  if (!sb) throw new Error("Supabase not configured.");
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  const user = data.session?.user;
  if (!user) {
    throw new Error(
      "Auth session missing. Run supabase/schema.sql in the Supabase SQL Editor, then sign in again."
    );
  }
  return { sb, user };
}

/** Profile row for the signed-in account. */
export async function getOwnProfile() {
  const { sb, user } = await ctx();
  const { data, error } = await sb
    .from("profiles")
    .select("id, email, display_name, updated_at")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Ensures profiles row exists for the signed-in user. */
export async function ensureBackupProfile() {
  const { sb, user } = await ctx();
  const { error } = await sb.from("profiles").upsert(
    {
      id: user.id,
      email: user.email || "",
      display_name: user.user_metadata?.display_name || "",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) throw error;
}

/**
 * Upload backup JSON to Storage and insert metadata row.
 * @param {object} backup raw collect output
 * @param {{ label?: string, source?: 'website' | 'extension' }} [options]
 */
export async function saveCookieBackup(backup, options = {}) {
  const { sb, user } = await ctx();
  await ensureBackupProfile();

  const source = options.source || backup.source || "website";
  const prepared = prepareBackupPayload(backup, {
    label: options.label,
    source,
  });
  const json = JSON.stringify(prepared);
  const meta = buildBackupMeta(prepared, json);
  meta.sizeBytes = new TextEncoder().encode(json).length;
  const id = crypto.randomUUID();
  const storagePath = `${user.id}/${id}.json`;

  const blob = new Blob([json], { type: "application/json" });
  let { error: uploadError } = await sb.storage.from(BACKUP_STORAGE_BUCKET).upload(storagePath, blob, {
    contentType: "application/json",
    upsert: false,
  });
  if (uploadError && /mime|content.type|invalid/i.test(uploadError.message || "")) {
    const retry = await sb.storage.from(BACKUP_STORAGE_BUCKET).upload(storagePath, blob, {
      contentType: "text/plain",
      upsert: true,
    });
    uploadError = retry.error;
  }
  if (uploadError) {
    throw new Error(
      `Cookie JSON upload failed: ${uploadError.message}. Run supabase/schema.sql in the Supabase SQL Editor.`
    );
  }

  const { error: insertError } = await sb.from("cookie_backups").insert({
    id,
    user_id: user.id,
    label: meta.label,
    cookie_count: meta.cookieCount,
    storage_origin_count: meta.storageOriginCount,
    size_bytes: meta.sizeBytes,
    format: meta.format,
    source: meta.source,
    version: meta.version,
    storage_path: storagePath,
  });

  if (insertError) {
    await sb.storage.from(BACKUP_STORAGE_BUCKET).remove([storagePath]);
    throw insertError;
  }

  return {
    id,
    cookieCount: meta.cookieCount,
    format: meta.format,
    source: meta.source,
    storagePath,
  };
}

export async function listCookieBackups() {
  const { sb, user } = await ctx();
  await ensureBackupProfile();
  const { data, error } = await sb
    .from("cookie_backups")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = data || [];
  const known = new Set(rows.map((row) => row.storage_path));
  const { data: objects, error: listError } = await sb.storage
    .from(BACKUP_STORAGE_BUCKET)
    .list(user.id, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
  if (listError) return rows;

  for (const object of objects || []) {
    if (!object?.name || !object.name.endsWith(".json")) continue;
    const storagePath = `${user.id}/${object.name}`;
    if (known.has(storagePath)) continue;
    rows.push({
      id: storagePath,
      user_id: user.id,
      label: object.name,
      cookie_count: null,
      storage_path: storagePath,
      created_at: object.created_at || object.updated_at || null,
      source: "storage",
    });
  }
  return rows;
}

export async function loadCookieBackup(backupId) {
  const { sb, user } = await ctx();
  let row = null;
  if (typeof backupId === "string" && backupId.includes("/")) {
    if (!backupId.startsWith(`${user.id}/`)) throw new Error("Backup not found.");
    row = { id: backupId, user_id: user.id, storage_path: backupId, label: backupId.split("/").pop() };
  } else {
    const { data, error } = await sb
      .from("cookie_backups")
      .select("*")
      .eq("id", backupId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    row = data;
  }
  if (!row) throw new Error("Backup not found.");

  const { data: file, error: dlError } = await sb.storage
    .from(BACKUP_STORAGE_BUCKET)
    .download(row.storage_path);
  if (dlError) throw dlError;

  const json = await file.text();
  let payload;
  try {
    payload = JSON.parse(json);
  } catch {
    throw new Error("Stored backup is not valid JSON.");
  }
  if (!payload || !Array.isArray(payload.cookies)) {
    throw new Error("Backup JSON is missing the cookies list.");
  }
  return { meta: row, payload };
}

export async function deleteCookieBackup(backupId) {
  const { sb, user } = await ctx();
  if (typeof backupId === "string" && backupId.includes("/")) {
    if (!backupId.startsWith(`${user.id}/`)) return;
    const { error: removeError } = await sb.storage.from(BACKUP_STORAGE_BUCKET).remove([backupId]);
    if (removeError) throw removeError;
    return;
  }
  const { data: row, error } = await sb
    .from("cookie_backups")
    .select("storage_path")
    .eq("id", backupId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!row) return;

  await sb.storage.from(BACKUP_STORAGE_BUCKET).remove([row.storage_path]);
  const { error: delError } = await sb
    .from("cookie_backups")
    .delete()
    .eq("id", backupId)
    .eq("user_id", user.id);
  if (delError) throw delError;
}
