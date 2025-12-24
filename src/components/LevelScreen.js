// components/LevelScreen.js
// Title & stars sit BELOW the header. Header already has back/heart/username/gear.

import React, { useMemo } from "react";
import {
  TOTAL_LEVELS,
  STARS_PER_LEVEL_MAX,
  BATCH,
  UNLOCK_THRESHOLD,
  starsNeededForLevelId, // use App's exact rule for the popup
} from "../App";

function StarsBadge({ total }) {
  return (
    <div
      style={{
        padding: "6px 10px",
        borderRadius: 999,
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        fontWeight: 800,
        fontSize: 13,
        color: "#0f172a",
      }}
    >
      {total} ★
    </div>
  );
}

// compute unlocks from a stars-by-level map (best-ever)
function computeUnlockedFromStars(starsMap) {
  let unlocked = BATCH;
  while (unlocked < TOTAL_LEVELS) {
    const maxStarsPossible = unlocked * STARS_PER_LEVEL_MAX;
    const have = Object.values(starsMap || {}).reduce(
      (s, v) => s + (Number(v) || 0),
      0
    );
    const ratio = maxStarsPossible > 0 ? have / maxStarsPossible : 0;
    if (ratio >= UNLOCK_THRESHOLD)
      unlocked = Math.min(unlocked + BATCH, TOTAL_LEVELS);
    else break;
  }
  return unlocked;
}

export default function LevelScreen({
  t,
  lang,
  // NOTE: we now derive unlocks from storage; this prop is ignored if present.
  onLevelClick,
  onLockedAttempt, // ← OPTIONAL: when a locked tile is tapped, we’ll call this with details
  mode = "classic", // or "timetrial"
  progress,
}) {
  // read best-ever stars per level from in-memory progress state
  const starsByLevelFromStore = useMemo(() => {
    const byMode = progress?.[mode];
    return byMode?.starsByLevel || {};
  }, [progress, mode]);

  const totalStars = useMemo(
    () =>
      Object.values(starsByLevelFromStore).reduce(
        (sum, s) => sum + Number(s || 0),
        0
      ),
    [starsByLevelFromStore]
  );

  // 🔓 derive unlocked block count from persisted stars (not from in-memory props)
  const unlockedLevels = useMemo(() => {
    const storedUnlocked = progress?.[mode]?.unlockedUntil;
    const computed = computeUnlockedFromStars(starsByLevelFromStore);
    return Number.isFinite(Number(storedUnlocked))
      ? Math.max(Number(storedUnlocked), computed)
      : computed;
  }, [progress, mode, starsByLevelFromStore]);

  return (
    <div style={{ padding: "6px 12px", maxWidth: 960, margin: "0 auto" }}>
      {/* Title row below header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          margin: "8px 0 10px",
        }}
      >
        <div style={{ justifySelf: "start", fontSize: 20, fontWeight: 800 }}>
          {t ? t(lang, "selectLevel") : "Select level"}
        </div>
        <div style={{ justifySelf: "end" }}>
          <StarsBadge total={totalStars} />
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 14,
        }}
      >
        {Array.from({ length: TOTAL_LEVELS }, (_, i) => i + 1).map((id) => {
          const stars = starsByLevelFromStore[id] || 0;
          const locked = id > unlockedLevels;
          const completed = stars > 0;
          const showBadge = { 6: 12, 11: 24, 16: 36, 21: 48, 26: 60 }[id];

          let border = "1px solid #e2e8f0";
          let shadow = "none";
          if (completed && !locked) {
            border = "3px solid #f59e0b";
            shadow = "0 2px 10px rgba(245, 158, 11, 0.25)";
          }

          const handleClick = () => {
            if (!locked) {
              onLevelClick && onLevelClick(id);
              return;
            }
            // If locked, notify parent so it can show the Locked modal with exact requirement
            const info = starsNeededForLevelId(id, starsByLevelFromStore);
            if (onLockedAttempt) onLockedAttempt(info);
          };

          return (
            <button
              key={id}
              onClick={handleClick}
              // we keep it clickable even when locked so we can show the “need X★” popup
              style={{
                aspectRatio: "1 / 1",
                borderRadius: 16,
                border,
                boxShadow: shadow,
                background: locked ? "#f8fafc" : "#fff",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                opacity: locked ? 0.6 : 1,
                cursor: "pointer",
                transition: "box-shadow .15s ease, border-color .15s ease",
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 800 }}>{id}</div>
              <div style={{ marginTop: 4, fontSize: 12 }}>
                <span style={{ color: "#f59e0b" }}>{"★".repeat(stars)}</span>
                <span style={{ color: "#cbd5e1" }}>
                  {"★".repeat(3 - stars)}
                </span>
              </div>
              {locked && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 10,
                    color: "#94a3b8",
                  }}
                >
                  🔒
                </span>
              )}
              {locked && showBadge && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 6,
                    right: 6,
                    background: "#facc15",
                    color: "#1e293b",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: 8,
                    boxShadow: "0 1px 3px rgba(0,0,0,.2)",
                  }}
                >
                  {showBadge}★
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
