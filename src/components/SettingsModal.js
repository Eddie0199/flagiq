// src/components/SettingsModal.js
import React, { useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { clearSupabaseSession, supabase } from "../supabaseClient";

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
  lang,
  setLang,
  activeUser,
  setActiveUser,
  activeUserLabel,
  setActiveUserLabel,
  LANGS = [],
  t,
  onResetProgress, // dev-only callback from App (optional)
}) {
  const loggedIn = !!activeUser;
  const [displayName, setDisplayName] = useState(() => activeUserLabel || "");
  const [userEmail, setUserEmail] = useState("");
  const [userCreatedAt, setUserCreatedAt] = useState("");
  const handleLogout = async () => {
    try {
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch (e) {
      // ignore logout errors
    } finally {
      await clearSupabaseSession();
      setActiveUser("");
      setActiveUserLabel && setActiveUserLabel("");
      onClose();
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function loadDisplayName() {
      if (!loggedIn) {
        if (isMounted) {
          setDisplayName("");
          setUserEmail("");
          setUserCreatedAt("");
        }
        return;
      }

      if (isMounted && activeUserLabel) {
        setDisplayName(activeUserLabel);
      }

      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;

        const user = data?.user;
        const label =
          user?.user_metadata?.display_name ||
          user?.user_metadata?.username ||
          user?.email ||
          user?.id;

        if (isMounted) {
          setDisplayName(label || activeUserLabel || "");
          setUserEmail(user?.email || "");
          setUserCreatedAt(user?.created_at || "");
        }
      } catch (err) {
        console.error("Failed to load user for display name", err);
        if (isMounted) {
          setDisplayName(activeUserLabel || "");
          setUserEmail("");
          setUserCreatedAt("");
        }
      }
    }

    loadDisplayName();
    return () => {
      isMounted = false;
    };
  }, [activeUser, activeUserLabel, loggedIn]);

  const memberSince = useMemo(() => {
    if (!userCreatedAt) return "";
    const locale = lang || undefined;
    try {
      return new Date(userCreatedAt).toLocaleDateString(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch (error) {
      return "";
    }
  }, [lang, userCreatedAt]);

  const displayLabel = displayName || activeUserLabel || activeUser || "";
  const avatarLetter =
    displayLabel.replace(/^@/, "").trim().charAt(0).toUpperCase() || "?";

  const langList = Array.isArray(LANGS)
    ? LANGS
    : Object.keys(LANGS || {}).map((code) => ({
        code,
        name: LANG_DISPLAY[code] || LANGS[code]?.name || code,
      }));

  const openExternalLink = async (url) => {
    if (
      Capacitor.isNativePlatform() &&
      typeof Capacitor.isPluginAvailable === "function" &&
      Capacitor.isPluginAvailable("Browser")
    ) {
      try {
        await Capacitor.Plugins?.Browser?.open?.({ url });
        return;
      } catch (error) {
        console.error("Failed to open link with Capacitor Browser", error);
      }
    }

    const newWindow = window.open(url, "_blank", "noopener,noreferrer");
    if (newWindow) {
      newWindow.opener = null;
    }
  };

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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                borderRadius: 18,
                border: "1px solid #e2e8f0",
                background: "#f8fafc",
                boxShadow: "0 8px 18px rgba(15, 23, 42, 0.08)",
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #e0e7ff, #fce7f3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  fontWeight: 700,
                  color: "#1e293b",
                }}
              >
                {avatarLetter}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
                  {displayLabel || (t ? t(lang, "username") : "Username")}
                </div>
                {userEmail && (
                  <div style={{ fontSize: 13, color: "#64748b" }}>
                    {userEmail}
                  </div>
                )}
                {memberSince && (
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>
                    {(t ? t(lang, "memberSince") : "Member since")} {memberSince}
                  </div>
                )}
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

        <label
          htmlFor="sound-effects-toggle"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "12px 14px",
            borderRadius: 16,
            border: "1px solid #e2e8f0",
            background: "#ffffff",
            boxShadow: "0 6px 16px rgba(15, 23, 42, 0.08)",
            cursor: "pointer",
            marginBottom: 14,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
              {t ? t(lang, "soundEffectsTitle") : "Sound Effects"}
            </div>
            <div style={{ fontSize: 12, color: "#64748b" }}>
              {t
                ? t(lang, "soundEffectsSubtitle")
                : "Play audio feedback during gameplay"}
            </div>
          </div>
          <div
            style={{
              width: 50,
              height: 28,
              borderRadius: 999,
              background: soundOn ? "#8b5cf6" : "#cbd5f5",
              display: "flex",
              alignItems: "center",
              padding: 3,
              boxShadow: soundOn
                ? "0 6px 12px rgba(139, 92, 246, 0.35)"
                : "inset 0 1px 3px rgba(15, 23, 42, 0.2)",
              transition: "all 0.2s ease",
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "#fff",
                transform: soundOn ? "translateX(22px)" : "translateX(0)",
                transition: "transform 0.2s ease",
                boxShadow: "0 2px 6px rgba(15, 23, 42, 0.2)",
              }}
            />
          </div>
          <input
            id="sound-effects-toggle"
            type="checkbox"
            checked={soundOn}
            onChange={(e) => setSoundOn(e.target.checked)}
            style={{
              position: "absolute",
              opacity: 0,
              pointerEvents: "none",
            }}
          />
        </label>

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

        <div style={{ marginTop: 12, marginBottom: 6 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <button
              onClick={() =>
                openExternalLink("https://wildmoustachegames.com/privacy.html")
              }
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: "#0f172a",
                textDecoration: "underline",
                fontSize: 13,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              Privacy Policy
            </button>
            <button
              onClick={() =>
                openExternalLink("https://wildmoustachegames.com/terms.html")
              }
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: "#0f172a",
                textDecoration: "underline",
                fontSize: 13,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              Terms & Conditions
            </button>
          </div>
        </div>

        {loggedIn && (
          <button
            onClick={handleLogout}
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
