import { supabase } from "./supabaseClient";

const LOG_PREFIX = "[country-tracking]";
const FUNCTION_NAME = "track-user-country";

function warnCountryTracking(message, details = {}) {
  console.warn(`${LOG_PREFIX} ${message}`, details);
}

function logCountryTracking(message, details = {}) {
  console.log(`${LOG_PREFIX} ${message}`, details);
}

function normalizeFallbackCountryCode(value) {
  const code = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";
  if (["XX", "ZZ", "T1", "A1"].includes(code)) return "";
  return code;
}

function isLocalDevOrStaging() {
  const envName = String(process.env.REACT_APP_ENV || process.env.NODE_ENV || "").toLowerCase();
  if (["development", "dev", "local", "staging", "test"].includes(envName)) return true;
  if (typeof window === "undefined") return false;
  const host = window.location?.hostname || "";
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".local") ||
    host.includes("dev") ||
    host.includes("staging")
  );
}

function getFallbackCountryCode() {
  if (!isLocalDevOrStaging()) return "";
  return normalizeFallbackCountryCode(process.env.REACT_APP_FALLBACK_COUNTRY_CODE);
}

export async function trackUserCountry({ anonymousDeviceId = "", userId = "" } = {}) {
  logCountryTracking("trackUserCountry called", {
    anonymousDeviceId: anonymousDeviceId || null,
    userId: userId || null,
    functionName: FUNCTION_NAME,
  });

  if (!supabase) {
    warnCountryTracking("skipped because Supabase is unavailable");
    return null;
  }

  if (!anonymousDeviceId && !userId) {
    warnCountryTracking("skipped because no anonymous device or user id was provided");
    return null;
  }

  const fallbackCountryCode = getFallbackCountryCode();
  const body = {
    anonymousDeviceId: anonymousDeviceId || null,
    userId: userId || null,
    fallbackCountryCode: fallbackCountryCode || null,
  };

  try {
    const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body });

    logCountryTracking("edge function response", {
      anonymousDeviceId: anonymousDeviceId || null,
      userId: userId || null,
      functionName: FUNCTION_NAME,
      response: data || null,
      error: error || null,
    });

    if (error) {
      warnCountryTracking("edge function failed", { error });
      return null;
    }

    if (data?.reasonSkipped || data?.warning) {
      warnCountryTracking("edge function completed without a country update", data);
    }

    return data || null;
  } catch (error) {
    warnCountryTracking("country detection failed", { error });
    return null;
  }
}
