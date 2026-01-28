import React, { useMemo, useState } from "react";
import {
  buildLocalPackLevels,
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
  const [failedIcons, setFailedIcons] = useState({});
  const text = (key, fallback) => {
    if (!t || !lang) return fallback;
    const value = t(lang, key);
    return value === key ? fallback : value;
  };

  const packIconColors = {
    all: "#b91c1c",
    ch: "#dc2626",
    es: "#f97316",
    de: "#f59e0b",
    us: "#3b82f6",
    gb: "#6366f1",
  };

  const enrichedPacks = useMemo(
    () =>
      (packs || [])
        .filter((pack) => String(pack.packId || "").toLowerCase() !== "all")
        .map((pack) => {
        const levels = buildLocalPackLevels(pack);
        const stats = getLocalPackProgress(pack, progress);
        const unlocked = isLocalPackUnlocked(pack);
        return { pack, levels, stats, unlocked };
      }),
    [packs, progress]
  );

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
        {enrichedPacks.map(({ pack, levels, stats, unlocked }) => {
          const packId = String(pack.packId || "").toLowerCase();
          const isReady = packId === "us";
          const locked = !unlocked || !isReady;
          const packName = text(
            `localFlags.packs.${packId}.name`,
            pack.title
          );
          const iconSrc = `/local-flags/packs/${packId}.svg`;
          return (
            <button
              key={pack.packId}
              onClick={() => {
                if (locked) {
                  if (!isReady) {
                    setLockMessage(text("comingSoon", "Coming soon"));
                    return;
                  }
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
                minHeight: 120,
                position: "relative",
                opacity: locked ? 0.6 : 1,
                cursor: locked ? "not-allowed" : "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {failedIcons[packId] ? (
                  <div
                    aria-label={packName}
                    style={{
                      width: 40,
                      height: 28,
                      borderRadius: 6,
                      background: packIconColors[packId] || "#64748b",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      border: "1px solid rgba(15,23,42,0.1)",
                    }}
                  >
                    {packId.toUpperCase()}
                  </div>
                ) : (
                  <img
                    src={iconSrc}
                    alt={packName}
                    onError={() =>
                      setFailedIcons((prev) => ({ ...prev, [packId]: true }))
                    }
                    style={{
                      width: 40,
                      height: 28,
                      objectFit: "cover",
                      borderRadius: 6,
                      border: "1px solid rgba(15,23,42,0.1)",
                    }}
                  />
                )}
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: 16,
                    minHeight: 40,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {packName}
                </div>
              </div>
              <div style={{ flex: 1 }} />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#0f172a",
                }}
              >
                {isReady ? (
                  <>
                    <span>
                      {stats.completedLevels}/{levels.length} levels
                    </span>
                    <span>
                      Stars: {stats.starsEarned}/{stats.maxStars}
                    </span>
                  </>
                ) : (
                  <span>{text("comingSoon", "Coming soon")}</span>
                )}
              </div>
              {locked ? (
                <div
                  style={{
                    position: "absolute",
                    top: 10,
                    right: 10,
                    background: isReady ? "#0f172a" : "#f59e0b",
                    color: "white",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 999,
                  }}
                >
                  {isReady
                    ? text("locked", "Locked")
                    : text("comingSoon", "Coming soon")}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
