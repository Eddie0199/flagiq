import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { LANGS, t as translate } from "../i18n";

const SUPPORTED_LANG_CODES = new Set(LANGS.map((l) => l.code));
const normalizeLang = (raw) => {
  const normalized = String(raw || "").toLowerCase();
  return SUPPORTED_LANG_CODES.has(normalized) ? normalized : "en";
};

const INVALID_RESET_MESSAGE = "Reset link invalid or expired. Please request a new link.";

export default function ResetPasswordPage({ onDone, onDiagnosticsChange }) {
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
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setReady(false);
      setError("");
      try {
        const { data } = await supabase.auth.getSession();
        const sessionPresent = Boolean(data?.session);
        if (!cancelled) {
          setHasSession(sessionPresent);
          onDiagnosticsChange && onDiagnosticsChange({
            sessionPresentAfterRecovery: sessionPresent,
            lastResetError: sessionPresent ? "" : INVALID_RESET_MESSAGE,
          });
          if (!sessionPresent) {
            setError(INVALID_RESET_MESSAGE);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setHasSession(false);
          setError(INVALID_RESET_MESSAGE);
          onDiagnosticsChange && onDiagnosticsChange({
            sessionPresentAfterRecovery: false,
            lastResetError: e?.message || INVALID_RESET_MESSAGE,
          });
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [onDiagnosticsChange]);

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
      onDiagnosticsChange && onDiagnosticsChange({ lastResetError: updateError.message || "Update failed" });
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
        {!hasSession ? (
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
