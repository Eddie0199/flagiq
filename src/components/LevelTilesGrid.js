import React from "react";
import { BATCH, BLOCK_REQUIRE, starsNeededForLevelId } from "../App";

export default function LevelTilesGrid({
  levels,
  totalLevels,
  starsByLevel,
  unlockedLevels,
  onLevelClick,
  onLockedAttempt,
}) {
  return (
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
        const levelId = typeof level === "number" ? level : level.id;
        const stars = Number(starsByLevel[levelId] || 0);
        const locked = levelId > unlockedLevels;
        const completed = stars > 0;
        const blockEnd = Math.min(
          Math.ceil(levelId / BATCH) * BATCH,
          totalLevels
        );
        const showBadge =
          levelId % BATCH === 1 ? BLOCK_REQUIRE[blockEnd] ?? 0 : 0;
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
          const info = starsNeededForLevelId(levelId, starsByLevel);
          if (onLockedAttempt) onLockedAttempt(info);
        };

        return (
          <button
            key={levelId}
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
            <div style={{ fontSize: 18, fontWeight: 800 }}>{levelId}</div>
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
  );
}
