import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { LANGS, t as translate } from "../i18n";

const SUPPORTED_LANG_CODES = new Set(LANGS.map((l) => l.code));
const normalizeLang = (raw) => {
  const normalized = String(raw || "").toLowerCase();
  return SUPPORTED_LANG_CODES.has(normalized) ? normalized : "en";
};

function parseRecoveryInput(url) {
  const parsed = {
    mode: "none",
    code: "",
    access_token: "",
    refresh_token: "",
  };
  if (!url) return parsed;
  try {
    const normalized = url.replace("flagiq://", "https://flagiq.local/");
    const u = new URL(normalized);
    const qs = u.searchParams;
    const hash = new URLSearchParams((u.hash || "").replace(/^#/, ""));
    const queryType = qs.get("type");
    const hashType = hash.get("type");
    const code = qs.get("code") || "";
    const accessToken = hash.get("access_token") || "";
    const refreshToken = hash.get("refresh_token") || "";
    if (code && queryType === "recovery") {
      return { ...parsed, mode: "code", code };
    }
    if (accessToken && refreshToken && hashType === "recovery") {
      return {
        ...parsed,
        mode: "tokens",
        access_token: accessToken,
        refresh_token: refreshToken,
      };
    }
  } catch (e) {}
  return parsed;
}

export default function ResetPasswordPage({ deepLinkUrl = "", onDone, onDiagnosticsChange }) {
  const initialLang = useMemo(() => {
    try {
      const queryLang = new URLSearchParams(window.location.search).get("lang");
      if (queryLang) return normalizeLang(queryLang);
    } catch (e) {}
    return normalizeLang(window.localStorage.getItem("flagLang") || "en");
  }, []);

  const [lang] = useState(initialLang);
  const tr = useMemo(() => {
    return (key, fallback) => {
      const val = translate(lang, key);
      return !val || val === key ? fallback : val;
    };
  }, [lang]);

  const [pwd1, setPwd1] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const recoveryUrl = deepLinkUrl || (typeof window !== "undefined" ? window.location.href : "");

  const [diag, setDiag] = useState({
    detectedRecoveryMode: "none",
    didExchangeOrSetSessionSucceed: false,
    sessionPresentAfterRecovery: false,
    lastResetError: "",
  });

  useEffect(() => {
    onDiagnosticsChange && onDiagnosticsChange(diag);
  }, [diag, onDiagnosticsChange]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setReady(false);
      setError("");
      const parsed = parseRecoveryInput(recoveryUrl);
      const nextDiag = {
        detectedRecoveryMode: parsed.mode,
        didExchangeOrSetSessionSucceed: false,
        sessionPresentAfterRecovery: false,
        lastResetError: "",
      };

      try {
        if (parsed.mode === "code") {
          const result = await supabase.auth.exchangeCodeForSession(parsed.code);
          if (result?.error) throw result.error;
          nextDiag.didExchangeOrSetSessionSucceed = true;
        } else if (parsed.mode === "tokens") {
          const result = await supabase.auth.setSession({
            access_token: parsed.access_token,
            refresh_token: parsed.refresh_token,
          });
          if (result?.error) throw result.error;
          nextDiag.didExchangeOrSetSessionSucceed = true;
        }

        const { data } = await supabase.auth.getSession();
        const hasSession = Boolean(data?.session);
        nextDiag.sessionPresentAfterRecovery = hasSession;
        if (!hasSession) {
          setError("Link expired or invalid. Please request a new reset email.");
        }
      } catch (e) {
        nextDiag.lastResetError = e?.message || "Recovery failed";
        setError("Link expired or invalid. Please request a new reset email.");
      }

      if (!cancelled) {
        setDiag(nextDiag);
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [recoveryUrl]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!pwd1 || pwd1 !== pwd2) {
      setError(tr("auth.resetMismatch", "Passwords do not match."));
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: pwd1 });
    if (updateError) {
      setDiag((prev) => ({ ...prev, lastResetError: updateError.message || "Update failed" }));
      setError(updateError.message || "Could not reset password.");
      setLoading(false);
      return;
    }

    await supabase.auth.signOut();
    setLoading(false);
    setSuccess("Password updated successfully.");
    setTimeout(() => {
      onDone && onDone();
    }, 900);
  }

  if (!ready) {
    return <div style={{ minHeight: "100vh", background: "#0b74ff", color: "#fff", display: "grid", placeItems: "center" }}>Loading recovery link…</div>;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0b74ff", display: "grid", placeItems: "center", padding: 16 }}>
      <form onSubmit={handleSubmit} style={{ background: "#fff", borderRadius: 16, padding: 16, width: "min(420px,100%)" }}>
        <h2 style={{ marginTop: 0 }}>{tr("auth.resetTitle", "Reset your password")}</h2>
        {error && <div style={{ color: "#b91c1c", marginBottom: 10 }}>{error}</div>}
        {!diag.sessionPresentAfterRecovery ? (
          <button type="button" onClick={() => onDone && onDone()} style={{ width: "100%" }}>
            Back to Login
          </button>
        ) : (
          <>
            <input type="password" placeholder="New password" value={pwd1} onChange={(e) => setPwd1(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
            <input type="password" placeholder="Confirm password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
            <button disabled={loading} type="submit" style={{ width: "100%" }}>{loading ? "Saving..." : "Save new password"}</button>
          </>
        )}
        {success && <div style={{ color: "#15803d", marginTop: 8 }}>{success}</div>}
      </form>
    </div>
  );
}
