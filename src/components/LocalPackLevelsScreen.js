import React, { useMemo } from "react";
import { BATCH, STARS_PER_LEVEL_MAX, UNLOCK_THRESHOLD } from "../App";
import { buildLocalPackLevels, getLocalPackProgress } from "../localPacks";
import LevelGrid, { StarsBadge } from "./LevelGrid";

export default function LocalPackLevelsScreen({
  pack,
  progress,
  onLevelClick,
  onLockedAttempt,
  levels: levelsProp,
  t,
  lang,
}) {
  const text = (key, fallback) => {
    if (!t || !lang) return fallback;
    const value = t(lang, key);
    return value === key ? fallback : value;
  };
  const levels = useMemo(
    () => levelsProp || (pack ? buildLocalPackLevels(pack) : []),
    [levelsProp, pack]
  );
  const levelsMap = useMemo(
    () =>
      progress?.localFlags?.packs?.[pack?.packId]?.starsByLevel || {},
    [progress, pack]
  );
  const packStats = useMemo(
    () => (pack ? getLocalPackProgress(pack, progress) : null),
    [pack, progress]
  );
  // Locking mirrors Classic/Time Trial: 5-level batches unlock by star ratio.
  const unlockedLevels = useMemo(() => {
    const starsMap = levelsMap;
    const totalLevels = levels.length;
    let unlocked = BATCH;
    while (unlocked < totalLevels) {
      const maxStarsPossible = unlocked * STARS_PER_LEVEL_MAX;
      const have = Object.values(starsMap).reduce(
        (sum, value) => sum + Number(value || 0),
        0
      );
      const ratio = maxStarsPossible > 0 ? have / maxStarsPossible : 0;
      if (ratio >= UNLOCK_THRESHOLD) {
        unlocked = Math.min(unlocked + BATCH, totalLevels);
      } else {
        break;
      }
    }
    return unlocked;
  }, [levels, levelsMap]);

  if (!pack) {
    return (
      <div style={{ padding: "12px 16px" }}>
        {text("loading", "Loading…")}
      </div>
    );
  }

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
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          margin: "4px 0 12px",
          gap: 6,
        }}
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: "#fff",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {text("selectLevel", "Select level")}
            <StarsBadge total={packStats?.starsEarned || 0} />
          </span>
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "rgba(226, 232, 240, 0.9)",
          }}
        >
          {pack.title}
        </div>
      </div>

      <LevelGrid
        levels={levels}
        starsByLevel={levelsMap}
        unlockedLevels={unlockedLevels}
        onLevelClick={onLevelClick}
        onLockedAttempt={onLockedAttempt}
      />
    </div>
  );
}
