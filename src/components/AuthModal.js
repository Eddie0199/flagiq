// src/components/AuthModal.js
import React, { useState } from "react";
import { emailRx } from "../App";
import {
  clearSupabaseSession,
  setSupabaseSessionPersistence,
  supabase,
} from "../supabaseClient";
import { LANGS } from "../i18n";

const SUPPORTED_LANG_CODES = new Set(LANGS.map((l) => l.code));
const normalizeLang = (raw) => {
  const normalized = String(raw || "").toLowerCase();
  return SUPPORTED_LANG_CODES.has(normalized) ? normalized : "en";
};

export default function AuthModal({
  lang,
  t,
  onClose,
  tab,
  setTab,
  users, // kept for compatibility (no longer used)
  setUsers, // kept for compatibility (no longer used)
  onLoggedIn,
}) {
  // login fields
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPwd, setLoginPwd] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [rememberMe, setRememberMe] = useState(true);

  // signup fields
  const [suUser, setSuUser] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPwd, setSuPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  // signup errors
  const [suErrUser, setSuErrUser] = useState("");
  const [suErrEmail, setSuErrEmail] = useState("");
  const [suErrPwd, setSuErrPwd] = useState("");

  // forgot-password / reset mode
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetErr, setResetErr] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  // small helper to get text safely
  const tr = (key, fallback) => (t && lang ? t(lang, key) : fallback);

  // password validator (signup only)
  function validatePassword(pwd) {
    if (!pwd || pwd.length < 6) {
      return tr(
        "auth.passwordTooShort",
        "Password must be at least 6 characters."
      );
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
    // at least one non-alphanumeric (special) character
    if (!/[^A-Za-z0-9]/.test(pwd)) {
      return tr(
        "auth.passwordNeedSpecial",
        "Password must contain at least 1 special character."
      );
    }
    return "";
  }

  // ---------- LOGIN (Supabase) ----------
  async function handleLogin(e) {
    e.preventDefault();
    setLoginErr("");

    const em = loginEmail.trim();
    const pwd = loginPwd;

    setSupabaseSessionPersistence(rememberMe);
    if (!rememberMe) {
      await clearSupabaseSession();
    }

    if (!em || !pwd) {
      setLoginErr(
        tr("auth.missingCredentials", "Please enter your email and password.")
      );
      return;
    }

    if (!emailRx.test(em)) {
      setLoginErr(tr("auth.emailInvalid", "Please enter a valid email."));
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: em,
      password: pwd,
    });

    if (error) {
      console.error("Login error:", error);
      setLoginErr(
        error.message ||
          tr("auth.invalidPassword", "Incorrect email or password.")
      );
      return;
    }

    const user = data.user;
    const username = user?.user_metadata?.username || user?.email || em;

    onLoggedIn &&
      onLoggedIn({
        id: user?.id || username,
        label: username,
      });
    onClose && onClose();
  }

  // ---------- SIGNUP (Supabase) ----------
  async function handleSignup(e) {
    e.preventDefault();
    setSuErrUser("");
    setSuErrEmail("");
    setSuErrPwd("");

    const u = suUser.trim();
    const em = suEmail.trim();
    const pw = suPwd;

    // username rule
    if (!u || u.length < 6) {
      setSuErrUser(
        tr("auth.usernameTooShort", "Username must be at least 6 characters.")
      );
      return;
    }

    // email required
    if (!em) {
      setSuErrEmail(tr("auth.emailRequired", "Email address is required."));
      return;
    }
    if (!emailRx.test(em)) {
      setSuErrEmail(tr("auth.emailInvalid", "Please enter a valid email."));
      return;
    }

    // password rule
    const pwdErr = validatePassword(pw);
    if (pwdErr) {
      setSuErrPwd(pwdErr);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: em,
      password: pw,
      options: {
        data: {
          username: u,
          display_name: u,
        },
      },
    });

    if (error) {
      console.error("Signup error:", error);
      setSuErrEmail(
        error.message ||
          tr("auth.genericSignupError", "Could not create account.")
      );
      return;
    }

    const user = data.user;
    const username = user?.user_metadata?.username || u;

    onLoggedIn &&
      onLoggedIn({
        id: user?.id || username,
        label: username,
      });
    onClose && onClose();
  }

  // ---------- RESET PASSWORD (Supabase) ----------
  async function handleReset(e) {
    e.preventDefault();
    setResetErr("");
    setResetMsg("");

    const em = resetEmail.trim();

    if (!em) {
      setResetErr(tr("auth.emailRequired", "Email address is required."));
      return;
    }
    if (!emailRx.test(em)) {
      setResetErr(tr("auth.emailInvalid", "Please enter a valid email."));
      return;
    }

    // Ensure the email always redirects to your app reset page
    const resetLang = normalizeLang(lang);
    const redirectTo = `https://wildmoustachegames.com/reset-password?lang=${resetLang}`;

    try {
      setResetLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(em, {
        redirectTo,
      });
      setResetLoading(false);

      if (error) {
        console.error("Reset error:", error);
        setResetErr(
          tr("auth.resetError", "Could not send reset link. Please try again.")
        );
        return;
      }

      setResetMsg(
        tr(
          "auth.resetEmailSent",
          "If an account exists for that email, you'll receive a reset link shortly."
        )
      );
    } catch (err) {
      console.error("Reset error:", err);
      setResetLoading(false);
      setResetErr(
        tr("auth.resetError", "Could not send reset link. Please try again.")
      );
    }
  }

  function openResetMode() {
    setIsResetMode(true);
    setResetEmail(loginEmail || "");
    setResetErr("");
    setResetMsg("");
  }

  function closeResetMode() {
    setIsResetMode(false);
    setResetErr("");
    setResetMsg("");
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,.35)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          width: "min(460px, 96vw)",
          background: "#fff",
          borderRadius: 18,
          boxShadow: "0 20px 60px rgba(15,23,42,.25)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* close */}
        <button
          onClick={onClose}
          className="modal-close-button"
          aria-label={tr("close", "Close")}
        >
          ×
        </button>

        {/* title */}
        <div style={{ padding: "16px 20px 6px" }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
            {isResetMode
              ? tr("auth.forgot", "Forgot password?")
              : tr("auth.welcome", "Welcome to FlagIQ")}
          </h2>
        </div>

        {/* tabs (hide in reset mode) */}
        {!isResetMode && (
          <div
            style={{
              display: "flex",
              gap: 0,
              padding: "0 20px 12px",
              marginTop: 4,
            }}
          >
            <button
              onClick={() => setTab("login")}
              style={{
                flex: 1,
                background: tab === "login" ? "#0f172a" : "#e2e8f0",
                color: tab === "login" ? "#fff" : "#0f172a",
                border: "none",
                padding: "8px 10px",
                borderRadius: 999,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {tr("login", "Login")}
            </button>
            <button
              onClick={() => setTab("signup")}
              style={{
                flex: 1,
                background: tab === "signup" ? "#0f172a" : "#e2e8f0",
                color: tab === "signup" ? "#fff" : "#0f172a",
                border: "none",
                padding: "8px 10px",
                borderRadius: 999,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {tr("createAccount", "Create Account")}
            </button>
          </div>
        )}

        {/* body */}
        <div style={{ padding: "0 20px 20px 20px" }}>
          {isResetMode ? (
            // ---------- RESET PASSWORD SCREEN ----------
            <form onSubmit={handleReset}>
              <p
                style={{
                  fontSize: 13,
                  color: "#64748b",
                  marginBottom: 10,
                  marginTop: 4,
                }}
              >
                {tr(
                  "auth.resetInfo",
                  "Enter your email and we’ll send you a link to reset your password."
                )}
              </p>

              <label
                style={{ display: "block", fontWeight: 600, marginBottom: 4 }}
              >
                {tr("auth.email", "Email")}
              </label>
              <input
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder={tr("auth.emailPlaceholder", "Enter your email")}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #e2e8f0",
                  marginBottom: 6,
                  fontSize: 16,
                  boxSizing: "border-box",
                }}
              />

              {resetErr ? (
                <div
                  style={{ color: "#b91c1c", fontSize: 13, marginBottom: 6 }}
                >
                  {resetErr}
                </div>
              ) : null}

              {resetMsg ? (
                <div
                  style={{ color: "#16a34a", fontSize: 13, marginBottom: 6 }}
                >
                  {resetMsg}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={resetLoading}
                style={{
                  width: "100%",
                  background: "#0f172a",
                  color: "#fff",
                  border: "none",
                  borderRadius: 14,
                  padding: "10px 12px",
                  fontWeight: 700,
                  cursor: resetLoading ? "default" : "pointer",
                  opacity: resetLoading ? 0.8 : 1,
                  marginTop: 4,
                  marginBottom: 10,
                }}
              >
                {resetLoading
                  ? tr("loading", "Loading…")
                  : tr("auth.sendResetLink", "Send reset link")}
              </button>

              <button
                type="button"
                onClick={closeResetMode}
                style={{
                  width: "100%",
                  background: "#e2e8f0",
                  color: "#0f172a",
                  border: "none",
                  borderRadius: 14,
                  padding: "8px 12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                {tr("auth.backToLogin", "Back to login")}
              </button>
            </form>
          ) : tab === "login" ? (
            // ---------- LOGIN SCREEN ----------
            <form onSubmit={handleLogin}>
              {/* email */}
              <label
                style={{ display: "block", fontWeight: 600, marginBottom: 4 }}
              >
                {tr("auth.email", "Email")}
              </label>
              <input
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder={tr("auth.emailPlaceholder", "Enter your email")}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #e2e8f0",
                  marginBottom: 10,
                  fontSize: 16,
                  boxSizing: "border-box",
                }}
              />

              {/* password */}
              <label
                style={{ display: "block", fontWeight: 600, marginBottom: 4 }}
              >
                {tr("auth.password", "Password")}
              </label>
              <input
                type="password"
                value={loginPwd}
                onChange={(e) => setLoginPwd(e.target.value)}
                placeholder={tr("auth.passwordPlaceholder", "Enter your password")}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #e2e8f0",
                  marginBottom: 4,
                  fontSize: 16,
                  boxSizing: "border-box",
                }}
              />

              {loginErr ? (
                <div
                  style={{ color: "#b91c1c", fontSize: 13, marginBottom: 6 }}
                >
                  {loginErr}
                </div>
              ) : null}

              <div
                style={{
                  fontSize: 12,
                  marginBottom: 12,
                  color: "#64748b",
                  textAlign: "right",
                }}
              >
                <button
                  type="button"
                  onClick={openResetMode}
                  style={{
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    margin: 0,
                    cursor: "pointer",
                    color: "#0f172a",
                    textDecoration: "underline",
                    fontSize: "inherit",
                  }}
                >
                  {tr("auth.forgot", "Forgot password?")}
                </button>
              </div>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 4,
                  color: "#0f172a",
                }}
              >
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                {tr("auth.keepSignedIn", "Keep me signed in")}
              </label>
              <div
                style={{
                  fontSize: 12,
                  color: "#94a3b8",
                  marginBottom: 14,
                }}
              >
                {tr(
                  "auth.keepSignedInHelper",
                  "Recommended on personal devices."
                )}
              </div>

              <button
                type="submit"
                style={{
                  width: "100%",
                  background: "#f3cc2f",
                  border: "none",
                  borderRadius: 14,
                  padding: "10px 12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {tr("login", "Login")}
              </button>
            </form>
          ) : (
            // ---------- SIGNUP SCREEN ----------
            <form onSubmit={handleSignup}>
              {/* username */}
              <label
                style={{ display: "block", fontWeight: 600, marginBottom: 4 }}
              >
                {tr("auth.username", "Username")}
              </label>
              <input
                value={suUser}
                onChange={(e) => setSuUser(e.target.value)}
                placeholder={tr("auth.usernamePlaceholder", "Pick a username")}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #e2e8f0",
                  marginBottom: 4,
                  fontSize: 16,
                  boxSizing: "border-box",
                }}
              />
              {suErrUser ? (
                <div
                  style={{ color: "#b91c1c", fontSize: 13, marginBottom: 6 }}
                >
                  {suErrUser}
                </div>
              ) : (
                <div
                  style={{ fontSize: 12, marginBottom: 6, color: "#94a3b8" }}
                >
                  {tr("auth.usernameHint", "Minimum 6 characters.")}
                </div>
              )}

              {/* email */}
              <label
                style={{ display: "block", fontWeight: 600, marginBottom: 4 }}
              >
                {tr("auth.email", "Email")}
              </label>
              <input
                value={suEmail}
                onChange={(e) => setSuEmail(e.target.value)}
                placeholder={tr("auth.emailPlaceholder", "Enter your email")}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #e2e8f0",
                  marginBottom: 4,
                  fontSize: 16,
                  boxSizing: "border-box",
                }}
              />
              {suErrEmail ? (
                <div
                  style={{ color: "#b91c1c", fontSize: 13, marginBottom: 6 }}
                >
                  {suErrEmail}
                </div>
              ) : null}

              {/* password */}
              <label
                style={{ display: "block", fontWeight: 600, marginBottom: 4 }}
              >
                {tr("auth.password", "Password")}
              </label>
              <div style={{ position: "relative", marginBottom: 4 }}>
                <input
                  type={showPwd ? "text" : "password"}
                  value={suPwd}
                  onChange={(e) => setSuPwd(e.target.value)}
                  placeholder={tr("auth.passwordPlaceholder", "Enter your password")}
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
              {suErrPwd ? (
                <div
                  style={{ color: "#b91c1c", fontSize: 13, marginBottom: 6 }}
                >
                  {suErrPwd}
                </div>
              ) : (
                <div
                  style={{ fontSize: 12, marginBottom: 6, color: "#94a3b8" }}
                >
                  {tr(
                    "auth.passwordHint",
                    "At least 6 characters, 1 upper, 1 lower, 1 special."
                  )}
                </div>
              )}

              <button
                type="submit"
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
                }}
              >
                {tr("createAccount", "Create Account")}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}









