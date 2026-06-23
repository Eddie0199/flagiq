import { supabase } from "./supabaseClient";

const LOG_PREFIX = "[country-tracking]";

function warnCountryTracking(message, details = {}) {
  console.warn(`${LOG_PREFIX} ${message}`, details);
}

export async function trackUserCountry({ anonymousDeviceId = "", userId = "" } = {}) {
  if (!supabase) {
    warnCountryTracking("skipped because Supabase is unavailable");
    return null;
  }

  if (!anonymousDeviceId && !userId) {
    warnCountryTracking("skipped because no anonymous device or user id was provided");
    return null;
  }

  try {
    const { data, error } = await supabase.functions.invoke("track-user-country", {
      body: {
        anonymousDeviceId: anonymousDeviceId || null,
        userId: userId || null,
      },
    });

    if (error) {
      warnCountryTracking("edge function failed", { error });
      return null;
    }

    if (data?.warning) {
      warnCountryTracking("edge function completed with warning", data);
    }

    return data || null;
  } catch (error) {
    warnCountryTracking("country detection failed", { error });
    return null;
  }
}
