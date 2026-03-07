import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { IS_DEBUG_BUILD } from "../debugTools";
import { LANGS, t as translate } from "../i18n";
import { getLocalizedLanguageName } from "../languageDisplay";

const SUPPORTED_LANG_CODES = new Set(LANGS.map((l) => l.code));
const INVALID_RESET_MESSAGE = "Reset link invalid or expired. Please request a new link.";
const handledRecoveryBootstrapKeys = new Set();
const handledRecoverySessionKeys = new Set();

const getInvalidReasonMessage = (tr, reason) => {
  if (reason === "no_recovery_params") {
    return tr("auth.resetInvalid", INVALID_RESET_MESSAGE);
  }
  if (reason === "recovery_session_missing") {
    return tr("auth.resetInvalid", INVALID_RESET_MESSAGE);
  }
  if (reason === "recovery_error") {
    return tr("auth.resetInvalid", INVALID_RESET_MESSAGE);
  }
  return "";
};

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
    invalidReason: "",
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
        invalidReason: "",
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
        const hasRecoveryParams = parsed.mode !== "none";
        let recoveryHandledSuccessfully = false;

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
              recoveryHandledSuccessfully = hasSameSession;
            } else {
              console.log("[reset-password] setSession called");
              const { data: setSessionData, error: setSessionError } = await withTimeout(supabase.auth.setSession({
                access_token: parsed.accessToken,
                refresh_token: parsed.refreshToken,
              }));
              console.log("[reset-password] setSession result", {
                success: !setSessionError,
                hasSessionInResponse: Boolean(setSessionData?.session),
                error: setSessionError?.message || "",
              });
              if (setSessionError) throw setSessionError;
              handledRecoverySessionKeys.add(sessionKey);
              recoveryHandledSuccessfully = Boolean(setSessionData?.session);
            }
          } else if (parsed.mode === "code") {
            nextDiagnostics.recoveryModeUsed = "exchangeCodeForSession";
            const { data: exchangeData, error: exchangeError } = await withTimeout(
              supabase.auth.exchangeCodeForSession(parsed.code)
            );
            recoveryHandledSuccessfully = Boolean(exchangeData?.session);
            if (exchangeError) throw exchangeError;
          } else if (parsed.mode === "otp" && parsed.type === "recovery") {
            nextDiagnostics.recoveryModeUsed = "verifyOtp";
            const { data: verifyData, error: verifyError } = await withTimeout(
              supabase.auth.verifyOtp({ type: "recovery", token_hash: parsed.tokenHash })
            );
            recoveryHandledSuccessfully = Boolean(verifyData?.session);
            if (verifyError) throw verifyError;
          } else {
            nextDiagnostics.recoveryModeUsed = "none";
          }
        }

        const { data } = await supabase.auth.getSession();
        const sessionPresent = Boolean(data?.session);
        console.log("[reset-password] session after recovery bootstrap", {
          sessionPresent,
          recoveryHandledSuccessfully,
          hasRecoveryParams,
        });
        nextDiagnostics.sessionEstablished = sessionPresent;

        let invalidReason = "";
        if (!hasRecoveryParams && !sessionPresent) invalidReason = "no_recovery_params";
        else if (hasRecoveryParams && !sessionPresent) invalidReason = "recovery_session_missing";

        if (invalidReason) {
          nextDiagnostics.invalidReason = invalidReason;
          nextDiagnostics.lastResetError = getInvalidReasonMessage(trRef.current, invalidReason);
          console.log("[reset-password] invalid=true", {
            reason: invalidReason,
            recoveryModeUsed: nextDiagnostics.recoveryModeUsed,
            hasRecoveryParams,
            recoveryHandledSuccessfully,
            sessionPresent,
          });
          if (!cancelled) setError(getInvalidReasonMessage(trRef.current, invalidReason));
        }

        if (!cancelled) {
          setHasSession(sessionPresent);
          setDiagnostics(nextDiagnostics);
        }
      } catch (e) {
        nextDiagnostics.lastResetError = e?.message || trRef.current("auth.resetInvalid", INVALID_RESET_MESSAGE);
        nextDiagnostics.invalidReason = "recovery_error";
        console.log("[reset-password] invalid=true", {
          reason: "recovery_error",
          error: e?.message || String(e),
        });
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
    const renderBranch = !ready ? "loading" : success ? "success" : showForm ? "form" : invalid ? "invalid" : "unknown";
    console.log("[reset-password] final render state", {
      renderBranch,
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

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#0b74ff] px-4 py-10 text-white">
        <div className="mx-auto flex min-h-[70vh] w-full max-w-lg items-center justify-center">
          <div className="rounded-3xl border border-white/20 bg-white/10 px-8 py-6 text-center shadow-2xl backdrop-blur-sm">
            {tr("auth.loadingRecoveryLink", "Loading recovery link…")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b74ff] px-4 py-8">
      <div className="mx-auto w-full max-w-lg pb-8 pt-4">
      <form
        onSubmit={handleSubmit}
        className="w-full rounded-[20px] border border-slate-200 bg-white p-6 shadow-[0_20px_45px_rgba(2,31,86,0.25)]"
      >
        <h1 className="mb-2 mt-0 text-2xl font-extrabold text-slate-900">{tr("auth.resetTitle", "Reset your password")}</h1>
        <p className="mb-4 mt-0 text-sm font-medium text-slate-600">
          {tr("auth.resetIntro", "Choose a new password for your FlagIQ account.")}
        </p>

        <div className="mb-4">
          <label htmlFor="reset-language-select" className="mb-1.5 block text-sm font-semibold text-slate-900">
            {tr("language", "Language")}
          </label>
          <select
            id="reset-language-select"
            value={lang}
            onChange={(event) => setLang(normalizeLang(event.target.value))}
            className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-[#0b74ff] focus:ring-2 focus:ring-[#0b74ff]/20"
          >
            {langList.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.localizedName}
              </option>
            ))}
          </select>
        </div>

        {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</div>}

        {success ? (
          <div className="grid gap-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{tr("auth.resetSuccess", "Your password has been updated. You can now return to the app and log in.")}</div>
            <button type="button" onClick={() => onDone && onDone()} className="app-back-button h-11 w-full rounded-xl border border-slate-900 bg-white px-4 text-sm font-bold">
              {tr("auth.backToLogin", "Back to login")}
            </button>
          </div>
        ) : !hasSession ? (
          <button type="button" onClick={() => onDone && onDone()} className="app-back-button h-11 w-full rounded-xl border border-slate-900 bg-white px-4 text-sm font-bold">
            {tr("auth.backToLogin", "Back to login")}
          </button>
        ) : (
          <>
            <input
              type="password"
              placeholder={tr("auth.password", "Password")}
              value={pwd1}
              onChange={(e) => setPwd1(e.target.value)}
              className="mb-2.5 h-11 w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-[#0b74ff] focus:ring-2 focus:ring-[#0b74ff]/20"
            />
            <input
              type="password"
              placeholder={tr("auth.passwordConfirm", "Confirm password")}
              value={pwd2}
              onChange={(e) => setPwd2(e.target.value)}
              className="mb-3 h-11 w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-[#0b74ff] focus:ring-2 focus:ring-[#0b74ff]/20"
            />
            <button disabled={loading} type="submit" className="h-11 w-full rounded-xl border border-[#0859c3] bg-[#0b74ff] px-4 text-sm font-bold text-white shadow-sm transition enabled:hover:bg-[#0a68e4] disabled:cursor-not-allowed disabled:opacity-70">
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
            <div>invalidReason: {diagnostics.invalidReason || "-"}</div>
          </div>
        )}
      </form>
      </div>
    </div>
  );
}
