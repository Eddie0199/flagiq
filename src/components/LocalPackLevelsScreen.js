import React, { useMemo } from "react";
import {
  BATCH,
  STARS_PER_LEVEL_MAX,
  UNLOCK_THRESHOLD,
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
    <div style={{ padding: "6px 12px", maxWidth: 960, margin: "0 auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          margin: "8px 0 10px",
        }}
      >
        <div style={{ justifySelf: "start", fontSize: 20, fontWeight: 800 }}>
          {pack.title}
        </div>
        <div style={{ justifySelf: "end" }}>
          <StarsBadge total={packStats?.starsEarned || 0} />
        </div>
      </div>
      <div style={{ marginBottom: 6, color: "#475569", fontSize: 13 }}>
        {text("selectLevel", "Select level")}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 14,
        }}
      >
        {levels.map((level) => {
          const stars = Number(levelsMap[level.id] || 0);
          const locked = level.id > unlockedLevels;
          const completed = stars > 0;
          let border = "1px solid #e2e8f0";
          let shadow = "none";
          if (completed) {
            border = "3px solid #f59e0b";
            shadow = "0 2px 10px rgba(245, 158, 11, 0.25)";
          }

          return (
            <button
              key={level.id}
              onClick={() => {
                if (!locked && onLevelClick) {
                  onLevelClick(level);
                }
              }}
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
                cursor: locked ? "not-allowed" : "pointer",
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
            </button>
          );
        })}
      </div>
    </div>
  );
}
