import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type TrackCountryPayload = {
  anonymousDeviceId?: string | null;
  userId?: string | null;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function normalizeCountryCode(value: string | null) {
  const code = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";
  if (code === "ZZ" || code === "XX" || code === "T1") return "";
  return code;
}

export function detectCountryCodeFromRequest(req: Request) {
  const headerNames = [
    "cf-ipcountry",
    "x-vercel-ip-country",
    "x-country-code",
    "x-appengine-country",
    "cloudfront-viewer-country",
    "fly-client-ip-country",
  ];

  for (const headerName of headerNames) {
    const countryCode = normalizeCountryCode(req.headers.get(headerName));
    if (countryCode) return countryCode;
  }

  return "";
}

async function updateCountryColumns(
  adminClient: ReturnType<typeof createClient>,
  table: "anonymous_devices" | "profiles",
  matchColumn: "anonymous_device_id" | "id",
  matchValue: string,
  countryCode: string,
) {
  const { data: existing, error: readError } = await adminClient
    .from(table)
    .select("registered_country_code")
    .eq(matchColumn, matchValue)
    .maybeSingle();

  if (readError) throw readError;
  if (!existing) return { updated: false, reason: "not_found" };

  const updatePayload: Record<string, string> = {
    latest_country_code: countryCode,
  };

  if (!existing.registered_country_code) {
    updatePayload.registered_country_code = countryCode;
  }

  const { error: updateError } = await adminClient
    .from(table)
    .update(updatePayload)
    .eq(matchColumn, matchValue);

  if (updateError) throw updateError;
  return {
    updated: true,
    setRegisteredCountryCode: !existing.registered_country_code,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const countryCode = detectCountryCodeFromRequest(req);
    if (!countryCode) {
      console.warn("[track-user-country] country detection unavailable");
      return jsonResponse({ success: false, warning: "country_detection_unavailable" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      console.warn("[track-user-country] missing Supabase function env vars");
      return jsonResponse({ success: false, warning: "missing_function_env" }, 500);
    }

    const body = (await req.json().catch(() => ({}))) as TrackCountryPayload;
    const anonymousDeviceId = body?.anonymousDeviceId || null;
    const userId = body?.userId || null;

    if (!anonymousDeviceId && !userId) {
      return jsonResponse({ success: false, warning: "missing_identifiers" }, 400);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (userId) {
      const authClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user },
        error: authError,
      } = await authClient.auth.getUser();

      if (authError || !user || user.id !== userId) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const results: Record<string, unknown> = {};

    if (anonymousDeviceId) {
      results.anonymousDevice = await updateCountryColumns(
        adminClient,
        "anonymous_devices",
        "anonymous_device_id",
        anonymousDeviceId,
        countryCode,
      );
    }

    if (userId) {
      results.profile = await updateCountryColumns(
        adminClient,
        "profiles",
        "id",
        userId,
        countryCode,
      );
    }

    return jsonResponse({ success: true, countryCode, ...results });
  } catch (error) {
    console.warn("[track-user-country] failed", error);
    return jsonResponse({ success: false, warning: "country_tracking_failed" });
  }
});
