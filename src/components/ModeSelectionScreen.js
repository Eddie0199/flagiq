import React from "react";

export default function ModeSelectionScreen({
  t,
  lang,
  loggedIn,
  onBack,
  onSelectMode,
}) {
  const text = (key, fallback) => {
    if (!t || !lang) return fallback;
    const value = t(lang, key);
    return value === key ? fallback : value;
  };

  const modeItems = [
    { id: "classic", icon: "🚩", titleKey: "classic", titleFallback: "Classic", enabled: true },
    { id: "timetrial", icon: "⏱️", titleKey: "timeTrial", titleFallback: "Time Trial", enabled: true },
    { id: "local", icon: "🗺️", titleKey: "localFlags", titleFallback: "Local Flags", enabled: true },
    { id: "future", icon: "🧪", titleKey: "futureModeLabel", titleFallback: "More modes coming soon", enabled: false },
  ];

  return (
    <div style={{ minHeight: "100vh", padding: "14px 16px 24px", color: "white" }}>
      <button
        onClick={onBack}
        style={{
          border: "1px solid rgba(255,255,255,0.55)",
          borderRadius: 999,
          background: "rgba(255,255,255,0.12)",
          color: "#fff",
          fontWeight: 700,
          padding: "8px 14px",
          marginBottom: 18,
        }}
      >
        {text("back", "Back")}
      </button>

      <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>
        {text("modeSelectionTitle", "Choose your mode")}
      </div>
      <div style={{ fontSize: 14, opacity: 0.95, marginBottom: 14 }}>
        {text("modeSelectionSubtitle", "Pick a mode and start playing")}
      </div>

      {!loggedIn && (
        <div
          style={{
            fontSize: 13,
            marginBottom: 12,
            opacity: 0.92,
            padding: "8px 10px",
            borderRadius: 12,
            background: "rgba(255,255,255,0.12)",
          }}
        >
          {text("guestModeHelper", "Sign in to save progress and compete on leaderboards")}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {modeItems.map((mode) => (
          <button
            key={mode.id}
            onClick={() => mode.enabled && onSelectMode && onSelectMode(mode.id)}
            disabled={!mode.enabled}
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: 18,
              border: "none",
              textAlign: "left",
              background: mode.enabled ? "#ffffff" : "rgba(255,255,255,0.45)",
              color: "#0f172a",
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 17,
            }}
          >
            <span>
              <span style={{ marginRight: 8 }}>{mode.icon}</span>
              {text(mode.titleKey, mode.titleFallback)}
            </span>
            {!mode.enabled && (
              <span style={{ fontSize: 12, fontWeight: 700 }}>
                {text("comingSoon", "Coming soon")}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
