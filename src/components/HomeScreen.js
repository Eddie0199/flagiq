// HomeScreen.js — homepage + daily 3×3 booster grid
import React, { useEffect, useMemo, useState } from "react";
import { getLevelStatsByUser } from "./ProgressByUser"; // use per-level stats

const SPIN_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
const SPIN_STORAGE_KEY = "flaggame_last_spin_at";

// match App.js constants
const TOTAL_LEVELS = 30;

// simple helpers (copied from App-style logic)
const sumStars = (m) =>
  Object.values(m || {}).reduce((a, v) => a + (Number(v) || 0), 0);

function lastCompletedLevel(starsMap) {
  let last = 0;
  for (let i = 1; i <= TOTAL_LEVELS; i++) {
    if ((starsMap[i] || 0) > 0) last = i;
  }
  return last || 1;
}

// build a stars map for the current user/mode, merging NEW + LEGACY stores
function getStarsMapFromStore(username, mode) {
  const map = {};
  if (!username) return map;

  // LEGACY map: flagiq:u:<user>:<mode>:starsBest
  let legacy = {};
  try {
    const rawLegacy = localStorage.getItem(
      `flagiq:u:${username}:${mode}:starsBest`
    );
    if (rawLegacy) {
      const parsed = JSON.parse(rawLegacy);
      if (parsed && typeof parsed === "object") {
        legacy = parsed;
      }
    }
  } catch {
    // ignore
  }

  for (let id = 1; id <= TOTAL_LEVELS; id++) {
    let best = 0;

    // NEW per-level storage (ProgressByUser)
    try {
      const stats = getLevelStatsByUser(username, mode, id);
      best = Number(stats?.stars || 0);
    } catch {
      // ignore
    }

    // LEGACY storage value
    const legacyVal = Number(legacy[id] || 0);

    // take the better of the two
    map[id] = Math.max(best, legacyVal);
  }

  return map;
}

