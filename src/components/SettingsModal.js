// src/components/SettingsModal.js
import React, { useEffect, useMemo, useState } from "react";
import { clearSupabaseSession, supabase } from "../supabaseClient";
import { getLocalizedLanguageName } from "../languageDisplay";
import usePressAction from "./usePressAction";

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
  setScreen,
  LANGS = [],
  t,
  onResetProgress, // dev-only callback from App (optional)
  onAuthRequest,
  onRestorePurchases,
  isGuestMode = false,
}) {
  const loggedIn = !!activeUser;
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState("info");
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [displayName, setDisplayName] = useState(() => activeUserLabel || "");
  const [userEmail, setUserEmail] = useState("");
  const [userCreatedAt, setUserCreatedAt] = useState("");
  const tx = (key) => (t ? t(lang, key) : key);

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

  const handleDeleteAccount = async () => {
    if (!supabase || deleteBusy) return;
    setDeleteBusy(true);
    setStatusMessage("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("You must be logged in to delete your account.");
      }

      const { data, error } = await supabase.functions.invoke("delete-account");

      if (error) {
        console.error("Delete account function error", error, data);
        throw new Error(error.message || "We could not delete your account.");
      }

      try {
        await supabase.auth.signOut();
      } catch (e) {
        // ignore sign out errors, we still clear local auth state below
      }
      await clearSupabaseSession();
      setActiveUser("");
      setActiveUserLabel && setActiveUserLabel("");
      setDeleteConfirmOpen(false);
      setStatusType("success");
      setStatusMessage("Your account has been permanently deleted.");
      setScreen && setScreen("home");
      setTimeout(() => {
        onClose();
      }, 900);
    } catch (error) {
      console.error("Account deletion failed", error);
      setStatusType("error");
      setStatusMessage(
        error?.message ||
          "We could not delete your account right now. Please try again."
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleRestorePurchases = async () => {
    if (restoreBusy || !onRestorePurchases) return;
    setRestoreBusy(true);
    setStatusType("info");
    setStatusMessage(tx("restorePurchasesWorking"));
    try {
      const result = await onRestorePurchases();
      if (!result?.success) {
        throw new Error(result?.error || tx("restorePurchasesFailed"));
      }
      setStatusType("success");
      setStatusMessage(tx("restorePurchasesSuccess"));
    } catch (error) {
      setStatusType("error");
      setStatusMessage(error?.message || tx("restorePurchasesFailed"));
    } finally {
      setRestoreBusy(false);
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

  const langList = (Array.isArray(LANGS)
    ? LANGS
    : Object.keys(LANGS || {}).map((code) => ({
        code,
      }))
  ).map((entry) => ({
    ...entry,
    name: getLocalizedLanguageName(entry.code, lang),
  }));
  const closePress = usePressAction({ id: "settings-modal-close", onPress: onClose });
  const overlayPress = usePressAction({ id: "settings-modal-overlay", onPress: onClose });

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
      onPointerDown={overlayPress.onPointerDown}
      onClick={overlayPress.onClick}
    >
      <div
        onPointerDown={(e) => e.stopPropagation()}
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
          onPointerDown={closePress.onPointerDown}
          onClick={closePress.onClick}
          aria-label={tx("close")}
          className="modal-close-button"
        >
          ×
        </button>

        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 14 }}>
          {tx("profileSettings")}
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

        {statusMessage && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 12,
              fontSize: 12,
              border:
                statusType === "success"
                  ? "1px solid #86efac"
                  : statusType === "error"
                    ? "1px solid #fca5a5"
                    : "1px solid #cbd5e1",
              background:
                statusType === "success"
                  ? "#f0fdf4"
                  : statusType === "error"
                    ? "#fff1f2"
                    : "#f8fafc",
              color:
                statusType === "success"
                  ? "#166534"
                  : statusType === "error"
                    ? "#9f1239"
                    : "#334155",
            }}
          >
            {statusMessage}
          </div>
        )}

        {!loggedIn && isGuestMode && (
          <div
            style={{
              marginTop: 10,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
            <button
              onClick={() => onAuthRequest && onAuthRequest("login")}
              style={{
                width: "100%",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 16,
                padding: "10px 0",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {tx("login")}
            </button>
            <button
              onClick={() => onAuthRequest && onAuthRequest("signup")}
              style={{
                width: "100%",
                background: "#0b74ff",
                color: "#fff",
                border: "1px solid #0b74ff",
                borderRadius: 16,
                padding: "10px 0",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {tx("auth.signupTab")}
            </button>
          </div>
        )}

        <button
          onClick={handleRestorePurchases}
          disabled={restoreBusy}
          style={{
            width: "100%",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 16,
            padding: "10px 0",
            fontWeight: 600,
            marginTop: 14,
            cursor: restoreBusy ? "not-allowed" : "pointer",
            opacity: restoreBusy ? 0.7 : 1,
          }}
        >
          {restoreBusy ? tx("restorePurchasesWorking") : tx("restorePurchases")}
        </button>

        {loggedIn && (
          <button
            onClick={handleLogout}
            style={{
              width: "100%",
              background: "#0f172a",
              color: "#fff",
              border: "1px solid #0f172a",
              borderRadius: 16,
              padding: "11px 0",
              fontWeight: 700,
              marginTop: 14,
              cursor: "pointer",
              boxShadow: "0 8px 16px rgba(15, 23, 42, 0.2)",
            }}
          >
            {tx("logout")}
          </button>
        )}

        {loggedIn && (
          <button
            onClick={() => {
              setStatusMessage("");
              setDeleteConfirmOpen(true);
            }}
            style={{
              marginTop: 10,
              background: "transparent",
              color: "#dc2626",
              border: "none",
              padding: "2px 0",
              fontWeight: 600,
              textDecoration: "underline",
              textUnderlineOffset: 2,
              cursor: "pointer",
              display: "block",
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            {tx("deleteAccount")}
          </button>
        )}
      </div>

      {deleteConfirmOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2, 6, 23, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 230,
            padding: 16,
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => !deleteBusy && setDeleteConfirmOpen(false)}
        >
          <div
            style={{
              width: "min(420px, 100%)",
              background: "#fff",
              borderRadius: 20,
              padding: 18,
              boxShadow: "0 18px 40px rgba(15, 23, 42, 0.28)",
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: "#7f1d1d" }}>
              {tx("deleteAccountConfirmTitle")}
            </div>
            <div style={{ fontSize: 13, color: "#475569", marginTop: 8 }}>
              {tx("deleteAccountConfirmBody")}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 16,
              }}
            >
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleteBusy}
                style={{
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  borderRadius: 10,
                  padding: "8px 12px",
                  cursor: deleteBusy ? "not-allowed" : "pointer",
                }}
              >
                {tx("cancel")}
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteBusy}
                style={{
                  border: "1px solid #dc2626",
                  background: "#ef4444",
                  color: "#fff",
                  borderRadius: 10,
                  padding: "8px 12px",
                  fontWeight: 700,
                  cursor: deleteBusy ? "not-allowed" : "pointer",
                  opacity: deleteBusy ? 0.7 : 1,
                }}
              >
                {deleteBusy ? tx("deleting") : tx("deleteAccountConfirmAction")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
