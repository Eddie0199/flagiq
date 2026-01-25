// src/components/SettingsModal.js
import React, { useEffect, useMemo, useState } from "react";
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
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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

  const clearLocalUserData = (username) => {
    if (!username || typeof window === "undefined") return;
    const key = String(username).trim().toLowerCase();
    try {
      localStorage.removeItem(`flagiq:progress:${username}`);
      localStorage.removeItem(`flagiq:u:${username}:hints`);
      localStorage.removeItem(`flagiq:u:${username}:coins`);
      localStorage.removeItem(`flag_progress_${key}`);
    } catch (error) {
      // ignore local storage errors
    }
  };

  const handleDeleteAccount = async () => {
    if (!loggedIn || isDeleting) return;
    if (!supabase) {
      setDeleteError(
        t
          ? t(lang, "deleteAccountFailed")
          : "Unable to delete your account right now."
      );
      return;
    }

    setShowDeleteConfirm(false);
    setIsDeleting(true);
    setDeleteError("");
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      const userId = data?.user?.id;
      if (!userId) throw new Error("Missing user id.");

      await Promise.allSettled([
        supabase.from("player_state").delete().eq("user_id", userId),
        supabase.from("purchases").delete().eq("user_id", userId),
      ]);

      if (supabase?.auth?.admin?.deleteUser) {
        const { error: deleteError } = await supabase.auth.admin.deleteUser(
          userId
        );
        if (deleteError) throw deleteError;
      }

      clearLocalUserData(activeUser);
      await handleLogout();
    } catch (error) {
      console.error("Failed to delete account", error);
      setDeleteError(
        t
          ? t(lang, "deleteAccountFailed")
          : "Unable to delete your account right now."
      );
    } finally {
      setIsDeleting(false);
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
          className="modal-close-button"
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
              background: soundOn ? "#0b74ff" : "#cbd5f5",
              display: "flex",
              alignItems: "center",
              padding: 3,
              boxShadow: soundOn
                ? "0 6px 12px rgba(11, 116, 255, 0.35)"
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
          <div
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
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
              {t ? t(lang, "language") : "Language"}
            </div>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              style={{
                minWidth: 160,
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                padding: "6px 10px",
                fontSize: 13,
                background: "#fff",
              }}
            >
              {langList.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
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

        <div style={{ marginTop: 12, marginBottom: 6 }} />

        {loggedIn && (
          <>
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
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
              style={{
                width: "100%",
                background: "none",
                border: "none",
                borderRadius: 12,
                padding: "6px 0",
                fontWeight: 600,
                marginTop: 14,
                cursor: isDeleting ? "not-allowed" : "pointer",
                color: "#ef4444",
                textDecoration: "underline",
                fontSize: 12,
                textAlign: "center",
              }}
            >
              {t ? t(lang, "deleteAccount") : "Delete Account"}
            </button>
            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                color: "#64748b",
                textAlign: "center",
              }}
            >
              {t
                ? t(lang, "deleteAccountBody")
                : "This will permanently delete your account and all associated data."}
            </div>
            {deleteError ? (
              <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>
                {deleteError}
              </div>
            ) : null}
          </>
        )}
      </div>
      {showDeleteConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 999,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 18,
              width: "min(320px, 90vw)",
              padding: "18px 16px",
              boxShadow: "0 12px 28px rgba(15,23,42,0.25)",
              textAlign: "center",
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
              {t ? t(lang, "areYouSure") : "Are you sure?"}
            </h3>
            <p style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
              {t
                ? t(lang, "deleteAccountBody")
                : "This will permanently delete your account and all associated data."}
            </p>
            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "center",
              }}
            >
              <button
                onClick={() => setShowDeleteConfirm(false)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  background: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {t ? t(lang, "close") : "Close"}
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={isDeleting}
                style={{
                  padding: "8px 14px",
                  borderRadius: 12,
                  border: "none",
                  background: isDeleting ? "#fca5a5" : "#ef4444",
                  color: "white",
                  fontWeight: 700,
                  cursor: isDeleting ? "not-allowed" : "pointer",
                }}
              >
                {t ? t(lang, "deleteAccount") : "Delete Account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
