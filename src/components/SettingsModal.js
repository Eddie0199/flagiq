// src/components/SettingsModal.js
import React from "react";

const LANG_DISPLAY = {
  en: "English",
  es: "Spanish",
  pt: "Portuguese",
  de: "German",
  fr: "French",
  nl: "Dutch",
};

export default function SettingsModal({
  onClose,
  soundOn,
  setSoundOn,
  volume,
  setVolume,
  lang,
  setLang,
  activeUser,
  setActiveUser,
  setActiveUserLabel,
  LANGS = [],
  t,
  onResetProgress, // dev-only callback from App (optional)
}) {
  const loggedIn = !!activeUser;

  const langList = Array.isArray(LANGS)
    ? LANGS
    : Object.keys(LANGS || {}).map((code) => ({
        code,
        name: LANG_DISPLAY[code] || LANGS[code]?.name || code,
      }));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.25)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 200,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(460px, 100%)",
          background: "#fff",
          borderRadius: 26,
          boxShadow: "0 18px 40px rgba(15, 23, 42, 0.15)",
          padding: "20px 22px 22px",
          position: "relative",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        <button
          onClick={onClose}
          aria-label={t ? t(lang, "close") : "Close"}
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            width: 30,
            height: 30,
            borderRadius: "999px",
            border: "1px solid rgba(15,23,42,1)",
            background: "#fff",
            cursor: "pointer",
            fontSize: 16,
            lineHeight: "28px",
          }}
        >
          ×
        </button>

        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 14 }}>
          {t ? t(lang, "profileSettings") : "Profile & Settings"}
        </h2>

        {loggedIn && (
          <>
            <div style={{ marginBottom: 14 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 500,
                  marginBottom: 4,
                  color: "#0f172a",
                }}
              >
                {t ? t(lang, "username") : "Username"}
              </label>
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 14,
                  padding: "9px 14px",
                  fontWeight: 500,
                  display: "inline-block",
                }}
              >
                @{activeUser}
              </div>
            </div>
            <hr
              style={{
                border: "none",
                borderBottom: "1px solid #e2e8f0",
                margin: "0 0 14px 0",
              }}
            />
          </>
        )}

        <div style={{ marginBottom: 12 }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            <input
              type="checkbox"
              checked={soundOn}
              onChange={(e) => setSoundOn(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            {t ? t(lang, "sound") : "Sound"}
          </label>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 500,
              marginBottom: 6,
              color: "#0f172a",
            }}
          >
            {t ? t(lang, "volume") : "Volume"}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ marginBottom: loggedIn ? 16 : 0 }}>
          <label
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 500,
              marginBottom: 6,
              color: "#0f172a",
            }}
          >
            {t ? t(lang, "language") : "Language"}
          </label>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            style={{
              width: "100%",
              border: "1px solid #e2e8f0",
              borderRadius: 14,
              padding: "9px 12px",
              fontSize: 14,
            }}
          >
            {langList.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        {/* DEV / TESTING: reset progress for current user (not for production) */}
        {loggedIn && onResetProgress && (
          <div
            style={{
              marginTop: 8,
              marginBottom: 8,
              padding: "10px 12px",
              borderRadius: 14,
              background: "#fef2f2",
              border: "1px solid #fee2e2",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                color: "#b91c1c",
                marginBottom: 6,
              }}
            >
              Dev / testing
            </div>
            <button
              onClick={() => {
                if (
                  window.confirm(
                    "Reset ALL levels and stars for this account? This cannot be undone."
                  )
                ) {
                  onResetProgress();
                }
              }}
              style={{
                width: "100%",
                padding: "8px 0",
                borderRadius: 12,
                border: "1px solid #b91c1c",
                background: "#fee2e2",
                color: "#7f1d1d",
                fontWeight: 700,
                cursor: "pointer",
                marginBottom: 2,
              }}
            >
              Reset all progress (dev)
            </button>
            <div
              style={{
                fontSize: 11,
                color: "#991b1b",
              }}
            >
              Clears stars and level progress for this user. Coins are kept.
            </div>
          </div>
        )}

        {loggedIn && (
          <button
            onClick={() => {
              setActiveUser("");
              setActiveUserLabel && setActiveUserLabel("");
              onClose();
            }}
            style={{
              width: "100%",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 16,
              padding: "10px 0",
              fontWeight: 600,
              marginTop: 14,
              cursor: "pointer",
            }}
          >
            {t ? t(lang, "logout") : "Log out"}
          </button>
        )}
      </div>
    </div>
  );
}
