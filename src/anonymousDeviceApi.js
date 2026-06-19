import { Capacitor } from "@capacitor/core";
import { supabase, supabaseBuildInfo, supabaseProjectUrl } from "./supabaseClient";

export const ANONYMOUS_DEVICE_ID_STORAGE_KEY = "flagiq:anonymousDeviceId";

const LOG_PREFIX = "[anonymous-device]";
const debugListeners = new Set();

function emitAnonymousDebug(event) {
  const entry = {
    timestamp: new Date().toISOString(),
    supabaseProjectUrl: supabaseProjectUrl || null,
    buildNumber: supabaseBuildInfo.buildNumber,
    commitSha: supabaseBuildInfo.commitSha,
    ...event,
  };
  debugListeners.forEach((listener) => {
    try {
      listener(entry);
    } catch (e) {
      // keep logging side effects isolated from app startup
    }
  });
}

export function subscribeToAnonymousDeviceDebug(listener) {
  if (typeof listener !== "function") return () => {};
  debugListeners.add(listener);
  return () => debugListeners.delete(listener);
}

function logAnonymousDevice(message, details = {}) {
  const payload = {
    supabaseProjectUrl: supabaseProjectUrl || null,
    buildNumber: supabaseBuildInfo.buildNumber,
    commitSha: supabaseBuildInfo.commitSha,
    ...details,
  };
  console.log(`${LOG_PREFIX} ${message}`, payload);
  emitAnonymousDebug({ level: "info", message, details: payload });
}

function warnAnonymousDevice(message, details = {}) {
  const payload = {
    supabaseProjectUrl: supabaseProjectUrl || null,
    buildNumber: supabaseBuildInfo.buildNumber,
    commitSha: supabaseBuildInfo.commitSha,
    ...details,
  };
  console.warn(`${LOG_PREFIX} ${message}`, payload);
  emitAnonymousDebug({ level: "warn", message, details: payload });
}

export function logAnonymousTrackingContext(message, details = {}) {
  logAnonymousDevice(message, details);
}

function getCapacitorStorage() {
  if (!Capacitor?.Plugins) return null;
  // Prefer the native Preferences plugin when it is available. Storage is kept only
  // as a legacy fallback for older builds that may still have written there.
  return Capacitor.Plugins.Preferences || Capacitor.Plugins.Storage || null;
}

function isNativePlatform() {
  try {
    return typeof Capacitor?.isNativePlatform === "function" && Capacitor.isNativePlatform();
  } catch (e) {
    return false;
  }
}

async function readCapacitorDeviceId(plugin) {
  if (!plugin?.get) return "";
  try {
    const result = await plugin.get({ key: ANONYMOUS_DEVICE_ID_STORAGE_KEY });
    return result?.value || "";
  } catch (e) {
    warnAnonymousDevice("failed reading device_id from Capacitor storage", { error: e });
    return "";
  }
}

function readLocalStorageDeviceId() {
  try {
    return localStorage.getItem(ANONYMOUS_DEVICE_ID_STORAGE_KEY) || "";
  } catch (e) {
    warnAnonymousDevice("failed reading device_id from localStorage", { error: e });
    return "";
  }
}

async function writeCapacitorDeviceId(plugin, deviceId) {
  if (!plugin?.set || !deviceId) return false;
  try {
    await plugin.set({ key: ANONYMOUS_DEVICE_ID_STORAGE_KEY, value: deviceId });
    return true;
  } catch (e) {
    warnAnonymousDevice("failed storing device_id in Capacitor storage", { error: e });
    return false;
  }
}

function writeLocalStorageDeviceId(deviceId) {
  if (!deviceId) return false;
  try {
    localStorage.setItem(ANONYMOUS_DEVICE_ID_STORAGE_KEY, deviceId);
    return true;
  } catch (e) {
    warnAnonymousDevice("failed storing device_id in localStorage", { error: e });
    return false;
  }
}

async function persistCanonicalAnonymousDeviceId(plugin, deviceId, source) {
  const wroteCapacitor = await writeCapacitorDeviceId(plugin, deviceId);
  const wroteLocalStorage = writeLocalStorageDeviceId(deviceId);
  logAnonymousDevice("persisted canonical device_id to available stores", {
    storageKey: ANONYMOUS_DEVICE_ID_STORAGE_KEY,
    device_id: deviceId,
    source,
    capacitorAvailable: Boolean(plugin?.set),
    localStorageAvailable: wroteLocalStorage,
    wroteCapacitor,
    wroteLocalStorage,
  });
}

function createAnonymousDeviceId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
      (
        Number(c) ^
        (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))
      ).toString(16)
    );
  }
  const part = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return `${part()}${part()}-${part()}-4${part().slice(1)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${part().slice(1)}-${part()}${part()}${part()}`;
}

