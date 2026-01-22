// src/supabaseClient.js
import { Capacitor } from "@capacitor/core";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const missingSupabaseEnv = [];
if (!supabaseUrl) {
  missingSupabaseEnv.push("REACT_APP_SUPABASE_URL");
}
if (!supabaseAnonKey) {
  missingSupabaseEnv.push("REACT_APP_SUPABASE_ANON_KEY");
}

if (missingSupabaseEnv.length > 0) {
  console.warn(
    `Supabase env vars are missing: ${missingSupabaseEnv.join(", ")}`
  );
}

const SUPABASE_SESSION_KEY = "flagiq:supabase:session";

const getCapacitorStorage = () => {
  if (!Capacitor?.Plugins) return null;
  return Capacitor.Plugins.Preferences || Capacitor.Plugins.Storage || null;
};

const storageAdapter = {
  getItem: async (key) => {
    const storageKey = key || SUPABASE_SESSION_KEY;
    const plugin = getCapacitorStorage();
    if (plugin?.get) {
      try {
        const result = await plugin.get({ key: storageKey });
        if (typeof result?.value === "string") return result.value;
      } catch (e) {}
    }
    try {
      return localStorage.getItem(storageKey);
    } catch (e) {
      return null;
    }
  },
  setItem: async (key, value) => {
    const storageKey = key || SUPABASE_SESSION_KEY;
    const plugin = getCapacitorStorage();
    if (plugin?.set) {
      try {
        await plugin.set({ key: storageKey, value: String(value ?? "") });
        return;
      } catch (e) {}
    }
    try {
      localStorage.setItem(storageKey, String(value ?? ""));
    } catch (e) {}
  },
  removeItem: async (key) => {
    const storageKey = key || SUPABASE_SESSION_KEY;
    const plugin = getCapacitorStorage();
    if (plugin?.remove) {
      try {
        await plugin.remove({ key: storageKey });
        return;
      } catch (e) {}
    }
    try {
      localStorage.removeItem(storageKey);
    } catch (e) {}
  },
};

export const supabase =
  missingSupabaseEnv.length === 0
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: SUPABASE_SESSION_KEY,
          storage: storageAdapter,
        },
      })
    : null;

export async function restoreSupabaseSession() {
  if (!supabase) return null;
  const raw = await storageAdapter.getItem(SUPABASE_SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    if (session?.access_token && session?.refresh_token) {
      const result = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      return result?.data?.session || null;
    }
  } catch (e) {}
  return null;
}

export function subscribeToSupabaseAuth(onSession) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange(
    async (event, session) => {
      if (session) {
        await storageAdapter.setItem(
          SUPABASE_SESSION_KEY,
          JSON.stringify(session)
        );
      } else {
        await storageAdapter.removeItem(SUPABASE_SESSION_KEY);
      }
      if (onSession) {
        onSession(event, session);
      }
    }
  );
  return () => {
    data?.subscription?.unsubscribe();
  };
}

export async function clearSupabaseSession() {
  await storageAdapter.removeItem(SUPABASE_SESSION_KEY);
}
