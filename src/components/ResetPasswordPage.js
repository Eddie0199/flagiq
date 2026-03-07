import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { IS_DEBUG_BUILD } from "../debugTools";
import { LANGS, t as translate } from "../i18n";
import { getLocalizedLanguageName } from "../languageDisplay";

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

    const type = (url.searchParams.get("type") || hashParams.get("type") || "").toLowerCase();
    parsed.type = type || "unknown";

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
        const parsed = getRecoveryParams(recoveryUrl || window.location.href);
        const paramFlags = [];
        if (parsed.hasAccessToken) paramFlags.push("access_token");
        if (parsed.hasRefreshToken) paramFlags.push("refresh_token");
        if (parsed.hasCode) paramFlags.push("code");
        if (parsed.hasTokenHash) paramFlags.push("token_hash");
        nextDiagnostics.paramsDetected = paramFlags.length ? paramFlags.join(",") : "none";

        if (parsed.mode === "tokens") {
          nextDiagnostics.recoveryModeUsed = "setSession";
          const { error: setSessionError } = await withTimeout(supabase.auth.setSession({
            access_token: parsed.accessToken,
            refresh_token: parsed.refreshToken,
          }));
          if (setSessionError) throw setSessionError;
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

        const { data } = await supabase.auth.getSession();
        const sessionPresent = Boolean(data?.session);
        nextDiagnostics.sessionEstablished = sessionPresent;

        if (!sessionPresent) {
          nextDiagnostics.lastResetError = tr("auth.resetInvalid", INVALID_RESET_MESSAGE);
          if (!cancelled) setError(tr("auth.resetInvalid", INVALID_RESET_MESSAGE));
        }

        if (!cancelled) {
          setHasSession(sessionPresent);
          setDiagnostics(nextDiagnostics);
        }
      } catch (e) {
        nextDiagnostics.lastResetError = e?.message || tr("auth.resetInvalid", INVALID_RESET_MESSAGE);
        if (!cancelled) {
          setHasSession(false);
          setError(tr("auth.resetInvalid", INVALID_RESET_MESSAGE));
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
  }, [onDiagnosticsChange, recoveryUrl, tr]);

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

  if (!ready) {
    return (
      <div style={{ minHeight: "100vh", background: "#0b74ff", color: "#fff", display: "grid", placeItems: "center" }}>
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
        <h1 style={{ marginTop: 0, marginBottom: 10, color: "#0f172a" }}>{tr("auth.resetTitle", "Reset your password")}</h1>
        <p style={{ marginTop: 0, marginBottom: 10, color: "#334155" }}>
          {tr("auth.resetIntro", "Choose a new password for your FlagIQ account.")}
        </p>

        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="reset-language-select"
            style={{ display: "block", marginBottom: 6, fontWeight: 600, color: "#0f172a" }}
          >
            {tr("language", "Language")}
          </label>
          <select
            id="reset-language-select"
            value={lang}
            onChange={(event) => setLang(normalizeLang(event.target.value))}
            style={{ width: "100%", height: 40, borderRadius: 10, border: "1px solid #cbd5e1", padding: "0 10px" }}
          >
            {langList.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.localizedName}
              </option>
            ))}
          </select>
        </div>

        {error && <div style={{ color: "#b91c1c", marginBottom: 10 }}>{error}</div>}

        {success ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ color: "#15803d", fontWeight: 700 }}>{tr("auth.resetSuccess", "Your password has been updated. You can now return to the app and log in.")}</div>
            <button type="button" onClick={() => onDone && onDone()} className="app-back-button" style={{ width: "100%" }}>
              {tr("auth.backToLogin", "Back to login")}
            </button>
          </div>
        ) : !hasSession ? (
          <button type="button" onClick={() => onDone && onDone()} className="app-back-button" style={{ width: "100%" }}>
            {tr("auth.backToLogin", "Back to login")}
          </button>
        ) : (
          <>
            <input
              type="password"
              placeholder={tr("auth.password", "Password")}
              value={pwd1}
              onChange={(e) => setPwd1(e.target.value)}
              style={{ width: "100%", marginBottom: 10, height: 42, padding: "0 12px", boxSizing: "border-box" }}
            />
            <input
              type="password"
              placeholder={tr("auth.passwordConfirm", "Confirm password")}
              value={pwd2}
              onChange={(e) => setPwd2(e.target.value)}
              style={{ width: "100%", marginBottom: 12, height: 42, padding: "0 12px", boxSizing: "border-box" }}
            />
            <button disabled={loading} type="submit" style={{ width: "100%", height: 42 }}>
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
