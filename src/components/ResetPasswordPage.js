import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { IS_DEBUG_BUILD } from "../debugTools";
import { LANGS, t as translate } from "../i18n";
import { getLocalizedLanguageName } from "../languageDisplay";

const SUPPORTED_LANG_CODES = new Set(LANGS.map((l) => l.code));
const INVALID_RESET_MESSAGE = "Reset link invalid or expired. Please request a new link.";
const handledRecoveryBootstrapKeys = new Set();
const handledRecoverySessionKeys = new Set();

const normalizeLang = (raw) => {
  const normalized = String(raw || "").toLowerCase();
  return SUPPORTED_LANG_CODES.has(normalized) ? normalized : "en";
};

function getRecoveryParams(urlValue) {
  const parsed = {
    type: "unknown",
    tokenType: "",
    code: "",
    accessToken: "",
    refreshToken: "",
    expiresAt: "",
    expiresIn: "",
    tokenHash: "",
    hasCode: false,
    hasAccessToken: false,
    hasRefreshToken: false,
    hasTokenHash: false,
    mode: "none",
  };

  try {
    const url = new URL(urlValue);
    const hashParams = new URLSearchParams((url.hash || "").replace(/^#/, ""));

    const type = (hashParams.get("type") || url.searchParams.get("type") || "").toLowerCase();
    parsed.type = type || "unknown";
    parsed.tokenType = hashParams.get("token_type") || url.searchParams.get("token_type") || "";
    parsed.expiresAt = hashParams.get("expires_at") || url.searchParams.get("expires_at") || "";
    parsed.expiresIn = hashParams.get("expires_in") || url.searchParams.get("expires_in") || "";

    parsed.code =
      url.searchParams.get("code") ||
      url.searchParams.get("token") ||
      hashParams.get("code") ||
      "";

    parsed.tokenHash =
      url.searchParams.get("token_hash") ||
      hashParams.get("token_hash") ||
      "";

    parsed.accessToken =
      hashParams.get("access_token") ||
      url.searchParams.get("access_token") ||
      "";

    parsed.refreshToken =
      hashParams.get("refresh_token") ||
      url.searchParams.get("refresh_token") ||
      "";

    parsed.hasCode = Boolean(parsed.code);
    parsed.hasAccessToken = Boolean(parsed.accessToken);
    parsed.hasRefreshToken = Boolean(parsed.refreshToken);
    parsed.hasTokenHash = Boolean(parsed.tokenHash);

    if (parsed.hasAccessToken && parsed.hasRefreshToken) parsed.mode = "tokens";
    else if (parsed.hasCode) parsed.mode = "code";
    else if (parsed.hasTokenHash) parsed.mode = "otp";
  } catch (e) {
    // no-op
  }

  return parsed;
}

export default function ResetPasswordPage({ onDone, onDiagnosticsChange, recoveryUrl }) {
  const onDiagnosticsChangeRef = useRef(onDiagnosticsChange);
  const trRef = useRef((key, fallback) => fallback);

  const initialLang = useMemo(() => {
    try {
      const queryLang = new URLSearchParams(window.location.search).get("lang");
      if (queryLang) return normalizeLang(queryLang);
    } catch (e) {}
    return normalizeLang(window.localStorage.getItem("flagLang") || "en");
  }, []);

  const [lang, setLang] = useState(initialLang);
  const tr = useMemo(
    () => (key, fallback) => {
      const val = translate(lang, key);
      return !val || val === key ? fallback : val;
    },
    [lang]
  );

  const [pwd1, setPwd1] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [diagnostics, setDiagnostics] = useState({
    paramsDetected: "none",
    recoveryModeUsed: "none",
    sessionEstablished: false,
    lastResetError: "",
  });

  const langList = useMemo(
    () =>
      LANGS.map((entry) => ({
        ...entry,
        localizedName: getLocalizedLanguageName(entry.code, lang),
      })),
    [lang]
  );

  const normalizeAuthErrorCode = (error) => {
    const code = String(error?.code || "").toLowerCase();
    const message = String(error?.message || "").toLowerCase();
    const status = String(error?.status || "").toLowerCase();
    const name = String(error?.name || "").toLowerCase();
    if (
      code === "same_password" ||
      message.includes("same password") ||
      message.includes("previous password") ||
      message.includes("new password should be different") ||
      name.includes("same_password") ||
      status === "same_password"
    ) {
      return "password_reused";
    }
    return "generic";
  };

  useEffect(() => {
    onDiagnosticsChangeRef.current = onDiagnosticsChange;
  }, [onDiagnosticsChange]);

  useEffect(() => {
    trRef.current = tr;
  }, [tr]);

  useEffect(() => {
    try {
      window.localStorage.setItem("flagLang", lang);
    } catch (e) {}
  }, [lang]);

  useEffect(() => {
    let cancelled = false;

    const withTimeout = async (promise, timeoutMs = 10000) => {
      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("recovery_timeout")), timeoutMs);
      });
      try {
        return await Promise.race([promise, timeoutPromise]);
      } finally {
        clearTimeout(timeoutId);
      }
    };

    (async () => {
      const nextDiagnostics = {
        paramsDetected: "none",
        recoveryModeUsed: "none",
        sessionEstablished: false,
        lastResetError: "",
      };

      setReady(false);
      setError("");

      try {
        const locationHref = typeof window !== "undefined" ? window.location.href : "";
        const locationPathname = typeof window !== "undefined" ? window.location.pathname : "";
        const locationSearch = typeof window !== "undefined" ? window.location.search : "";
        const locationHash = typeof window !== "undefined" ? window.location.hash : "";
        const parsed = getRecoveryParams(recoveryUrl || locationHref);
        const parsedHashParams = Object.fromEntries(new URLSearchParams((locationHash || "").replace(/^#/, "")).entries());
        console.log("[reset-password] window.location.href", locationHref);
        console.log("[reset-password] window.location.pathname", locationPathname);
        console.log("[reset-password] window.location.search", locationSearch);
        console.log("[reset-password] window.location.hash", locationHash);
        console.log("[reset-password] parsed hash params", parsedHashParams);
        const paramFlags = [];
        if (parsed.hasAccessToken) paramFlags.push("access_token");
        if (parsed.hasRefreshToken) paramFlags.push("refresh_token");
        if (parsed.hasCode) paramFlags.push("code");
        if (parsed.hasTokenHash) paramFlags.push("token_hash");
        if (parsed.expiresAt) paramFlags.push("expires_at");
        if (parsed.expiresIn) paramFlags.push("expires_in");
        if (parsed.tokenType) paramFlags.push("token_type");
        if (parsed.type && parsed.type !== "unknown") paramFlags.push("type");
        nextDiagnostics.paramsDetected = paramFlags.length ? paramFlags.join(",") : "none";

        const isHashTokenRecovery =
          parsed.type === "recovery" && parsed.hasAccessToken && parsed.hasRefreshToken;
        console.log("[reset-password] recovery mode activated", isHashTokenRecovery || parsed.mode !== "none");

        const bootstrapKey = [
          parsed.mode,
          parsed.type,
          parsed.code || "",
          parsed.tokenHash || "",
          parsed.accessToken || "",
          parsed.refreshToken || "",
          recoveryUrl || locationHref,
        ].join("::");
        if (handledRecoveryBootstrapKeys.has(bootstrapKey)) {
          console.log("[reset-password] bootstrap skipped because already handled", {
            mode: parsed.mode,
            type: parsed.type,
          });
        } else {
          handledRecoveryBootstrapKeys.add(bootstrapKey);
          console.log("[reset-password] bootstrap start", {
            mode: parsed.mode,
            type: parsed.type,
          });

          if (isHashTokenRecovery || parsed.mode === "tokens") {
            nextDiagnostics.recoveryModeUsed = "setSession";
            const sessionKey = `${parsed.accessToken || ""}::${parsed.refreshToken || ""}`;
            const { data: currentSessionData } = await withTimeout(supabase.auth.getSession());
            const hasSameSession =
              currentSessionData?.session?.access_token &&
              currentSessionData?.session?.access_token === parsed.accessToken;
            if (hasSameSession || handledRecoverySessionKeys.has(sessionKey)) {
              console.log("[reset-password] setSession skipped because session already exists / already handled", {
                hasSameSession,
                alreadyHandled: handledRecoverySessionKeys.has(sessionKey),
              });
            } else {
              console.log("[reset-password] setSession called");
              handledRecoverySessionKeys.add(sessionKey);
              const { error: setSessionError } = await withTimeout(supabase.auth.setSession({
                access_token: parsed.accessToken,
                refresh_token: parsed.refreshToken,
              }));
              if (setSessionError) throw setSessionError;
            }
          } else if (parsed.mode === "code") {
            nextDiagnostics.recoveryModeUsed = "exchangeCodeForSession";
            const { error: exchangeError } = await withTimeout(
              supabase.auth.exchangeCodeForSession(parsed.code)
            );
            if (exchangeError) throw exchangeError;
          } else if (parsed.mode === "otp" && parsed.type === "recovery") {
            nextDiagnostics.recoveryModeUsed = "verifyOtp";
            const { error: verifyError } = await withTimeout(
              supabase.auth.verifyOtp({ type: "recovery", token_hash: parsed.tokenHash })
            );
            if (verifyError) throw verifyError;
          } else {
            nextDiagnostics.recoveryModeUsed = "none";
          }
        }

        const { data } = await supabase.auth.getSession();
        const sessionPresent = Boolean(data?.session);
        console.log("[reset-password] session established from recovery tokens", sessionPresent);
        nextDiagnostics.sessionEstablished = sessionPresent;

        if (!sessionPresent) {
          nextDiagnostics.lastResetError = trRef.current("auth.resetInvalid", INVALID_RESET_MESSAGE);
          if (!cancelled) setError(trRef.current("auth.resetInvalid", INVALID_RESET_MESSAGE));
        }

        if (!cancelled) {
          setHasSession(sessionPresent);
          setDiagnostics(nextDiagnostics);
        }
      } catch (e) {
        nextDiagnostics.lastResetError = e?.message || trRef.current("auth.resetInvalid", INVALID_RESET_MESSAGE);
        if (!cancelled) {
          setHasSession(false);
          setError(trRef.current("auth.resetInvalid", INVALID_RESET_MESSAGE));
          setDiagnostics(nextDiagnostics);
        }
      } finally {
        if (!cancelled) {
          onDiagnosticsChangeRef.current &&
            onDiagnosticsChangeRef.current({
              recoveryPath: nextDiagnostics.recoveryModeUsed,
              sessionPresentAfterRecovery: nextDiagnostics.sessionEstablished,
              lastResetError: nextDiagnostics.lastResetError,
            });
          setReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [recoveryUrl]);

  const invalid = Boolean(error) && !hasSession;
  const showForm = ready && hasSession && !success;

  useEffect(() => {
    console.log("[reset-password] final render state", {
      loading,
      ready,
      invalid,
      isRecoveryFlow: true,
      hasSession,
      showForm,
    });
  }, [hasSession, invalid, loading, ready, showForm]);

  useEffect(() => {
    if (!success) return;
    const id = setTimeout(() => {
      onDone && onDone();
    }, 1200);
    return () => clearTimeout(id);
  }, [success, onDone]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!pwd1 || !pwd2) {
      setError(tr("auth.passwordRequired", "Please enter your new password."));
      return;
    }

    if (pwd1 !== pwd2) {
      setError(tr("auth.resetMismatch", "Passwords do not match."));
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: pwd1 });

    if (updateError) {
      const authErrorType = normalizeAuthErrorCode(updateError);
      const message =
        authErrorType === "password_reused"
          ? tr(
              "auth.passwordReuseError",
              "You cannot use a previous password. Please choose a new password."
            )
          : updateError.message || tr("auth.resetError", "Could not reset password.");
      setDiagnostics((prev) => ({ ...prev, lastResetError: message }));
      onDiagnosticsChange && onDiagnosticsChange({ lastResetError: message });
      setError(message);
      setLoading(false);
      return;
    }

    await supabase.auth.signOut();
    setLoading(false);
    setSuccess(true);
  }

  const inputStyle = {
    width: "100%",
    marginBottom: 10,
    height: 44,
    padding: "0 12px",
    boxSizing: "border-box",
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    fontSize: 16,
    color: "#1e293b",
    background: "#ffffff",
  };

  const secondaryButtonStyle = {
    width: "100%",
    minHeight: 48,
    borderRadius: 14,
    border: "1px solid #cbd5e1",
    background: "#f1f5f9",
    fontSize: 16,
    fontWeight: 700,
    color: "#0f172a",
    cursor: "pointer",
  };

  const primaryButtonStyle = {
    ...secondaryButtonStyle,
    border: "1px solid #0859c3",
    background: "#0b74ff",
    color: "#ffffff",
  };

  if (!ready) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0b74ff",
          color: "#fff",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        {tr("auth.loadingRecoveryLink", "Loading recovery link…")}
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #0b74ff 0%, #0859c3 100%)",
        display: "grid",
        placeItems: "center",
        padding: 20,
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: "#ffffff",
          borderRadius: 20,
          padding: 24,
          width: "min(460px, 100%)",
          boxShadow: "0 20px 45px rgba(2, 31, 86, 0.25)",
          border: "1px solid #d6dee9",
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: 10, color: "#0f172a", fontSize: 20, lineHeight: 1.2, fontWeight: 700 }}>
          {tr("auth.resetTitle", "Reset your password")}
        </h1>
        <p style={{ marginTop: 0, marginBottom: 14, color: "#334155", fontSize: 16 }}>
          {tr("auth.resetIntro", "Choose a new password for your FlagIQ account.")}
        </p>

        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="reset-language-select"
            style={{ display: "block", marginBottom: 8, fontWeight: 700, color: "#0f172a", fontSize: 16 }}
          >
            {tr("language", "Language")}
          </label>
          <select
            id="reset-language-select"
            value={lang}
            onChange={(event) => setLang(normalizeLang(event.target.value))}
            style={{ ...inputStyle, marginBottom: 0, appearance: "auto" }}
          >
            {langList.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.localizedName}
              </option>
            ))}
          </select>
        </div>

        {error && <div style={{ color: "#b91c1c", marginBottom: 10, fontSize: 17 }}>{error}</div>}

        {success ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ color: "#15803d", fontWeight: 700, fontSize: 17 }}>{tr("auth.resetSuccess", "Your password has been updated. You can now return to the app and log in.")}</div>
            <button type="button" onClick={() => onDone && onDone()} className="app-back-button" style={secondaryButtonStyle}>
              {tr("auth.backToLogin", "Back to login")}
            </button>
          </div>
        ) : !hasSession ? (
          <button type="button" onClick={() => onDone && onDone()} className="app-back-button" style={secondaryButtonStyle}>
            {tr("auth.backToLogin", "Back to login")}
          </button>
        ) : (
          <>
            <input
              type="password"
              placeholder={tr("auth.password", "Password")}
              value={pwd1}
              onChange={(e) => setPwd1(e.target.value)}
              style={inputStyle}
            />
            <input
              type="password"
              placeholder={tr("auth.passwordConfirm", "Confirm password")}
              value={pwd2}
              onChange={(e) => setPwd2(e.target.value)}
              style={{ ...inputStyle, marginBottom: 12 }}
            />
            <button disabled={loading} type="submit" style={{ ...primaryButtonStyle, opacity: loading ? 0.7 : 1 }}>
              {loading ? tr("loading", "Loading…") : tr("auth.resetSubmit", "Save new password")}
            </button>
          </>
        )}

        {IS_DEBUG_BUILD && (
          <div
            style={{
              marginTop: 14,
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: 10,
              fontSize: 12,
              color: "#334155",
            }}
          >
            <div>resetLinkParamsDetected: {diagnostics.paramsDetected}</div>
            <div>recoveryModeUsed: {diagnostics.recoveryModeUsed}</div>
            <div>sessionEstablished: {String(diagnostics.sessionEstablished)}</div>
            <div>lastResetError: {diagnostics.lastResetError || "-"}</div>
          </div>
        )}
      </form>
    </div>
  );
}
