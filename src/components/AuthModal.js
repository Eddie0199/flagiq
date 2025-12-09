// src/components/AuthModal.js
import React, { useState } from "react";
import { emailRx } from "../App";
import { supabase } from "../supabaseClient";

export default function AuthModal({
  lang,
  t,
  onClose,
  tab,
  setTab,
  users,     // kept for compatibility (no longer used)
  setUsers,  // kept for compatibility (no longer used)
  onLoggedIn,
}) {
  // login fields
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPwd, setLoginPwd] = useState("");
  const [loginErr, setLoginErr] = useState("");

  // signup fields
  const [suUser, setSuUser] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPwd, setSuPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  // signup errors
  const [suErrUser, setSuErrUser] = useState("");
  const [suErrEmail, setSuErrEmail] = useState("");
  const [suErrPwd, setSuErrPwd] = useState("");

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
    const username =
      user?.user_metadata?.username || user?.email || em;

    onLoggedIn && onLoggedIn(username);
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
      full_name: u,
      name: u,
      user_name: u,
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

    onLoggedIn && onLoggedIn(username);
    onClose && onClose();
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
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            width: 34,
            height: 34,
            borderRadius: "999px",
            border: "1px solid #e2e8f0",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          ×
        </button>

        {/* title */}
        <div style={{ padding: "16px 20px 6px" }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
            {tr("auth.welcome", "Welcome to FlagIQ")}
          </h2>
        </div>

        {/* tabs */}
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

        {/* body */}
        <div style={{ padding: "0 20px 20px 20px" }}>
          {tab === "login" ? (
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
                placeholder={tr(
                  "auth.passwordPlaceholder",
                  "Enter your password"
                )}
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

<button
  type="button"
  onClick={async () => {
    const em = loginEmail.trim();
    if (!em) {
      alert("Enter your email above first.");
      return;
    }
    if (!emailRx.test(em)) {
      alert("Please enter a valid email.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(em);
    if (error) {
      console.error("Reset password error:", error);
      alert(error.message || "Could not send reset email.");
      return;
    }

    alert("If that email exists, a reset link has been sent.");
  }}
  style={{
    fontSize: 12,
    marginBottom: 12,
    color: "#2563eb",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
    textDecoration: "underline",
  }}
>
  {tr("auth.forgot", "Forgot password?")}
</button>
  
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
                  placeholder={tr(
                    "auth.passwordPlaceholder",
                    "Enter your password"
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





