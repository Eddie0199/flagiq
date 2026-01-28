import React, { useMemo } from "react";
import {
  BATCH,
  BLOCK_REQUIRE,
  STARS_PER_LEVEL_MAX,
  UNLOCK_THRESHOLD,
  starsNeededForLevelId,
} from "../App";
import { buildLocalPackLevels, getLocalPackProgress } from "../localPacks";

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
          {pack.title}
        </div>
        <div style={{ justifySelf: "end" }}>
          <StarsBadge total={packStats?.starsEarned || 0} />
        </div>
      </div>
      <div style={{ marginBottom: 8, color: "#fff", fontSize: 14 }}>
        {text("selectLevel", "Select level")}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          columnGap: "clamp(8px, 2vw, 12px)",
          rowGap: "clamp(4px, 1.4vw, 8px)",
          flex: 1,
          minHeight: 0,
        }}
      >
        {levels.map((level) => {
          const stars = Number(levelsMap[level.id] || 0);
          const locked = level.id > unlockedLevels;
          const completed = stars > 0;
          const blockEnd = Math.min(
            Math.ceil(level.id / BATCH) * BATCH,
            levels.length
          );
          const showBadge =
            level.id % BATCH === 1 ? BLOCK_REQUIRE[blockEnd] ?? 0 : 0;
          let border = "1px solid #e2e8f0";
          let shadow = "none";
          if (completed && !locked) {
            border = "3px solid #f59e0b";
            shadow = "0 2px 10px rgba(245, 158, 11, 0.25)";
          }

          const handleClick = () => {
            if (!locked) {
              if (onLevelClick) onLevelClick(level);
              return;
            }
            const info = starsNeededForLevelId(level.id, levelsMap);
            if (onLockedAttempt) onLockedAttempt(info);
          };

          return (
            <button
              key={level.id}
              onClick={handleClick}
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
              <div style={{ fontSize: 18, fontWeight: 800 }}>{level.id}</div>
              <div style={{ marginTop: 4, fontSize: 12 }}>
                <span style={{ color: "#f59e0b" }}>{"★".repeat(stars)}</span>
                <span style={{ color: "#cbd5e1" }}>
                  {"★".repeat(3 - stars)}
                </span>
              </div>
              {locked ? (
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
              ) : null}
              {locked && showBadge > 0 ? (
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
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
