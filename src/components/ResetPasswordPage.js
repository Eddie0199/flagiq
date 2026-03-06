import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { IS_DEBUG_BUILD } from "../debugTools";
import { LANGS, t as translate } from "../i18n";

const SUPPORTED_LANG_CODES = new Set(LANGS.map((l) => l.code));
const INVALID_RESET_MESSAGE = "Reset link invalid or expired. Please request a new link.";

const normalizeLang = (raw) => {
  const normalized = String(raw || "").toLowerCase();
  return SUPPORTED_LANG_CODES.has(normalized) ? normalized : "en";
};

function getRecoveryParams(urlValue) {
  const parsed = {
    type: "unknown",
    code: "",
    accessToken: "",
    refreshToken: "",
    hasCode: false,
    hasAccessToken: false,
    hasRefreshToken: false,
    mode: "none",
  };

  try {
    const url = new URL(urlValue);
    const hashParams = new URLSearchParams((url.hash || "").replace(/^#/, ""));

    const type = (url.searchParams.get("type") || hashParams.get("type") || "").toLowerCase();
    parsed.type = type || "unknown";

    parsed.code =
      url.searchParams.get("code") ||
      url.searchParams.get("token") ||
      hashParams.get("code") ||
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

    if (parsed.hasAccessToken && parsed.hasRefreshToken) parsed.mode = "tokens";
    else if (parsed.hasCode) parsed.mode = "code";
  } catch (e) {
    // no-op
  }

  return parsed;
}

export default function ResetPasswordPage({ onDone, onDiagnosticsChange }) {
  const initialLang = useMemo(() => {
    try {
      const queryLang = new URLSearchParams(window.location.search).get("lang");
      if (queryLang) return normalizeLang(queryLang);
    } catch (e) {}
    return normalizeLang(window.localStorage.getItem("flagLang") || "en");
  }, []);

  const [lang] = useState(initialLang);
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

  useEffect(() => {
    let cancelled = false;

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
        const parsed = getRecoveryParams(window.location.href);
        const paramFlags = [];
        if (parsed.hasAccessToken) paramFlags.push("access_token");
        if (parsed.hasRefreshToken) paramFlags.push("refresh_token");
        if (parsed.hasCode) paramFlags.push("code");
        nextDiagnostics.paramsDetected = paramFlags.length ? paramFlags.join(",") : "none";

        if (parsed.mode === "tokens") {
          nextDiagnostics.recoveryModeUsed = "setSession";
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: parsed.accessToken,
            refresh_token: parsed.refreshToken,
          });
          if (setSessionError) throw setSessionError;
        } else if (parsed.mode === "code") {
          nextDiagnostics.recoveryModeUsed = "exchangeCodeForSession";
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(parsed.code);
          if (exchangeError) throw exchangeError;
        } else {
          nextDiagnostics.recoveryModeUsed = "none";
        }

        const { data } = await supabase.auth.getSession();
        const sessionPresent = Boolean(data?.session);
        nextDiagnostics.sessionEstablished = sessionPresent;

        if (!sessionPresent) {
          nextDiagnostics.lastResetError = INVALID_RESET_MESSAGE;
          if (!cancelled) setError(INVALID_RESET_MESSAGE);
        }

        if (!cancelled) {
          setHasSession(sessionPresent);
          setDiagnostics(nextDiagnostics);
        }
      } catch (e) {
        nextDiagnostics.lastResetError = e?.message || INVALID_RESET_MESSAGE;
        if (!cancelled) {
          setHasSession(false);
          setError(INVALID_RESET_MESSAGE);
          setDiagnostics(nextDiagnostics);
        }
      } finally {
        if (!cancelled) {
          onDiagnosticsChange &&
            onDiagnosticsChange({
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
  }, [onDiagnosticsChange]);

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
      const message = updateError.message || "Could not reset password.";
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

  if (!ready) {
    return (
      <div style={{ minHeight: "100vh", background: "#0b74ff", color: "#fff", display: "grid", placeItems: "center" }}>
        Loading recovery link…
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
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: 10, color: "#0f172a" }}>Reset Password</h1>
        <p style={{ marginTop: 0, marginBottom: 16, color: "#334155" }}>
          Choose a new password for your FlagIQ account.
        </p>

        {error && <div style={{ color: "#b91c1c", marginBottom: 10 }}>{error}</div>}

        {success ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ color: "#15803d", fontWeight: 700 }}>Password updated successfully.</div>
            <button type="button" onClick={() => onDone && onDone()} style={{ width: "100%" }}>
              Back to Login / Game
            </button>
          </div>
        ) : !hasSession ? (
          <button type="button" onClick={() => onDone && onDone()} style={{ width: "100%" }}>
            Back to Login / Game
          </button>
        ) : (
          <>
            <input
              type="password"
              placeholder="New password"
              value={pwd1}
              onChange={(e) => setPwd1(e.target.value)}
              style={{ width: "100%", marginBottom: 10, height: 42, padding: "0 12px", boxSizing: "border-box" }}
            />
            <input
              type="password"
              placeholder="Confirm password"
              value={pwd2}
              onChange={(e) => setPwd2(e.target.value)}
              style={{ width: "100%", marginBottom: 12, height: 42, padding: "0 12px", boxSizing: "border-box" }}
            />
            <button disabled={loading} type="submit" style={{ width: "100%", height: 42 }}>
              {loading ? "Updating…" : "Update password"}
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
