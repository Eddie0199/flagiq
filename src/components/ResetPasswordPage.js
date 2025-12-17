// src/ResetPasswordPage.js
import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { t as translate } from "./i18n";

function validatePassword(pwd, tr) {
  if (!pwd || pwd.length < 6) {
    return tr("auth.passwordTooShort", "Password must be at least 6 characters.");
  }
  if (!/[A-Z]/.test(pwd)) {
    return tr(
      "auth.passwordNeedUpper",
      "Password must contain at least 1 uppercase letter."
    );
  }
  if (!/[a-z]/.test(pwd)) {
    return tr(
      "auth.passwordNeedLower",
      "Password must contain at least 1 lowercase letter."
    );
  }
  if (!/[^A-Za-z0-9]/.test(pwd)) {
    return tr(
      "auth.passwordNeedSpecial",
      "Password must contain at least 1 special character."
    );
  }
  return "";
}

export default function ResetPasswordPage() {
  // read last chosen language, or default to English
  const savedLang = window.localStorage.getItem("flagLang") || "en";
  const tr = (key, fallback) => translate(savedLang, key) || fallback;

  const [pwd1, setPwd1] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  // 🔑 IMPORTANT: hydrate recovery session from URL
  useEffect(() => {
    async function initSession() {
      const { data, error } = await supabase.auth.getSessionFromUrl({
        storeSession: true,
      });

      if (error || !data?.session) {
        console.error("Invalid or expired recovery link:", error);
        setError(
          tr(
            "auth.resetInvalid",
            "This reset link is invalid or has expired. Please request a new one."
          )
        );
        return;
      }

      setSessionReady(true);
    }

    initSession();
  }, [tr]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!sessionReady) {
      setError(
        tr(
          "auth.resetInvalid",
          "This reset link is invalid or has expired. Please request a new one."
        )
      );
      return;
    }

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
      setError(
        tr(
          "auth.resetError",
          "Could not update your password. The link may have expired."
        )
      );
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

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg,#0f172a,#1d293b)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "min(420px, 100%)",
          background: "#fff",
          borderRadius: 18,
          boxShadow: "0 20px 60px rgba(15,23,42,.35)",
          padding: "20px 22px 22px",
        }}
      >
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          {tr("auth.resetTitle", "Reset your password")}
        </h1>

        <p
          style={{
            fontSize: 14,
            color: "#64748b",
            marginBottom: 16,
          }}
        >
          {tr(
            "auth.resetIntro",
            "Choose a new password for your FlagIQ account."
          )}
        </p>

        <form onSubmit={handleSubmit}>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
            {tr("auth.password", "Password")}
          </label>

          <div style={{ position: "relative", marginBottom: 8 }}>
            <input
              type={showPwd ? "text" : "password"}
              value={pwd1}
              onChange={(e) => setPwd1(e.target.value)}
              placeholder={tr(
                "auth.passwordPlaceholder",
                "Enter your new password"
              )}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                fontSize: 16,
                boxSizing: "border-box",
              }}
            />
            <button
              type="button"
              onClick={() => setShowPwd((p) => !p)}
              style={{
                position: "absolute",
                right: 8,
                top: 6,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: 12,
                color: "#0f172a",
              }}
            >
              {showPwd ? tr("auth.hide", "Hide") : tr("auth.show", "Show")}
            </button>
          </div>

          <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
            {tr("auth.passwordConfirm", "Confirm password")}
          </label>

          <input
            type={showPwd ? "text" : "password"}
            value={pwd2}
            onChange={(e) => setPwd2(e.target.value)}
            placeholder={tr(
              "auth.passwordPlaceholder",
              "Re-enter your new password"
            )}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              fontSize: 16,
              boxSizing: "border-box",
              marginBottom: 6,
            }}
          />

          <div
            style={{
              fontSize: 12,
              marginBottom: 6,
              color: "#94a3b8",
            }}
          >
            {tr(
              "auth.passwordHint",
              "At least 6 characters, 1 uppercase, 1 lowercase, 1 special."
            )}
          </div>

          {error && (
            <div style={{ color: "#b91c1c", fontSize: 13, marginBottom: 8 }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{ color: "#15803d", fontSize: 13, marginBottom: 8 }}>
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              background: "#0f172a",
              color: "#fff",
              border: "none",
              borderRadius: 14,
              padding: "10px 12px",
              fontWeight: 700,
              cursor: "pointer",
              marginTop: 4,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading
              ? tr("loading", "Loading…")
              : tr("auth.resetSubmit", "Save new password")}
          </button>
        </form>
      </div>
    </div>
  );
}
