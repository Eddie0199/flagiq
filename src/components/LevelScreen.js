// components/LevelScreen.js
// Title & stars sit BELOW the header. Header already has back/heart/username/gear.

import React, { useMemo } from "react";
import {
  TOTAL_LEVELS,
  STARS_PER_LEVEL_MAX,
  BATCH,
  UNLOCK_THRESHOLD,
} from "../App";
import LevelGrid, { StarsBadge } from "./LevelGrid";

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
    <div
      style={{
        padding: "4px 12px 10px",
        maxWidth: 960,
        margin: "0 auto",
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Title row below header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          margin: "4px 0 8px",
        }}
      >
        <div
          style={{
            justifySelf: "start",
            fontSize: 18,
            fontWeight: 800,
            color: "#fff",
          }}
        >
          {t ? t(lang, "selectLevel") : "Select level"}
        </div>
        <div style={{ justifySelf: "end" }}>
          <StarsBadge total={totalStars} />
        </div>
      </div>

      <LevelGrid
        levels={Array.from({ length: TOTAL_LEVELS }, (_, i) => i + 1)}
        starsByLevel={starsByLevelFromStore}
        unlockedLevels={unlockedLevels}
        onLevelClick={onLevelClick}
        onLockedAttempt={onLockedAttempt}
      />
    </div>
  );
}
