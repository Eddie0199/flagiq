import React from "react";
import Header from "./Header";

function formatSocialUsername(label) {
  const cleaned = String(label || "")
    .trim()
    .replace(/^@+/, "");
  return cleaned ? `@${cleaned}` : "@player";
}

function SectionCard({ title }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 20,
        padding: "18px 20px",
        boxShadow: "0 10px 22px rgba(15,23,42,0.12)",
      }}
    >
      <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a" }}>
        {title}
      </div>
      <div style={{ marginTop: 6, fontSize: 14, color: "#64748b", fontWeight: 600 }}>
        Coming soon
      </div>
    </div>
  );
}

export default function SocialScreen({
  activeUser,
  activeUserLabel,
  hearts,
  coins,
  username,
  onBack,
  onSettings,
  onAuthRequest,
  t,
  lang,
  onShop,
}) {
  const loggedIn = !!activeUser;
  const socialUsername = formatSocialUsername(activeUserLabel || username || activeUser);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Header
        showBack
        onBack={onBack}
        hearts={hearts}
        username={username}
        onSettings={onSettings}
        showHearts={loggedIn}
        showCoins={loggedIn}
        t={t}
        lang={lang}
        coins={coins}
        onCoinsClick={onShop}
      />

      <main
        style={{
          flex: 1,
          width: "100%",
          maxWidth: 720,
          margin: "0 auto",
          padding: "28px 18px 48px",
          boxSizing: "border-box",
        }}
      >
        {!loggedIn ? (
          <section
            style={{
              background: "#fff",
              borderRadius: 28,
              padding: "28px 22px",
              textAlign: "center",
              boxShadow: "0 18px 40px rgba(15, 23, 42, 0.18)",
            }}
          >
            <div style={{ fontSize: 42, marginBottom: 8 }} aria-hidden="true">
              🔒
            </div>
            <h1 style={{ margin: "0 0 10px", fontSize: 30, color: "#0f172a" }}>
              Social
            </h1>
            <p style={{ margin: "0 auto 22px", maxWidth: 460, color: "#475569", lineHeight: 1.5 }}>
              Create an account to add friends, challenge them, and join leaderboards.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <button
                onClick={() => onAuthRequest && onAuthRequest("signup")}
                style={{
                  padding: "12px 10px",
                  borderRadius: 16,
                  border: "1px solid #0b74ff",
                  background: "#0b74ff",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Create Account
              </button>
              <button
                onClick={() => onAuthRequest && onAuthRequest("login")}
                style={{
                  padding: "12px 10px",
                  borderRadius: 16,
                  border: "1px solid #e2e8f0",
                  background: "#f8fafc",
                  color: "#0f172a",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Log In
              </button>
            </div>
          </section>
        ) : (
          <section>
            <div style={{ marginBottom: 18, color: "#fff" }}>
              <h1 style={{ margin: 0, fontSize: 32, fontWeight: 900 }}>Social</h1>
              <div style={{ marginTop: 6, fontSize: 18, fontWeight: 800 }}>
                {socialUsername}
              </div>
            </div>
            <div style={{ display: "grid", gap: 14 }}>
              <SectionCard title="Friends" />
              <SectionCard title="Challenges" />
              <SectionCard title="Leaderboard" />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
