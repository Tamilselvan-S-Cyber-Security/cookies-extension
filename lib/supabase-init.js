import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let client = null;
let ready = null;

export async function initSupabaseExtension() {
  if (client) return client;
  if (ready) return ready;

  ready = (async () => {
    let supabaseConfig;
    try {
      ({ supabaseConfig } = await import("./supabase-config.generated.js"));
    } catch {
      throw new Error("Run: cd clon-site && npm run supabase:config");
    }
    if (!supabaseConfig?.url || !supabaseConfig?.anonKey) {
      throw new Error("Invalid Supabase config.");
    }
    client = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    return client;
  })();

  return ready;
}

async function persistUser(user, displayName) {
  await chrome.storage.local.set({
    supabaseUid: user.id,
    supabaseEmail: user.email,
    supabaseDisplayName: displayName || user.user_metadata?.display_name || "",
  });
}

export async function extensionSupabaseLogin(email, password) {
  const sb = await initSupabaseExtension();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await persistUser(data.user);
  return data.user;
}

export async function extensionSupabaseRegister(email, password, displayName) {
  const sb = await initSupabaseExtension();
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName || "" } },
  });
  if (error) throw error;
  if (!data.user) throw new Error("Registration failed.");

  let user = data.session?.user || null;
  if (!user) {
    const signedIn = await sb.auth.signInWithPassword({ email, password });
    if (signedIn.error) {
      throw new Error(
        signedIn.error.message ||
          "Account created, but there is no login session. Run supabase/schema.sql, then sign in."
      );
    }
    user = signedIn.data.session?.user || signedIn.data.user;
  }
  if (!user) throw new Error("Auth session missing.");
  await persistUser(user, displayName);
  return user;
}

export async function extensionSupabaseLogout() {
  const sb = await initSupabaseExtension();
  await sb.auth.signOut();
  await chrome.storage.local.remove([
    "supabaseUid",
    "supabaseEmail",
    "supabaseDisplayName",
  ]);
}

export async function isExtensionSupabaseSignedIn() {
  const sb = await initSupabaseExtension();
  const { data } = await sb.auth.getSession();
  return Boolean(data.session?.user);
}
