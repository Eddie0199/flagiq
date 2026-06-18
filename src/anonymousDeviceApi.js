import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabaseClient";

export const ANONYMOUS_DEVICE_ID_STORAGE_KEY = "flagiq:anonymousDeviceId";

function getCapacitorStorage() {
  if (!Capacitor?.Plugins) return null;
  return Capacitor.Plugins.Preferences || Capacitor.Plugins.Storage || null;
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
  if (plugin?.get) {
    try {
      const result = await plugin.get({ key: ANONYMOUS_DEVICE_ID_STORAGE_KEY });
      if (result?.value) return result.value;
    } catch (e) {}
  }

  try {
    const stored = localStorage.getItem(ANONYMOUS_DEVICE_ID_STORAGE_KEY);
    if (stored) {
      if (plugin?.set) {
        try {
          await plugin.set({ key: ANONYMOUS_DEVICE_ID_STORAGE_KEY, value: stored });
        } catch (e) {}
      }
      return stored;
    }
  } catch (e) {}

  const nextId = createAnonymousDeviceId();
  if (plugin?.set) {
    try {
      await plugin.set({ key: ANONYMOUS_DEVICE_ID_STORAGE_KEY, value: nextId });
    } catch (e) {}
  }
  try {
    localStorage.setItem(ANONYMOUS_DEVICE_ID_STORAGE_KEY, nextId);
  } catch (e) {}
  return nextId;
}

export async function trackAnonymousDevice(anonymousDeviceId, userId = null) {
  if (!supabase || !anonymousDeviceId) return null;
  const { data, error } = await supabase.rpc("track_anonymous_device", {
    p_anonymous_device_id: anonymousDeviceId,
    p_user_id: userId || null,
  });
  if (error) throw error;
  return data;
}
