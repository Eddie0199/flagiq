import React, { useMemo } from "react";
import { getLocalPackProgress } from "../localPacks";

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
  t,
  lang,
}) {
  const text = (key, fallback) => {
    if (!t || !lang) return fallback;
    const value = t(lang, key);
    return value === key ? fallback : value;
  };
  const starsByLevel = useMemo(
    () => progress?.local?.starsByLevel || {},
    [progress]
  );
  const packStats = useMemo(
    () => (pack ? getLocalPackProgress(pack, progress) : null),
    [pack, progress]
  );

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
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 14,
        }}
      >
        {pack.levels.map((level) => {
          const stars = Number(starsByLevel[level.levelId] || 0);
          const completed = stars > 0;
          let border = "1px solid #e2e8f0";
          let shadow = "none";
          if (completed) {
            border = "3px solid #f59e0b";
            shadow = "0 2px 10px rgba(245, 158, 11, 0.25)";
          }

          return (
            <button
              key={level.levelId}
              onClick={() => onLevelClick && onLevelClick(level)}
              style={{
                borderRadius: 16,
                border,
                boxShadow: shadow,
                background: "#fff",
                padding: "12px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
              }}
            >
              <img
                src={level.flagSrc}
                alt={level.displayName}
                style={{
                  width: 60,
                  height: 40,
                  borderRadius: 8,
                  objectFit: "cover",
                  border: "1px solid #e2e8f0",
                  background: "#f8fafc",
                }}
              />
              <div style={{ fontWeight: 700, textAlign: "center" }}>
                {level.displayName}
              </div>
              <div style={{ fontSize: 12 }}>
                <span style={{ color: "#f59e0b" }}>{"★".repeat(stars)}</span>
                <span style={{ color: "#cbd5e1" }}>
                  {"★".repeat(3 - stars)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
