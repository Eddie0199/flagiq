// HomeScreen.js — homepage + daily 3×3 booster grid
import React, { useEffect, useMemo, useRef, useState } from "react";
import { fetchTimeTrialLeaderboard } from "../leaderboardApi";
import { ti, tp } from "../i18n";
import { getHintTranslation, HINT_IDS } from "../hints";
import { READY_LOCAL_PACK_IDS } from "../localPacks";
import { DAILY_BOOSTER_ICON, HINT_ICON_BY_TYPE, SHOP_COIN_ICON } from "../uiIcons";
import Header from "./Header";

const DAILY_SPIN_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

// simple helpers (copied from App-style logic)
const sumStars = (m) =>
  Object.values(m || {}).reduce((a, v) => a + (Number(v) || 0), 0);

const countCompletedLevels = (starsMap) =>
  Object.values(starsMap || {}).reduce(
    (sum, stars) => sum + (Number(stars) > 0 ? 1 : 0),
    0
  );

// per-mode stats for the homepage cards
function getPerModeStats(progress, mode) {
  if (!progress) return { completedLevels: 0, stars: 0 };

  try {
    const starsMap = progress?.[mode]?.starsByLevel || {};
    const totalStars = sumStars(starsMap);
    const completedLevels = countCompletedLevels(starsMap);

    if (totalStars === 0) {
      return { completedLevels: 0, stars: 0 }; // not started
    }

    return { completedLevels, stars: totalStars };
  } catch {
    return { completedLevels: 0, stars: 0 };
  }
}

function getLocalStats(progress) {
  const packs = progress?.localFlags?.packs || {};
  const readyPackIds = new Set(READY_LOCAL_PACK_IDS);
  return Object.entries(packs)
    .filter(([packId]) => readyPackIds.has(packId))
    .reduce(
      (acc, [, pack]) => {
        const starsMap = pack?.starsByLevel || {};
        Object.values(starsMap).forEach((stars) => {
          const starValue = Number(stars) || 0;
          acc.stars += starValue;
          if (starValue > 0) acc.completedLevels += 1;
        });
        return acc;
      },
      { completedLevels: 0, stars: 0 }
    );
}

// grid layout
const GRID_ROWS = 3;
const GRID_COLS = 3;
const TILE_SIZE = 86;
const TILE_GAP = 20;

