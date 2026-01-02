// src/components/ResetPasswordPage.js
import React, { useMemo, useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { LANGS, t as translate } from "../i18n";

const SUPPORTED_LANG_CODES = new Set(LANGS.map((l) => l.code));
const normalizeLang = (raw) => {
  const normalized = String(raw || "").toLowerCase();
  return SUPPORTED_LANG_CODES.has(normalized) ? normalized : "en";
};

function readLangFromQuery() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("lang");
  } catch (e) {
    return null;
  }
}

function validatePassword(pwd, tr) {
  if (!pwd || pwd.length < 6) {
    return tr("auth.passwordTooShort", "Password must be at least 6 characters.");
  }
  if (!/[A-Z]/.test(pwd)) {
    return tr("auth.passwordNeedUpper", "Password must contain at least 1 uppercase letter.");
  }
  if (!/[a-z]/.test(pwd)) {
    return tr("auth.passwordNeedLower", "Password must contain at least 1 lowercase letter.");
  }
  if (!/[^A-Za-z0-9]/.test(pwd)) {
    return tr("auth.passwordNeedSpecial", "Password must contain at least 1 special character.");
  }
  return "";
}

export default function ResetPasswordPage() {
  const initialLang = useMemo(() => {
    const queryLang = readLangFromQuery();
    if (queryLang) return normalizeLang(queryLang);
    return normalizeLang(window.localStorage.getItem("flagLang") || "en");
  }, []);
  const [lang, setLang] = useState(initialLang);

  // ✅ Fix missing translations: if translate() returns the key itself, use fallback
  const tr = useMemo(() => {
    return (key, fallback) => {
      const val = translate(lang, key);
      if (!val || val === key) return fallback;
      return val;
    };
  }, [lang]);

  const [pwd1, setPwd1] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  function handleLangChange(e) {
    const next = normalizeLang(e.target.value);
    setLang(next);
    window.localStorage.setItem("flagLang", next);
  }

  useEffect(() => {
    window.localStorage.setItem("flagLang", lang);
  }, [lang]);

  // ✅ After success, optionally redirect home
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => {
      window.location.assign("/");
    }, 2500);
    return () => clearTimeout(t);
  }, [success]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!pwd1 || !pwd2 || pwd1 !== pwd2) {
      setError(tr("auth.resetMismatch", "Passwords do not match."));
      return;
    }

    const pwdErr = validatePassword(pwd1, tr);
    if (pwdErr) {
      setError(pwdErr);
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({
      password: pwd1,
    });
    setLoading(false);

    if (updateError) {
      console.error("Reset password error:", updateError);
      setError(tr("auth.resetInvalid", "This reset link is invalid or has expired."));
      return;
    }

    setSuccess(
      tr(
        "auth.resetSuccess",
        "Your password has been updated. You can now return to the app and log in."
      )
    );
    setPwd1("");
    setPwd2("");
  }

  // ✅ iOS zoom prevention: keep inputs/selects at 16px+
  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    fontSize: 16,
    lineHeight: "20px",
    boxSizing: "border-box",
    outline: "none",
  };

  return (
    <div
      style={{
        height: "100dvh",          // ✅ better than 100vh on mobile
        minHeight: "100dvh",
        overflow: "hidden",        // ✅ prevents page scroll
        background: "linear-gradient(135deg,#0f172a,#1d293b)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
        boxSizing: "border-box",
        WebkitTextSizeAdjust: "100%",
      }}
    >
      <div
        style={{
          width: "min(420px, 100%)",
          maxHeight: "calc(100dvh - 24px)", // ✅ keep inside viewport
          overflowY: "auto",                // ✅ only scroll if genuinely needed
          WebkitOverflowScrolling: "touch",
          background: "#fff",
          borderRadius: 18,
          boxShadow: "0 20px 60px rgba(15,23,42,.35)",
          padding: "14px 16px 16px",
        }}
      >
        {/* Language selector */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <select
            value={lang}
            onChange={handleLangChange}
            aria-label="Language"
            style={{
              fontSize: 16,
              padding: "8px 10px",
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="pt">Português</option>
            <option value="de">Deutsch</option>
            <option value="fr">Français</option>
            <option value="nl">Nederlands</option>
          </select>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px 0" }}>
          {tr("auth.resetTitle", "Reset your password")}
        </h1>

        <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 14px 0" }}>
          {tr("auth.resetIntro", "Choose a new password for your FlagIQ account.")}
        </p>

        <form onSubmit={handleSubmit}>
          <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>
            {tr("auth.password", "Password")}
          </label>

          <div style={{ position: "relative", marginBottom: 12 }}>
            <input
              type={showPwd ? "text" : "password"}
              value={pwd1}
              onChange={(e) => setPwd1(e.target.value)}
              placeholder={tr("auth.passwordPlaceholder", "Enter your new password")}
              style={inputStyle}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPwd((p) => !p)}
              style={{
                position: "absolute",
                right: 10,
                top: 10,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: 14,
                color: "#0f172a",
                padding: 4,
              }}
            >
              {showPwd ? tr("auth.hide", "Hide") : tr("auth.show", "Show")}
            </button>
          </div>

          <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>
            {tr("auth.passwordConfirm", "Confirm password")}
          </label>

          <input
            type={showPwd ? "text" : "password"}
            value={pwd2}
            onChange={(e) => setPwd2(e.target.value)}
            placeholder={tr("auth.passwordPlaceholder2", "Re-enter your new password")}
            style={{ ...inputStyle, marginBottom: 10 }}
            autoComplete="new-password"
          />

          <div style={{ fontSize: 12, marginBottom: 10, color: "#94a3b8" }}>
            {tr(
              "auth.passwordHint",
              "At least 6 characters, 1 uppercase, 1 lowercase, 1 special."
            )}
          </div>

          {error ? (
            <div style={{ color: "#b91c1c", fontSize: 13, marginBottom: 10 }}>
              {error}
            </div>
          ) : null}

          {success ? (
            <div style={{ color: "#15803d", fontSize: 13, marginBottom: 10 }}>
              {success}
              <div style={{ marginTop: 10 }}>
                <a
                  href="/"
                  style={{
                    display: "inline-block",
                    fontSize: 14,
                    textDecoration: "none",
                    fontWeight: 700,
                    color: "#0f172a",
                  }}
                >
                  {tr("auth.backHome", "Back to FlagIQ")}
                </a>
              </div>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              background: "#0f172a",
              color: "#fff",
              border: "none",
              borderRadius: 14,
              padding: "12px 12px",
              fontSize: 16,
              fontWeight: 800,
              cursor: "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? tr("loading", "Loading…") : tr("auth.resetSubmit", "Save new password")}
          </button>
        </form>
      </div>
    </div>
  );
}