// per-mode stats for the homepage cards
function getPerModeStats(username, mode) {
  if (!username) return { level: 0, stars: 0 };

  try {
    const starsMap = getStarsMapFromStore(username, mode);
    const totalStars = sumStars(starsMap);

    if (totalStars === 0) {
      return { level: 0, stars: 0 }; // not started
    }

    const last = lastCompletedLevel(starsMap); // highest level id with >0 stars
    return { level: last, stars: totalStars };
  } catch {
    return { level: 0, stars: 0 };
  }
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

// =============== DAILY BOOSTER (3×3 pick) ===============
function DailySpinButton({ t, lang, onReward }) {
  const [isOpen, setIsOpen] = useState(false);
  const [canSpin, setCanSpin] = useState(true);
  const [remainingMs, setRemainingMs] = useState(0);

  const [hasPicked, setHasPicked] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [result, setResult] = useState(null);
  const [revealStage, setRevealStage] = useState("idle"); // idle | popping | shown
  const [showInfo, setShowInfo] = useState(false);

  // rewards
  const baseRewards = useMemo(
    () => [
      {
        id: "all",
        label: "All 3 hints",
        type: "all",
        icon: "⭐",
        weight: 5,
      },
      {
        id: "remove2",
        label: "Remove 2",
        type: "remove2",
        icon: "🎯",
        weight: 35,
      },
      {
        id: "autoPass",
        label: "Auto pass",
        type: "autoPass",
        icon: "✅",
        weight: 30,
      },
      {
        id: "pause",
        label: "Pause timer",
        type: "pause",
        icon: "⏸️",
        weight: 30,
      },
    ],
    []
  );

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

  // cooldown init
  useEffect(() => {
    const last = localStorage.getItem(SPIN_STORAGE_KEY);
    if (!last) return;
    const diff = Date.now() - Number(last);
    if (diff < SPIN_COOLDOWN_MS) {
      setCanSpin(false);
      setRemainingMs(SPIN_COOLDOWN_MS - diff);
    }
  }, []);

  // countdown
  useEffect(() => {
    if (canSpin) return;
    const id = setInterval(() => {
      setRemainingMs((prev) => {
        const next = prev - 1000;
        if (next <= 0) {
          clearInterval(id);
          setCanSpin(true);
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [canSpin]);

  // translations / labels
  const label = t && lang ? t(lang, "dailySpin") : "Daily bonus";
  const infoTitle = t && lang ? t(lang, "spinInfoTitle") : "How it works";
  const infoBody =
    t && lang
      ? t(lang, "spinInfoBody")
      : "Tap any box to reveal a random hint. ⭐ is rare and gives all 3. You can play again when the timer ends.";
  const titleText = t && lang ? t(lang, "spinForHintsTitle") : "Booster Wheel";
  const subtitleText =
    t && lang ? t(lang, "spinOncePerDay") : "Spin once every 24 hours";
  const comeBackTxt = t && lang ? t(lang, "comeBackIn") : "Come back in";
  const youWonTxt = t && lang ? t(lang, "youWon") : "You won";

  function handleOpen() {
    setIsOpen(true);
    setShowInfo(false);
    setHasPicked(false);
    setSelectedIndex(null);
    setResult(null);
    setRevealStage("idle");
  }

  function handlePick(idx) {
    if (!canSpin || hasPicked) return;

    const reward = pickRandomReward();
    setHasPicked(true);
    setSelectedIndex(idx);
    setResult(reward);
    setRevealStage("popping");

    // cooldown
    setCanSpin(false);
    setRemainingMs(SPIN_COOLDOWN_MS);
    localStorage.setItem(SPIN_STORAGE_KEY, String(Date.now()));

    // deliver reward → hints (parent owns persistence)
    onReward && onReward(reward);

    setTimeout(() => setRevealStage("shown"), 300);
  }

  return (
    <>
      {/* top header pill */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          marginTop: 4,
        }}
      >
        <button
          onClick={handleOpen}
          style={{
            background: "rgba(255,255,255,.95)",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 999,
            padding: "4px 10px",
            display: "flex",
            gap: 6,
            alignItems: "center",
            cursor: "pointer",
          }}
        >
          <span style={{ fontSize: 15 }}>🎡</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>
            {label}
          </span>
        </button>
        <span
          style={{
            fontSize: 10,
            color: "white",
            textShadow: "0 1px 3px rgba(0,0,0,.5)",
          }}
        >
          {canSpin
            ? t && lang
              ? t(lang, "readyToSpin")
              : "Ready – pick a box!"
            : `${comeBackTxt} ${formatMs(remainingMs)}`}
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
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                border: "none",
                background: "#fff",
                borderRadius: 999,
                width: 26,
                height: 26,
                cursor: "pointer",
              }}
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
                    disabled={!canSpin || hasPicked}
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
  onStart,
  classicStats, // still accepted but unused; we rely on fresh calc
  timetrialStats, // (kept for backward compatibility with App)
  t,
  lang,
  setHints, // pass from parent so spinner can add hints
}) {
  // no scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, []);

  const text = (key, fallback) => (t && lang ? t(lang, key) : fallback);

  // per-mode stats derived from the same store logic as App.js
  const classicFromStore = useMemo(
    () => getPerModeStats(username, "classic"),
    [username]
  );
  const timetrialFromStore = useMemo(
    () => getPerModeStats(username, "timetrial"),
    [username]
  );

  const Card = ({ color, icon, title, stats, onClick, mode }) => {
    const level = Number(stats?.level ?? 0);
    const stars = Number(stats?.stars ?? 0);
    const hasProgress = level > 0 || stars > 0;

    return (
      <button
        onClick={onClick}
        style={{
          width: "85%",
          maxWidth: 520,
          margin: "12px auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "18px 20px",
          borderRadius: 22,
          border: "none",
          background: color,
          boxShadow: "0 8px 18px rgba(0,0,0,.12)",
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <span style={{ fontWeight: 800, fontSize: 22 }}>{title}</span>
        </div>
        {hasProgress ? (
          <div
            style={{
              display: "flex",
              gap: 8,
              fontWeight: 700,
              alignItems: "center",
            }}
          >
            <span>
              {text("levelWord", "Level")} {level}
            </span>
            <span>•</span>
            <span
              style={{
                display: "flex",
                gap: 3,
                alignItems: "center",
              }}
            >
              <span>{stars}</span>
              <span style={{ fontSize: 15, lineHeight: 1 }}>★</span>
            </span>
          </div>
        ) : (
          <div style={{ fontSize: 16, fontWeight: 600 }}>
            {mode === "classic"
              ? text("classicDesc", "Learn flags at your pace")
              : text("timeTrialDesc", "Beat the timer!")}
          </div>
        )}
      </button>
    );
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundImage:
          "url(https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?q=80&w=1600&auto=format&fit=crop)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {/* top bar */}
      <div
        style={{
          position: "absolute",
          top: "env(safe-area-inset-top, 12px)",
          right: 12,
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          zIndex: 9999,
        }}
      >
        {username && (
          <DailySpinButton
            t={t}
            lang={lang}
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

        <button
          onClick={onSettings}
          style={{
            width: 34,
            height: 34,
            borderRadius: 999,
            background: "rgba(255,255,255,.95)",
            border: "1px solid rgba(0,0,0,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            marginTop: 4,
          }}
        >
          ⚙️
        </button>
      </div>

      {/* title area */}
      <div
        style={{
          marginTop: 110,
          padding: "18px 26px",
          borderRadius: 20,
          background: "rgba(0,0,0,0.5)",
          textAlign: "center",
          color: "white",
          textShadow: "0 3px 8px rgba(0,0,0,.8)",
        }}
      >
        <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: -1 }}>
          {text("appTitle", "FlagIQ")}
        </div>
        <div style={{ marginTop: 8, fontSize: 18, fontWeight: 500 }}>
          {text(
            "appSubtitle",
            "Test your world knowledge — one flag at a time"
          )}
        </div>
      </div>

      {/* game cards */}
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
      </div>

      {/* footer */}
      <div
        style={{
          position: "absolute",
          bottom: 16,
          left: "50%",
          transform: "translateX(-50%)",
          color: "rgba(255,255,255,0.85)",
          fontWeight: 600,
        }}
      >
        Powered by <span style={{ fontStyle: "italic" }}>Wild Moustache</span>
      </div>
    </div>
  );
}