// helper
function formatMs(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s
    .toString()
    .padStart(2, "0")}`;
}

function computeRemainingMs(lastClaimedAt) {
  if (!lastClaimedAt) return 0;
  const ts = Date.parse(lastClaimedAt);
  if (!Number.isFinite(ts)) return 0;
  const elapsed = Date.now() - ts;
  if (elapsed < 0) return DAILY_SPIN_COOLDOWN_MS;
  return Math.max(DAILY_SPIN_COOLDOWN_MS - elapsed, 0);
}

// =============== DAILY BOOSTER (3×3 pick) ===============
function DailySpinButton({
  t,
  lang,
  onReward,
  lastClaimedAt: lastClaimedAtProp,
  onDailySpinClaim,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [remainingMs, setRemainingMs] = useState(() =>
    computeRemainingMs(lastClaimedAtProp)
  );
  const [canSpin, setCanSpin] = useState(
    computeRemainingMs(lastClaimedAtProp) <= 0
  );
  const [lastClaimedAt, setLastClaimedAt] = useState(
    lastClaimedAtProp || null
  );
  const [hasPicked, setHasPicked] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [result, setResult] = useState(null);
  const [revealStage, setRevealStage] = useState("idle"); // idle | popping | shown
  const [showInfo, setShowInfo] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const offlineMessage = "Connect to the internet to claim your daily spin.";
  const text = (key, fallback) => {
    if (!t || !lang) return fallback;
    const value = t(lang, key);
    return value === key ? fallback : value;
  };

  // rewards
  const baseRewards = useMemo(
    () => [
      {
        id: "all",
        label: text("hints.bundleAll.label", "hints.bundleAll.label"),
        type: "all",
        icon: "⭐",
        weight: 5,
      },
      {
        id: "remove2",
        label: getHintTranslation(t, lang, HINT_IDS.REMOVE_TWO, "label"),
        type: "remove2",
        icon: HINT_ICON_BY_TYPE.remove2,
        weight: 35,
      },
      {
        id: "autoPass",
        label: getHintTranslation(t, lang, HINT_IDS.AUTO_PASS, "label"),
        type: "autoPass",
        icon: HINT_ICON_BY_TYPE.autoPass,
        weight: 30,
      },
      {
        id: "pause",
        label: getHintTranslation(t, lang, HINT_IDS.PAUSE_TIMER, "label"),
        type: "pause",
        icon: HINT_ICON_BY_TYPE.pause,
        weight: 30,
      },
    ],
    [lang, t]
  );

  useEffect(() => {
    setLastClaimedAt(lastClaimedAtProp || null);
  }, [lastClaimedAtProp]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOnline);
    };
  }, []);

  useEffect(() => {
    const nextRemaining = computeRemainingMs(lastClaimedAt);
    setRemainingMs(nextRemaining);
    setCanSpin(isOnline && nextRemaining <= 0);
  }, [isOnline, lastClaimedAt]);

  useEffect(() => {
    if (!isOnline || remainingMs <= 0) return;
    const id = setInterval(() => {
      setRemainingMs((prev) => {
        const next = prev - 1000;
        if (next <= 0) {
          setCanSpin(isOnline);
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isOnline, remainingMs]);

  useEffect(() => {
    if (!isOnline) {
      setStatusMessage(offlineMessage);
    } else if (statusMessage === offlineMessage) {
      setStatusMessage("");
    }
  }, [isOnline, offlineMessage, statusMessage]);

  function pickRandomReward() {
    const total = baseRewards.reduce((s, r) => s + r.weight, 0);
    const roll = Math.random() * total;
    let acc = 0;
    for (let i = 0; i < baseRewards.length; i++) {
      acc += baseRewards[i].weight;
      if (roll <= acc) return baseRewards[i];
    }
    return baseRewards[baseRewards.length - 1];
  }

  // translations / labels
  const label = t && lang ? t(lang, "dailySpin") : "Daily booster";
  const infoTitle = t && lang ? t(lang, "spinInfoTitle") : "How it works";
  const infoBody =
    t && lang
      ? t(lang, "spinInfoBody")
      : "Tap any box to reveal a random hint. ⭐ is rare and gives all 3. You can play again when the timer ends.";
  const titleText = t && lang ? t(lang, "spinForHintsTitle") : "Daily Booster";
  const subtitleText =
    t && lang
      ? t(lang, "spinOncePerDay")
      : "Select a box once every 24 hours";
  const comeBackTxt = t && lang ? t(lang, "comeBackIn") : "Come back in";
  const youWonTxt = t && lang ? t(lang, "youWon") : "You won";
  const readyText =
    t && lang ? t(lang, "readyToSpin") : "Ready – pick a box!";
  const claimText = t && lang ? t(lang, "claim") : "Claim";
  const statusText = canSpin ? claimText : formatMs(remainingMs);

  function handleOpen() {
    setIsOpen(true);
    setShowInfo(false);
    setHasPicked(false);
    setSelectedIndex(null);
    setResult(null);
    setRevealStage("idle");
    setStatusMessage(isOnline ? "" : offlineMessage);
    setIsSubmitting(false);
  }

  async function handlePick(idx) {
    if (hasPicked || isSubmitting) return;

    if (!isOnline) {
      setStatusMessage(offlineMessage);
      return;
    }

    const latestRemaining = computeRemainingMs(lastClaimedAt);
    if (latestRemaining > 0) {
      setRemainingMs(latestRemaining);
      setCanSpin(false);
      return;
    }

    setIsSubmitting(true);

    try {
      const claimResult = await (onDailySpinClaim && onDailySpinClaim());
      if (!claimResult?.success) {
        const rem =
          typeof claimResult?.remainingMs === "number"
            ? claimResult.remainingMs
            : computeRemainingMs(
                claimResult?.lastClaimedAt || lastClaimedAt
              );
        setRemainingMs(rem);
        setCanSpin(isOnline && rem <= 0);
        if (claimResult?.reason === "offline") {
          setStatusMessage(offlineMessage);
        } else if (rem > 0) {
          setStatusMessage(`${comeBackTxt} ${formatMs(rem)}`);
        } else {
          setStatusMessage(
            t && lang
              ? t(lang, "spinNetworkError") || "Unable to claim now."
              : "Unable to claim now."
          );
        }
        setIsSubmitting(false);
        return;
      }

      const backendLast =
        claimResult?.lastClaimedAt || new Date().toISOString();
      setLastClaimedAt(backendLast);

      const reward = pickRandomReward();
      setHasPicked(true);
      setSelectedIndex(idx);
      setResult(reward);
      setRevealStage("popping");

      setCanSpin(false);
      setRemainingMs(DAILY_SPIN_COOLDOWN_MS);

      // deliver reward → hints (parent owns persistence)
      onReward && onReward(reward);

      setTimeout(() => setRevealStage("shown"), 300);
    } catch (e) {
      setStatusMessage(
        t && lang
          ? t(lang, "spinNetworkError") || "Unable to claim now."
          : "Unable to claim now."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {/* top header icon */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
        }}
      >
        <button
          onClick={handleOpen}
          aria-label={label}
          style={{
            position: "relative",
            width: 36,
            height: 36,
            borderRadius: 999,
            background: "rgba(255,255,255,.95)",
            border: canSpin
              ? "2px solid rgba(245, 158, 11, 0.95)"
              : "1px solid rgba(0,0,0,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            boxShadow: canSpin
              ? "0 0 0 3px rgba(245, 158, 11, 0.5)"
              : "0 6px 16px rgba(15,23,42,0.15)",
          }}
        >
          <span style={{ fontSize: 18 }}>{DAILY_BOOSTER_ICON}</span>
        </button>
        <span
          style={{
            fontSize: 10,
            color: "white",
            textShadow: "0 1px 3px rgba(0,0,0,.5)",
            textAlign: "center",
            maxWidth: 120,
          }}
        >
          {statusText}
        </span>
      </div>

      {/* MODAL */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.35)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            style={{
              width: 360,
              maxWidth: "100%",
              background: "#eef2ff",
              borderRadius: 22,
              padding: 18,
              boxShadow: "0 10px 30px rgba(15,23,42,0.25)",
              position: "relative",
            }}
          >
            {/* close */}
            <button
              onClick={() => setIsOpen(false)}
              className="modal-close-button"
              aria-label={text("close", "Close")}
            >
              ×
            </button>

            {/* info */}
            <button
              onClick={() => setShowInfo((v) => !v)}
              style={{
                position: "absolute",
                top: 10,
                left: 10,
                border: "none",
                background: "#fff",
                borderRadius: 999,
                width: 26,
                height: 26,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              i
            </button>

            {showInfo && (
              <div
                style={{
                  position: "absolute",
                  top: 44,
                  left: 12,
                  right: 12,
                  background: "#fff",
                  borderRadius: 14,
                  padding: "10px 12px",
                  fontSize: 12,
                  color: "#0f172a",
                  boxShadow: "0 8px 16px rgba(15,23,42,0.15)",
                  zIndex: 50,
                }}
              >
                <strong style={{ display: "block", marginBottom: 4 }}>
                  {infoTitle}
                </strong>
                {infoBody}
              </div>
            )}

            {/* heading */}
            <h3
              style={{
                textAlign: "center",
                fontWeight: 700,
                fontSize: 20,
                color: "#0f172a",
                marginTop: 6,
              }}
            >
              {titleText}
            </h3>
            <p
              style={{
                textAlign: "center",
                fontSize: 13,
                color: "#475569",
                marginBottom: 12,
              }}
            >
              {subtitleText}
            </p>

            {/* 3×3 grid */}
            <div
              style={{
                marginTop: 8,
                marginBottom: 16,
                display: "grid",
                gridTemplateColumns: `repeat(${GRID_COLS}, ${TILE_SIZE}px)`,
                gridTemplateRows: `repeat(${GRID_ROWS}, ${TILE_SIZE}px)`,
                gap: TILE_GAP,
                justifyContent: "center",
              }}
            >
              {Array.from({ length: GRID_ROWS * GRID_COLS }).map((_, idx) => {
                const isSelected = hasPicked && idx === selectedIndex;

                const baseBg = "#ffffff";
                const selectedBg = "#fef3c7";

                return (
                  <button
                    key={idx}
                    onClick={() => handlePick(idx)}
                    disabled={!canSpin || hasPicked || isSubmitting || !isOnline}
                    style={{
                      width: TILE_SIZE,
                      height: TILE_SIZE,
                      borderRadius: 24,
                      border: "none",
                      background: isSelected ? selectedBg : baseBg,
                      boxShadow: isSelected
                        ? "0 10px 28px rgba(245,158,11,0.45)"
                        : "0 6px 16px rgba(15,23,42,0.12)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: !canSpin || hasPicked ? "default" : "pointer",
                      transition:
                        "transform .18s ease, box-shadow .18s ease, background .18s ease",
                      transform:
                        isSelected && revealStage !== "idle"
                          ? "scale(1.06) translateY(-2px)"
                          : "scale(1)",
                    }}
                  >
                    <span style={{ fontSize: 26 }}>
                      {isSelected && result ? result.icon : "📦"}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* footer: timer + result text */}
            <div
              style={{
                textAlign: "center",
                fontSize: 13,
                color: "#475569",
                marginBottom: 4,
              }}
            >
              {comeBackTxt} {formatMs(remainingMs)}
            </div>
            {result && (
              <div
                style={{
                  textAlign: "center",
                  fontWeight: 700,
                  marginTop: 4,
                  fontSize: 13,
                  color: "#0f172a",
                }}
              >
                {youWonTxt}: {result.label}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// =============== HOME SCREEN ===============
export default function HomeScreen({
  username,
  onSettings,
  hearts,
  coins,
  onShop,
  onStart,
  classicStats, // still accepted but unused; we rely on fresh calc
  timetrialStats, // (kept for backward compatibility with App)
  maxLevelsByMode,
  t,
  lang,
  setHints, // pass from parent so spinner can add hints
  progress,
  dailySpinLastClaimedAt,
  onDailySpinClaim,
  loggedIn,
  onAuthRequest,
  i18nAuditEnabled = false,
}) {
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);

  // no scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, []);

  const text = (key, fallback) => {
    if (!t || !lang) return fallback;
    const value = t(lang, key);
    return value === key ? fallback : value;
  };

  const [leaderboardEntries, setLeaderboardEntries] = useState([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState("");
  const [showI18nKeys, setShowI18nKeys] = useState(false);
  const infoModalRef = useRef(null);
  const leaderboardModalRef = useRef(null);

  const textf = (key, fallback, vars = {}) => {
    if (showI18nKeys) return key;
    if (!t || !lang) return fallback;
    const value = ti(lang, key, vars);
    if (i18nAuditEnabled && lang !== "en" && value === fallback) {
      console.warn(`[i18n-audit] Missing translation for key "${key}" in HomeScreen.js`);
    }
    return value === key ? fallback : value;
  };

  useEffect(() => {
    if (!i18nAuditEnabled) return;
    const scanForRawText = (container, name) => {
      if (!container) return;
      const textContent = container.innerText || "";
      const suspicious = [
        "Game Modes",
        "Lives System",
        "Hints & Boosters",
        "Top 100 Players",
        "Loading leaderboard",
      ].filter((token) => textContent.includes(token));
      if (suspicious.length > 0) {
        console.warn(`[i18n-audit] Potential hardcoded strings in ${name} (HomeScreen.js):`, suspicious);
      }
    };
    scanForRawText(infoModalRef.current, "Info modal");
    scanForRawText(leaderboardModalRef.current, "Leaderboard modal");
  }, [i18nAuditEnabled, showInfoModal, showLeaderboardModal, leaderboardEntries, lang, showI18nKeys]);

  const leaderboardModes = useMemo(
    () => [
      {
        id: "timetrial",
        label: t && lang ? t(lang, "timeTrial") : "Time Trial",
        icon: "⏱️",
      },
    ],
    [lang, t]
  );
  const medalByRank = {
    1: "🥇",
    2: "🥈",
    3: "🥉",
  };
  const emptyLeaderboardLabel = loggedIn
    ? text("leaderboardEmpty", "No Time Trial scores yet.")
    : text(
        "leaderboardLoginRequired",
        "Leaderboard is available for logged in users only."
      );

  useEffect(() => {
    if (!showLeaderboardModal || !loggedIn) return;
    let isActive = true;

    const loadLeaderboard = async () => {
      setLeaderboardLoading(true);
      setLeaderboardError("");
      const { entries, error } = await fetchTimeTrialLeaderboard(100);
      if (!isActive) return;
      if (error) {
        console.error("Failed to load leaderboard", error);
        setLeaderboardError(
          text(
            "leaderboardError",
            "Unable to load leaderboard right now."
          )
        );
        setLeaderboardEntries([]);
      } else {
        setLeaderboardEntries(entries);
      }
      setLeaderboardLoading(false);
    };

    loadLeaderboard();

    return () => {
      isActive = false;
    };
  }, [showLeaderboardModal]);

  // per-mode stats derived from the same store logic as App.js
  // compute on every render so newly loaded progress shows immediately
  const classicFromStore = getPerModeStats(progress, "classic");
  const timetrialFromStore = getPerModeStats(progress, "timetrial");
  const localFromStore = useMemo(() => getLocalStats(progress), [progress]);
  const footerLinkStyle = {
    background: "none",
    border: "none",
    padding: 0,
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    cursor: "pointer",
  };

  const openExternalLink = (url) => {
    const newWindow = window.open(url, "_blank", "noopener,noreferrer");
    if (newWindow) {
      newWindow.opener = null;
    }
  };

  const homeInfoTitle = text("homeInfoTitle", "How to Play").replace(
    /^\p{Emoji_Presentation}\s*/u,
    ""
  );
  const howToPlaySections = [
    {
      key: "goal",
      icon: "🏁",
      title: textf("homeInfo.goal.title", "Goal"),
      body: textf(
        "homeInfo.goal.body",
        "Identify the correct country for each flag. The faster and more accurate you are, the better your score."
      ),
    },
    {
      key: "modes",
      icon: "🎮",
      title: textf("homeInfo.modes.title", "Game Modes"),
      bullets: [
        textf("homeInfo.modes.classic", "Classic Mode: Play at your own pace with no timer pressure."),
        textf("homeInfo.modes.timetrial", "Time Trial: Race against the clock where both speed and accuracy matter; faster correct answers earn higher scores."),
        textf("homeInfo.modes.local", "Local Flags: Explore regional packs like US states and master local flags."),
      ],
    },
    {
      key: "lives",
      icon: "❤️",
      title: textf("homeInfo.lives.title", "Lives System"),
      body: textf("homeInfo.lives.body", "You lose one life each time you fail to successfully complete a level. Lives automatically refill over time."),
    },
    {
      key: "hints",
      icon: "💡",
      title: textf("homeInfo.hints.title", "Hints & Boosters"),
      hintRows: [
        { icon: HINT_ICON_BY_TYPE.remove2, label: getHintTranslation(t, lang, HINT_IDS.REMOVE_TWO, "label"), body: getHintTranslation(t, lang, HINT_IDS.REMOVE_TWO, "description") },
        { icon: HINT_ICON_BY_TYPE.autoPass, label: getHintTranslation(t, lang, HINT_IDS.AUTO_PASS, "label"), body: getHintTranslation(t, lang, HINT_IDS.AUTO_PASS, "description") },
        { icon: HINT_ICON_BY_TYPE.pause, label: getHintTranslation(t, lang, HINT_IDS.PAUSE_TIMER, "label"), body: getHintTranslation(t, lang, HINT_IDS.PAUSE_TIMER, "description") },
      ],
    },
    {
      key: "stars",
      icon: "⭐",
      title: textf("homeInfo.stars.title", "Stars & Progress"),
      body: textf("homeInfo.stars.body", "Earn up to three stars per level based on your performance. Collect stars to unlock new levels, regions, and special flag packs."),
    },
    {
      key: "coins",
      icon: SHOP_COIN_ICON,
      title: textf("homeInfo.coins.title", "Coins & Rewards"),
      body: textf("homeInfo.coins.body", "Completing a level for the first time earns coins. Spend them in the shop on hints and boosters to advance faster."),
    },
    {
      key: "daily",
      icon: DAILY_BOOSTER_ICON,
      title: textf("homeInfo.daily.title", "Daily Booster"),
      body: textf("homeInfo.daily.body", "Open a free booster box every 24 hours to receive hints and boosts."),
    },
  ];

  const Card = ({ color, icon, title, stats, onClick, mode, disabled }) => {
    const completedLevels = Number(stats?.completedLevels ?? 0);
    const stars = Number(stats?.stars ?? 0);
    const showProgress = !disabled;
    const maxLevels = Number(maxLevelsByMode?.[mode] ?? 0);
    const maxStars = maxLevels * 3;
    const description =
      mode === "classic"
        ? text("classicDesc", "Learn flags at your pace")
        : mode === "timetrial"
        ? text("timeTrialDesc", "Beat the timer!")
        : text("localFlagsDesc", "Country packs focused on regional flags.");

    return (
      <button
        disabled={disabled}
        onClick={disabled ? undefined : onClick}
        style={{
          width: "85%",
          maxWidth: 520,
          margin: "12px auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "6px 12px",
          minHeight: 62,
          borderRadius: 22,
          border: "none",
          background: disabled ? "#e5e7eb" : color,
          boxShadow: disabled ? "none" : "0 8px 18px rgba(0,0,0,.12)",
          cursor: disabled ? "not-allowed" : "pointer",
          color: disabled ? "#6b7280" : "inherit",
          opacity: disabled ? 0.75 : 1,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flex: "1 1 auto",
            minWidth: 0,
          }}
        >
          <span style={{ fontSize: 18 }}>{icon}</span>
          <div
            className="home-card-text"
            style={{ minWidth: 0 }}
          >
            <span className="home-card-title">{title}</span>
            <span className="home-card-description">{description}</span>
          </div>
        </div>
        {disabled ? (
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 0.4,
              background: "rgba(255, 255, 255, 0.95)",
              color: "#111827",
              padding: "7px 12px",
              borderRadius: 999,
              whiteSpace: "nowrap",
              boxShadow: "0 8px 16px rgba(17,24,39,0.25)",
              border: "1px solid rgba(17,24,39,0.15)",
            }}
          >
            {text("comingSoon", "Coming soon")}
          </div>
        ) : showProgress ? (
          <div className="mode-progress-row">
            {/* Use icon tokens for progress to avoid localisation overflow. */}
            <span className="mode-progress-token mode-progress-flag">
              <span className="mode-progress-icon" aria-hidden="true">
                🏁
              </span>
              <span className="mode-progress-value">
                {completedLevels}/{maxLevels}
              </span>
            </span>
            <span className="mode-progress-sep" aria-hidden="true">
              ·
            </span>
            <span className="mode-progress-token mode-progress-stars">
              <span className="mode-progress-icon" aria-hidden="true">
                ⭐
              </span>
              <span className="mode-progress-value">
                {stars}/{maxStars}
              </span>
            </span>
          </div>
        ) : (
          <div />
        )}
      </button>
    );
  };

  const localDisabled = true;

  return (
    <>
      <Header
        hearts={hearts}
        username={username}
        onSettings={onSettings}
        showHearts={loggedIn}
        showCoins={loggedIn}
        showSettings={false}
        t={t}
        lang={lang}
        coins={coins}
        onCoinsClick={onShop}
      />
      <div
        style={{
          flex: 1,
          width: "100%",
          position: "relative",
          backgroundColor: "#0b74ff",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          overflowY: "auto",
          paddingBottom: 120,
        }}
      >
      {/* top left icons */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          zIndex: 9999,
        }}
      >
        <button
          onClick={() => setShowInfoModal(true)}
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            background: "rgba(255,255,255,.95)",
            border: "1px solid rgba(0,0,0,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            fontSize: 20,
          }}
          aria-label={text("homeInfoTitle", "About FlagIQ")}
        >
          ❓
        </button>
        <button
          onClick={() => setShowLeaderboardModal(true)}
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            background: "rgba(255,255,255,.95)",
            border: "1px solid rgba(0,0,0,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            fontSize: 20,
          }}
          aria-label={text("homeLeaderboardTitle", "Leaderboard")}
        >
          🏆
        </button>
      </div>

      {/* top right icons */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          alignItems: "center",
          zIndex: 9999,
        }}
      >
        <button
          onClick={onSettings}
          aria-label={text("settings", "Settings")}
          style={{
            background: "#f1f5f9",
            color: "#0f172a",
            border: "1px solid #e2e8f0",
            borderRadius: 999,
            width: 36,
            height: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            boxShadow: "0 1px 3px rgba(0,0,0,.06)",
            cursor: "pointer",
          }}
        >
          ⚙️
        </button>
        {username && (
          <DailySpinButton
            t={t}
            lang={lang}
            lastClaimedAt={dailySpinLastClaimedAt}
            onDailySpinClaim={onDailySpinClaim}
            onReward={(reward) => {
              if (!setHints) return;

              setHints((prev) => {
                const base = prev || { remove2: 0, autoPass: 0, pause: 0 };

                if (reward.type === "all") {
                  return {
                    ...base,
                    remove2: (base.remove2 ?? 0) + 1,
                    autoPass: (base.autoPass ?? 0) + 1,
                    pause: (base.pause ?? 0) + 1,
                  };
                }

                return {
                  ...base,
                  [reward.type]: (base[reward.type] ?? 0) + 1,
                };
              });
            }}
          />
        )}
      </div>

      {/* title area */}
      <div
        style={{
          marginTop: 84,
          padding: "18px 26px",
          borderRadius: 20,
          background: "transparent",
          textAlign: "center",
          color: "white",
          textShadow: "0 3px 8px rgba(0,0,0,.8)",
        }}
      >
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: 28,
            background: "rgba(255,255,255,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 12px",
            boxShadow: "0 12px 26px rgba(0,0,0,0.25)",
          }}
        >
          <img
            src="/icon-512.png"
            alt={text("appTitle", "FlagIQ")}
            style={{
              width: 96,
              height: 96,
              borderRadius: 24,
            }}
          />
        </div>
        <div style={{ fontSize: 40, fontWeight: 900, letterSpacing: -1 }}>
          {text("appTitle", "FlagIQ")}
        </div>
      </div>

      {showInfoModal ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 10000,
          }}
        >
          <div
            ref={infoModalRef}
            style={{
              width: "100%",
              maxWidth: 420,
              background: "white",
              borderRadius: 20,
              padding: "22px 22px 18px",
              boxShadow: "0 18px 40px rgba(0,0,0,0.25)",
              color: "#0f172a",
              textAlign: "left",
              position: "relative",
            }}
          >
            <button
              onClick={() => setShowInfoModal(false)}
              className="modal-close-button"
              aria-label={text("close", "Close")}
            >
              ×
            </button>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>
              {homeInfoTitle}
            </div>
            {i18nAuditEnabled && (
              <button
                onClick={() => setShowI18nKeys((prev) => !prev)}
                style={{ marginBottom: 10, border: "1px solid #cbd5e1", borderRadius: 8, padding: "6px 10px", background: "#f8fafc", cursor: "pointer", fontWeight: 600, fontSize: 12 }}
              >
                {showI18nKeys ? "Hide i18n keys" : "Show i18n keys"}
              </button>
            )}
            <div
              style={{
                fontSize: 15,
                lineHeight: 1.5,
                color: "#334155",
                maxHeight: "55vh",
                overflowY: "auto",
                paddingRight: 6,
              }}
            >
              {howToPlaySections.map((section, index) => (
                <div
                  key={section.key}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    marginBottom: index === howToPlaySections.length - 1 ? 0 : 12,
                  }}
                >
                  <span aria-hidden="true" style={{ fontSize: 18, lineHeight: "20px" }}>
                    {section.icon}
                  </span>
                  <span>
                    <strong style={{ color: "#0f172a" }}>{section.title}:</strong>{" "}
                    {section.body ? <span>{section.body}</span> : null}
                    {section.bullets?.length ? (
                      <ul style={{ margin: "8px 0 0", paddingLeft: 20, display: "grid", gap: 6 }}>
                        {section.bullets.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : null}
                    {section.hintRows?.length ? (
                      <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                        {section.hintRows.map((item) => (
                          <div key={item.label} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                            <span aria-hidden="true" style={{ fontSize: 16, width: 20, textAlign: "center" }}>
                              {item.icon}
                            </span>
                            <span>
                              <strong>{item.label}:</strong> {item.body}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {showLeaderboardModal ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 10000,
          }}
        >
          <div
            ref={leaderboardModalRef}
            style={{
              width: "100%",
              maxWidth: 420,
              background: "white",
              borderRadius: 20,
              padding: "22px 22px 18px",
              boxShadow: "0 18px 40px rgba(0,0,0,0.25)",
              color: "#0f172a",
              textAlign: "left",
              position: "relative",
            }}
          >
            <button
              onClick={() => setShowLeaderboardModal(false)}
              className="modal-close-button"
              aria-label={text("close", "Close")}
            >
              ×
            </button>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 22,
                fontWeight: 800,
                marginBottom: 14,
              }}
            >
              <span role="img" aria-label={text("homeLeaderboardTitle", "Leaderboard")}>
                🏆
              </span>
              {text("homeLeaderboardTitle", "Leaderboard")}
            </div>
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 18,
                maxHeight: "65vh",
                overflowY: "auto",
                background: "#f8fafc",
              }}
            >
              <div
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 2,
                  background: "white",
                  padding: "14px 16px 12px",
                  borderBottom: "1px solid #e2e8f0",
                  boxShadow: "0 2px 8px rgba(15,23,42,0.08)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    justifyContent: "center",
                    flexWrap: "wrap",
                  }}
                >
                  {leaderboardModes.map((mode) => (
                    <div
                      key={mode.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "10px 16px",
                        borderRadius: 16,
                        background: "#7c3aed",
                        color: "white",
                        fontWeight: 700,
                        boxShadow: "0 6px 14px rgba(124,58,237,0.28)",
                      }}
                    >
                      <span role="img" aria-label={mode.label}>
                        {mode.icon}
                      </span>
                      {mode.label}
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#64748b",
                    textAlign: "center",
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                  }}
                >
                  {text("leaderboardTopLabel", "Top 100 Players • Total Points")}
                </div>
              </div>
              {leaderboardLoading ? (
                <div
                  style={{
                    padding: "22px 16px",
                    textAlign: "center",
                    fontWeight: 600,
                    color: "#64748b",
                  }}
                >
                  {text("leaderboardLoading", "Loading leaderboard...")}
                </div>
              ) : leaderboardError ? (
                <div
                  style={{
                    padding: "22px 16px",
                    textAlign: "center",
                    fontWeight: 600,
                    color: "#ef4444",
                  }}
                >
                  {leaderboardError}
                </div>
              ) : leaderboardEntries.length === 0 ? (
                <div
                  style={{
                    padding: "22px 16px",
                    textAlign: "center",
                    fontWeight: 600,
                    color: "#64748b",
                  }}
                >
                  {emptyLeaderboardLabel}
                </div>
              ) : (
                leaderboardEntries.map((entry) => {
                  const medal = medalByRank[entry.rank];
                  return (
                    <div
                      key={entry.userId || entry.rank}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 16px",
                        background: "white",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          textAlign: "center",
                          fontWeight: 800,
                          color: medal ? "#f59e0b" : "#94a3b8",
                          fontSize: medal ? 18 : 14,
                        }}
                      >
                        {medal || entry.rank}
                      </div>
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: "50%",
                          background: "#60a5fa",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "white",
                          fontWeight: 700,
                          fontSize: 16,
                        }}
                      >
                        {entry.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            color: "#0f172a",
                            fontSize: 16,
                          }}
                        >
                          {entry.name}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "#94a3b8",
                            marginTop: 2,
                          }}
                        >
                          {showI18nKeys
                            ? "leaderboard.attempts"
                            : tp(lang, "leaderboard.attempts", Number(entry.attempts) || 0, {
                                count: Number(entry.attempts) || 0,
                              })}
                        </div>
                      </div>
                      <div
                        style={{
                          fontWeight: 800,
                          color: "#1f2937",
                          fontSize: 16,
                        }}
                      >
                        {entry.score}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* game cards */}
      {loggedIn ? (
        <div
          style={{
            marginTop: 60,
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <Card
            color="#f3cc2f"
            icon="🚩"
            title={text("classic", "Classic")}
            stats={classicFromStore}
            onClick={() => onStart && onStart("classic")}
            mode="classic"
          />
          <Card
            color="#38c5dd"
            icon="⏱️"
            title={text("timeTrial", "Time Trial")}
            stats={timetrialFromStore}
            onClick={() => onStart && onStart("timetrial")}
            mode="timetrial"
          />
          <Card
            color="#ef4444"
            icon="💀"
            title={text("localFlags", "Local Flags")}
            stats={localFromStore}
            onClick={() => onStart && onStart("local")}
            mode="local"
            disabled={localDisabled}
          />
        </div>
      ) : (
        <div
          style={{
            marginTop: 60,
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <button
            onClick={() => onAuthRequest && onAuthRequest("login")}
            style={{
              width: "85%",
              maxWidth: 520,
              padding: "12px 16px",
              borderRadius: 22,
              border: "none",
              background: "#0f172a",
              color: "#fff",
              fontWeight: 700,
              fontSize: 16,
              boxShadow: "0 8px 18px rgba(15,23,42,.2)",
              cursor: "pointer",
            }}
          >
            {text("login", "Log in")}
          </button>
          <button
            onClick={() => onAuthRequest && onAuthRequest("signup")}
            style={{
              width: "85%",
              maxWidth: 520,
              padding: "12px 16px",
              borderRadius: 22,
              border: "1px solid rgba(15,23,42,0.2)",
              background: "rgba(255,255,255,0.95)",
              color: "#0f172a",
              fontWeight: 700,
              fontSize: 16,
              boxShadow: "0 8px 18px rgba(0,0,0,.12)",
              cursor: "pointer",
            }}
          >
            {text("auth.signupTab", "Sign up")}
          </button>
        </div>
      )}

      {/* footer */}
      <div
        style={{
          position: "absolute",
          bottom: 16,
          left: "50%",
          transform: "translateX(-50%)",
          color: "rgba(255,255,255,0.85)",
          fontWeight: 600,
          fontSize: 12,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          whiteSpace: "nowrap",
        }}
      >
        <div>
          Powered by{" "}
          <span style={{ fontStyle: "italic" }}>Wild Moustache Games</span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            fontWeight: 500,
          }}
        >
          <button
            onClick={() =>
              openExternalLink("https://wildmoustachegames.com/terms.html")
            }
            style={footerLinkStyle}
          >
            {text("footerTerms", "Terms")}
          </button>
          <span aria-hidden="true">•</span>
          <button
            onClick={() =>
              openExternalLink("https://wildmoustachegames.com/privacy.html")
            }
            style={footerLinkStyle}
          >
            {text("footerPrivacy", "Privacy")}
          </button>
          <span aria-hidden="true">•</span>
          <button
            onClick={() => {
              window.location.href = "mailto:support@wildmoustachegames.com";
            }}
            style={footerLinkStyle}
          >
            {text("footerContact", "Contact")}
          </button>
        </div>
      </div>
      </div>
    </>
  );
}
