import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type TrackCountryPayload = {
  anonymousDeviceId?: string | null;
  userId?: string | null;
  fallbackCountryCode?: string | null;
};

type UpdateResult = {
  updated: boolean;
  reason?: string;
  setRegisteredCountryCode?: boolean;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const COUNTRY_HEADER_NAMES = [
  "cf-ipcountry",
  "x-vercel-ip-country",
  "cloudfront-viewer-country",
  "x-country-code",
  "x-appengine-country",
  "fly-client-ip-country",
];

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function buildResponse({
  detectedCountryCode = null,
  updatedAnonymousDevice = false,
  updatedProfile = false,
  reasonSkipped = null,
  details = {},
}: {
  detectedCountryCode?: string | null;
  updatedAnonymousDevice?: boolean;
  updatedProfile?: boolean;
  reasonSkipped?: string | null;
  details?: Record<string, unknown>;
}) {
  return {
    detectedCountryCode,
    updatedAnonymousDevice,
    updatedProfile,
    reasonSkipped,
    ...details,
  };
}

function normalizeCountryCode(value: string | null | undefined) {
  const code = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";
  if (["XX", "ZZ", "T1", "A1"].includes(code)) return "";
  return code;
}

function safeHeaderDiagnostics(req: Request) {
  const availableHeaderNames = Array.from(req.headers.keys()).sort();
  const countryHeaderValues: Record<string, string | null> = {};

  for (const headerName of COUNTRY_HEADER_NAMES) {
    countryHeaderValues[headerName] = req.headers.get(headerName);
  }

  return { availableHeaderNames, countryHeaderValues };
}

export function detectCountryCodeFromRequest(req: Request) {
  for (const headerName of COUNTRY_HEADER_NAMES) {
    const countryCode = normalizeCountryCode(req.headers.get(headerName));
    if (countryCode) return countryCode;
  }

  return "";
}

function isFallbackAllowed(req: Request) {
  const envName = String(
    Deno.env.get("ENVIRONMENT") ||
      Deno.env.get("SUPABASE_ENV") ||
      Deno.env.get("DENO_ENV") ||
      "",
  ).toLowerCase();

  if (["development", "dev", "local", "staging", "test"].includes(envName)) {
    return true;
  }

  const origin = req.headers.get("origin") || "";
  const host = req.headers.get("host") || "";
  return [origin, host].some((value) => {
    const lower = value.toLowerCase();
    return (
      lower.includes("localhost") ||
      lower.includes("127.0.0.1") ||
      lower.includes(".local") ||
      lower.includes("dev") ||
      lower.includes("staging")
    );
  });
}

function resolveCountryCode(req: Request, fallbackCountryCode: string | null | undefined) {
  const headerCountryCode = detectCountryCodeFromRequest(req);
  if (headerCountryCode) {
    return { countryCode: headerCountryCode, source: "request_header" };
  }

  const normalizedFallback = normalizeCountryCode(fallbackCountryCode);
  if (normalizedFallback && isFallbackAllowed(req)) {
    return { countryCode: normalizedFallback, source: "dev_fallback" };
  }

  return { countryCode: "", source: "unavailable" };
}

async function updateCountryColumns(
  adminClient: ReturnType<typeof createClient>,
  table: "anonymous_devices" | "profiles",
  matchColumn: "anonymous_device_id" | "id",
  matchValue: string,
  countryCode: string,
): Promise<UpdateResult> {
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
    return jsonResponse(buildResponse({ reasonSkipped: "method_not_allowed" }), 405);
  }

  const headerDiagnostics = safeHeaderDiagnostics(req);
  console.log("[track-user-country] request header diagnostics", headerDiagnostics);

  try {
    const body = (await req.json().catch(() => ({}))) as TrackCountryPayload;
    const anonymousDeviceId = body?.anonymousDeviceId || null;
    const userId = body?.userId || null;
    const { countryCode, source } = resolveCountryCode(req, body?.fallbackCountryCode);

    console.log("[track-user-country] request payload", {
      anonymousDeviceId,
      userId,
      detectedCountryCode: countryCode || null,
      source,
      hasFallbackCountryCode: Boolean(body?.fallbackCountryCode),
    });

    if (!anonymousDeviceId && !userId) {
      return jsonResponse(buildResponse({ reasonSkipped: "missing_identifiers" }), 400);
    }

    if (!countryCode) {
      console.warn("[track-user-country] country detection unavailable", headerDiagnostics);
      return jsonResponse(buildResponse({ reasonSkipped: "country_detection_unavailable" }));
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      console.warn("[track-user-country] missing Supabase function env vars");
      return jsonResponse(
        buildResponse({ detectedCountryCode: countryCode, reasonSkipped: "missing_function_env" }),
        500,
      );
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
        return jsonResponse(
          buildResponse({ detectedCountryCode: countryCode, reasonSkipped: "unauthorized" }),
          401,
        );
      }
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    let anonymousDeviceResult: UpdateResult = { updated: false, reason: "not_requested" };
    let profileResult: UpdateResult = { updated: false, reason: "not_requested" };

    if (anonymousDeviceId) {
      anonymousDeviceResult = await updateCountryColumns(
        adminClient,
        "anonymous_devices",
        "anonymous_device_id",
        anonymousDeviceId,
        countryCode,
      );
    }

    if (userId) {
      profileResult = await updateCountryColumns(adminClient, "profiles", "id", userId, countryCode);
    }

    const reasonSkipped = !anonymousDeviceResult.updated && !profileResult.updated
      ? [anonymousDeviceResult.reason, profileResult.reason].filter((reason) => reason !== "not_requested").join(",") || "no_updates_requested"
      : null;

    return jsonResponse(
      buildResponse({
        detectedCountryCode: countryCode,
        updatedAnonymousDevice: anonymousDeviceResult.updated,
        updatedProfile: profileResult.updated,
        reasonSkipped,
        details: {
          source,
          anonymousDeviceResult,
          profileResult,
        },
      }),
    );
  } catch (error) {
    console.warn("[track-user-country] failed", error);
    return jsonResponse(buildResponse({ reasonSkipped: "country_tracking_failed" }));
  }
});
