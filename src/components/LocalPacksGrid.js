import React, { useMemo, useState } from "react";
import { flagSrc } from "../App";
import {
  buildLocalPackLevels,
  buildPackIcon,
  getLocalPackProgress,
  isLocalPackUnlocked,
} from "../localPacks";

export default function LocalPacksGrid({
  packs,
  progress,
  onPackClick,
  t,
  lang,
}) {
  const [lockMessage, setLockMessage] = useState("");
  const text = (key, fallback) => {
    if (!t || !lang) return fallback;
    const value = t(lang, key);
    return value === key ? fallback : value;
  };

  const sortedPacks = useMemo(() => {
    const enriched = (packs || []).map((pack) => {
      const levels = buildLocalPackLevels(pack);
      const stats = getLocalPackProgress(pack, progress);
      const unlocked = isLocalPackUnlocked(pack);
      const hasProgress = stats.starsEarned > 0 || stats.completedLevels > 0;
      return { pack, levels, stats, unlocked, hasProgress };
    });

    return enriched.sort((a, b) => {
      if (a.pack.type !== b.pack.type) {
        return a.pack.type === "all" ? -1 : 1;
      }
      if (a.hasProgress !== b.hasProgress) {
        return a.hasProgress ? -1 : 1;
      }
      if (a.unlocked !== b.unlocked) {
        return a.unlocked ? -1 : 1;
      }
      return a.pack.title.localeCompare(b.pack.title);
    });
  }, [packs, progress]);

  return (
    <div style={{ width: "100%" }}>
      {lockMessage ? (
        <div
          style={{
            marginBottom: 8,
            padding: "6px 10px",
            background: "rgba(15, 23, 42, 0.7)",
            color: "white",
            borderRadius: 10,
            fontSize: 12,
            textAlign: "center",
          }}
        >
          {lockMessage}
        </div>
      ) : null}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 14,
        }}
      >
        {sortedPacks.map(({ pack, levels, stats, unlocked }) => {
          const locked = !unlocked;
          const typeLabel =
            pack.type === "all"
              ? text("allPack", "All Pack")
              : text("countryPack", "Country Pack");
          return (
            <button
              key={pack.packId}
              onClick={() => {
                if (locked) {
                  setLockMessage(
                    text(
                      "localPackLocked",
                      "Locked — complete more local packs to unlock."
                    )
                  );
                  return;
                }
                setLockMessage("");
                onPackClick && onPackClick(pack);
              }}
              style={{
                borderRadius: 16,
                border: "1px solid rgba(15,23,42,0.12)",
                background: "rgba(255,255,255,0.9)",
                padding: "12px 12px 10px",
                boxShadow: "0 4px 12px rgba(15,23,42,0.08)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                position: "relative",
                opacity: locked ? 0.6 : 1,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <img
                  src={buildPackIcon(pack, flagSrc)}
                  alt={pack.title}
                  style={{
                    width: 40,
                    height: 28,
                    objectFit: "cover",
                    borderRadius: 6,
                    border: "1px solid rgba(15,23,42,0.1)",
                  }}
                />
                <div style={{ fontWeight: 800, fontSize: 16 }}>
                  {pack.title}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#334155" }}>
                {typeLabel}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#0f172a",
                }}
              >
                <span>
                  {stats.completedLevels}/{levels.length} levels
                </span>
                <span>
                  Stars: {stats.starsEarned}/{stats.maxStars}
                </span>
              </div>
              {locked ? (
                <div
                  style={{
                    position: "absolute",
                    top: 10,
                    right: 10,
                    background: "#0f172a",
                    color: "white",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 999,
                  }}
                >
                  {text("locked", "Locked")}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
