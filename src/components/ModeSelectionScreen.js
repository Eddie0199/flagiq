import React from "react";

function ModeCard({ color, icon, title, subtitle, progressLabel, starsLabel, onClick, disabled, t, lang }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        border: "none",
        borderRadius: 28,
        background: disabled ? "rgba(198, 218, 248, 0.92)" : color,
        color: disabled ? "#4f6898" : "#0f172a",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "18px 20px",
        textAlign: "left",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 32 }}>{icon}</span>
        <div>
          <div style={{ fontSize: 53/2, fontWeight: 800 }}>{title}</div>
          <div style={{ fontSize: 20/2, fontWeight: 700, opacity: disabled ? 0.75 : 1 }}>{subtitle}</div>
        </div>
      </div>
      <div style={{ minWidth: 94, textAlign: "right", fontWeight: 800 }}>
        {disabled ? (
          <span
            style={{
              borderRadius: 999,
              background: "rgba(255,255,255,0.45)",
              padding: "8px 14px",
              fontSize: 13,
            }}
          >
            {t ? t(lang, "comingSoon") : "Coming soon"}
          </span>
        ) : (
          <>
            <div style={{ fontSize: 14 }}>🏁 {progressLabel}</div>
            <div style={{ fontSize: 14, marginTop: 4 }}>⭐ {starsLabel}</div>
          </>
        )}
      </div>
    </button>
  );
}

export default function ModeSelectionScreen({
  t,
  lang,
  loggedIn,
  onSelectMode,
  onAuthRequest,
  classicStats,
  timetrialStats,
  maxLevelsByMode,
}) {
  const text = (key, fallback) => {
    if (!t || !lang) return fallback;
    const value = t(lang, key);
    return value === key ? fallback : value;
  };

  const classicCompleted = Math.max(0, Number(classicStats?.level || 0));
  const timetrialCompleted = Math.max(0, Number(timetrialStats?.level || 0));
  const classicStars = Math.max(0, Number(classicStats?.stars || 0));
  const timetrialStars = Math.max(0, Number(timetrialStats?.stars || 0));

  const classicMax = Number(maxLevelsByMode?.classic || 55);
  const trialMax = Number(maxLevelsByMode?.timetrial || 55);
  const maxStarsClassic = classicMax * 3;
  const maxStarsTrial = trialMax * 3;

  return (
    <div style={{ minHeight: "100vh", color: "white", padding: "16px 14px 24px" }}>
      <div style={{ textAlign: "center", marginTop: 44, marginBottom: 34 }}>
        <div style={{ fontSize: 64, lineHeight: 1 }}>🚩</div>
        <div style={{ fontSize: 54, fontWeight: 800, textShadow: "0 8px 16px rgba(15,23,42,.35)" }}>
          {text("appTitle", "FlagIQ")}
        </div>
      </div>

      {!loggedIn && (
        <div style={{ margin: "0 6px 12px" }}>
          <button
            onClick={() => onAuthRequest && onAuthRequest("login")}
            style={{
              width: "100%",
              border: "none",
              borderRadius: 16,
              background: "#fff",
              color: "#0f172a",
              fontWeight: 800,
              fontSize: 16,
              padding: "12px 16px",
              marginBottom: 8,
            }}
          >
            {text("signInCreateAccount", "Sign in / Create account")}
          </button>
          <div style={{ fontSize: 12, textAlign: "center", opacity: 0.95 }}>
            {text("guestModeHelper", "Sign in to save progress and compete on leaderboards")}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
        <ModeCard
          color="#f3cc2f"
          icon="🚩"
          title={text("classic", "Classic")}
          subtitle={text("classicDesc", "Learn flags at your pace")}
          progressLabel={`${classicCompleted}/${classicMax}`}
          starsLabel={`${classicStars}/${maxStarsClassic}`}
          onClick={() => onSelectMode && onSelectMode("classic")}
          t={t}
          lang={lang}
        />
        <ModeCard
          color="#38c5dd"
          icon="⏱️"
          title={text("timeTrial", "Time Trial")}
          subtitle={text("timeTrialDesc", "Beat the timer!")}
          progressLabel={`${timetrialCompleted}/${trialMax}`}
          starsLabel={`${timetrialStars}/${maxStarsTrial}`}
          onClick={() => onSelectMode && onSelectMode("timetrial")}
          t={t}
          lang={lang}
        />
        <ModeCard
          color="#dbeafe"
          icon="💀"
          title={text("localFlags", "Local Flags")}
          subtitle={text("localFlagsDesc", "Expert players only")}
          progressLabel="0/0"
          starsLabel="0/0"
          disabled
          t={t}
          lang={lang}
        />
      </div>

      <div style={{ textAlign: "center", marginTop: 42, opacity: 0.92 }}>
        <div style={{ fontWeight: 700 }}>Powered by <span style={{ fontStyle: "italic" }}>Wild Moustache Games</span></div>
        <div style={{ marginTop: 8, display: "flex", justifyContent: "center", gap: 10 }}>
          <span>{text("footerTerms", "Terms")}</span>
          <span>•</span>
          <span>{text("footerPrivacy", "Privacy")}</span>
          <span>•</span>
          <span>{text("footerContact", "Contact")}</span>
        </div>
      </div>
    </div>
  );
}