export async function getOrCreateAnonymousDeviceId() {
  const plugin = getCapacitorStorage();
  const native = isNativePlatform();
  const capacitorDeviceId = await readCapacitorDeviceId(plugin);
  const localStorageDeviceId = readLocalStorageDeviceId();

  if (capacitorDeviceId || localStorageDeviceId) {
    const canonicalDeviceId = native
      ? capacitorDeviceId || localStorageDeviceId
      : localStorageDeviceId || capacitorDeviceId;
    const source = capacitorDeviceId === canonicalDeviceId ? "Capacitor storage" : "localStorage";

    logAnonymousDevice("loaded existing device_id", {
      storageKey: ANONYMOUS_DEVICE_ID_STORAGE_KEY,
      device_id: canonicalDeviceId,
      source,
      native,
      hasCapacitorDeviceId: Boolean(capacitorDeviceId),
      hasLocalStorageDeviceId: Boolean(localStorageDeviceId),
      storesDisagreed: Boolean(capacitorDeviceId && localStorageDeviceId && capacitorDeviceId !== localStorageDeviceId),
    });

    if (capacitorDeviceId !== canonicalDeviceId || localStorageDeviceId !== canonicalDeviceId) {
      await persistCanonicalAnonymousDeviceId(plugin, canonicalDeviceId, source);
    }

    return canonicalDeviceId;
  }

  const nextId = createAnonymousDeviceId();
  logAnonymousDevice("generated new device_id after no existing storage match", {
    storageKey: ANONYMOUS_DEVICE_ID_STORAGE_KEY,
    device_id: nextId,
    native,
    capacitorAvailable: Boolean(plugin?.set),
  });
  await persistCanonicalAnonymousDeviceId(plugin, nextId, "generated");
  return nextId;
}

async function insertAnonymousDeviceFallback(anonymousDeviceId) {
  const fallbackPayload = {
    anonymous_device_id: anonymousDeviceId,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  logAnonymousDevice("direct anonymous_devices insert fallback requested", {
    device_id: anonymousDeviceId,
    table: "anonymous_devices",
    payload: fallbackPayload,
    note: "Fallback uses anonymous_device_id (not id/device_id) when track_anonymous_device RPC is missing or failing.",
  });
  const response = await supabase.from("anonymous_devices").insert(fallbackPayload).select().maybeSingle();
  logAnonymousDevice("direct anonymous_devices insert fallback response", {
    device_id: anonymousDeviceId,
    status: response.status,
    statusText: response.statusText,
    data: response.data,
    error: response.error,
  });
  if (response.error?.code === "23505") {
    warnAnonymousDevice("direct anonymous_devices insert fallback found existing row", {
      device_id: anonymousDeviceId,
      error: response.error,
      note: "Existing row means this install was already recorded; anon RLS may prevent direct updates, so RPC should be installed for true upsert/last_seen updates.",
    });
    return { anonymous_device_id: anonymousDeviceId, already_exists: true };
  }
  if (response.error) throw response.error;
  return response.data;
}

export async function trackAnonymousDevice(anonymousDeviceId, userId = null) {
  const payload = {
    p_anonymous_device_id: anonymousDeviceId,
    p_user_id: userId || null,
  };
  logAnonymousDevice("track_anonymous_device requested", {
    device_id: anonymousDeviceId,
    rpc: "track_anonymous_device",
    payload,
    note: "RPC writes anonymous_devices.anonymous_device_id (not id/device_id) and updates last_seen_at.",
  });
  if (!supabase || !anonymousDeviceId) {
    warnAnonymousDevice("track_anonymous_device skipped", {
      hasSupabaseClient: Boolean(supabase),
      device_id: anonymousDeviceId || null,
    });
    return null;
  }
  const { data, error, status, statusText } = await supabase.rpc("track_anonymous_device", payload);
  logAnonymousDevice("track_anonymous_device response", {
    device_id: anonymousDeviceId,
    status,
    statusText,
    data,
    error,
    last_seen_at: data?.last_seen_at || null,
  });
  if (error) {
    warnAnonymousDevice("track_anonymous_device RPC failed; trying direct insert fallback", {
      device_id: anonymousDeviceId,
      error,
    });
    return insertAnonymousDeviceFallback(anonymousDeviceId);
  }
  return data;
}

export async function saveAnonymousDeviceState(anonymousDeviceId, state) {
  if (!supabase || !anonymousDeviceId) {
    warnAnonymousDevice("save_anonymous_device_state skipped", {
      hasSupabaseClient: Boolean(supabase),
      device_id: anonymousDeviceId || null,
    });
    return null;
  }
  const payload = {
    p_anonymous_device_id: anonymousDeviceId,
    p_coins: Number.isFinite(Number(state?.coins)) ? Number(state.coins) : 0,
    p_preferred_language: state?.preferred_language || null,
    p_progress: state?.progress || {},
    p_inventory: state?.inventory || {},
    p_cooldowns: state?.cooldowns || {},
    p_hearts_current: Number.isFinite(Number(state?.hearts_current))
      ? Number(state.hearts_current)
      : null,
    p_hearts_max: Number.isFinite(Number(state?.hearts_max))
      ? Number(state.hearts_max)
      : null,
    p_hearts_last_regen_at: state?.hearts_last_regen_at || null,
  };
  logAnonymousDevice("save_anonymous_device_state requested", {
    device_id: anonymousDeviceId,
    rpc: "save_anonymous_device_state",
    payload,
  });
  const { data, error, status, statusText } = await supabase.rpc("save_anonymous_device_state", payload);
  logAnonymousDevice("save_anonymous_device_state response", {
    device_id: anonymousDeviceId,
    status,
    statusText,
    data,
    error,
    last_seen_at: data?.last_seen_at || null,
  });
  if (error) throw error;
  return data;
}

export async function getAnonymousDeviceState(anonymousDeviceId) {
  if (!supabase || !anonymousDeviceId) return null;
  const payload = {
    p_anonymous_device_id: anonymousDeviceId,
  };
  logAnonymousDevice("get_anonymous_device_state requested", {
    device_id: anonymousDeviceId,
    rpc: "get_anonymous_device_state",
    payload,
  });
  const { data, error } = await supabase.rpc("get_anonymous_device_state", payload);
  if (error) throw error;
  return data;
}
