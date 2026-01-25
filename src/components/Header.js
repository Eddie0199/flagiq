import React, { useEffect, useState } from "react";
import { MAX_HEARTS, REGEN_MS } from "../App";
import { getCoinsByUser } from "./ProgressByUser"; // persistent coins

function formatRemaining(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

function HeartsPill({ hearts, t, lang }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const count = Number.isFinite(Number(hearts?.current))
    ? Number(hearts.current)
    : Number(hearts?.count || 0);
  const max = Number.isFinite(Number(hearts?.max))
    ? Number(hearts.max)
    : MAX_HEARTS;
  const nextRefreshAt = hearts?.nextRefreshAt;
  const lastTick =
    hearts?.lastRegenAt ??
    hearts?.lastTick ??
    hearts?.hearts_last_regen_at ??
    Date.now();

  const nextMs = Math.max(
    0,
    nextRefreshAt
      ? nextRefreshAt - now
      : REGEN_MS - (now - lastTick)
  );
  const showTimer = count < max;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 999,
        padding: "4px 6px",
        height: 36,
        boxShadow: "0 1px 2px rgba(0,0,0,.04)",
      }}
    >
      <div
        style={{
          position: "relative",
          width: 28,
          height: 28,
          borderRadius: 8,
          background: "#fff",
          border: "1px solid #e2e8f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        title={t && lang ? t(lang, "lives") : "Lives"}
      >
        <span style={{ fontSize: 18 }} role="img" aria-label="heart">
          ❤️
        </span>
        <span
          style={{
            position: "absolute",
            bottom: 1,
            right: 3,
            fontSize: 11,
            fontWeight: 800,
            color: "#0f172a",
            textShadow: "0 1px 0 rgba(255,255,255,.7)",
          }}
        >
          {count}
        </span>
      </div>
      {showTimer && (
        <span
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: "#0f172a",
            fontVariantNumeric: "tabular-nums",
          }}
          title={t && lang ? t(lang, "nextLife") : "Next life"}
        >
          {formatRemaining(nextMs)}
        </span>
      )}
    </div>
  );
}

function CoinsPill({ username, coinsProp, t, lang, onClick, disableClick }) {
  const [coins, setCoins] = useState(() => getCoinsByUser(username));

  // keep in sync with storage so it updates when GameScreen/home change it
  useEffect(() => {
    const id = setInterval(() => {
      const latest = getCoinsByUser(username);
      setCoins(latest);
    }, 1500);
    return () => clearInterval(id);
  }, [username]);

  // prefer live prop from App if provided
  const displayCoins =
    typeof coinsProp === "number" ? coinsProp : Number(coins || 0);

  const label = t && lang ? t(lang, "coinsPillLabel") : "Shop"; // small hint it opens a shop

  const clickable = typeof onClick === "function" && !disableClick;
  const Wrapper = clickable ? "button" : "div";

  return (
    <Wrapper
      onClick={clickable ? onClick : undefined}
      style={{
        padding: "4px 10px",
        background: "#f1f5f9",
        border: "1px solid #e2e8f0",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        color: "#0f172a",
        display: "inline-flex",
        gap: 6,
        alignItems: "center",
        height: 36,
        cursor: clickable ? "pointer" : "default",
        boxShadow: clickable ? "0 2px 6px rgba(15,23,42,0.12)" : "none",
        transition: "transform 0.08s ease, box-shadow 0.08s ease",
      }}
      title={
        clickable
          ? t && lang
            ? t(lang, "openShopTooltip")
            : "Open booster shop"
          : t && lang
          ? t(lang, "coins")
          : "Coins"
      }
      onMouseDown={(e) => {
        if (!clickable) return;
        e.currentTarget.style.transform = "scale(0.97)";
      }}
      onMouseUp={(e) => {
        if (!clickable) return;
        e.currentTarget.style.transform = "scale(1)";
      }}
      onMouseLeave={(e) => {
        if (!clickable) return;
        e.currentTarget.style.transform = "scale(1)";
      }}
    >
      <span aria-hidden="true">💰</span>
      <span>{displayCoins}</span>
      {clickable && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "2px 5px",
            borderRadius: 999,
            background: "#e2e8f0",
            color: "#0f172a",
          }}
        >
          {label}
        </span>
      )}
    </Wrapper>
  );
}

export default function Header({
  showBack,
  onBack,
  hearts,
  onSettings,
  showHearts,
  t,
  lang,
  coins = 0, // live coins prop from parent
  username,
  onCoinsClick, // optional: when provided, coins pill becomes clickable
  disableCoinsClick = false,
}) {
  return (
    <div className="header-wrapper">
      <div className="header-row">
        {/* Back button */}
        <div className="header-left">
          {showBack ? (
            <button
              onClick={onBack}
              className="header-back-button"
              style={{
                padding: "0 12px",
                height: 36,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                borderRadius: 12,
                border: "1px solid #e2e8f0",
                background: "#fff",
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              ← {t && lang ? t(lang, "back") : "Back"}
            </button>
          ) : null}
        </div>

        {/* Hearts + Coins pill + Settings */}
        <div className="header-right">
          {showHearts && hearts ? (
            <HeartsPill hearts={hearts} t={t} lang={lang} />
          ) : null}
          <CoinsPill
            username={username}
            coinsProp={coins}
            t={t}
            lang={lang}
            onClick={onCoinsClick}
            disableClick={disableCoinsClick}
          />
          <button
            onClick={onSettings}
            aria-label={t && lang ? t(lang, "settings") : "Settings"}
            title={t && lang ? t(lang, "settings") : "Settings"}
            style={{
              background: "#f1f5f9",
              color: "#0f172a",
              border: "1px solid #e2e8f0",
              borderRadius: 999,
              width: 36,
              height: 36,
              lineHeight: "36px",
              textAlign: "center",
              fontSize: 18,
              boxShadow: "0 1px 3px rgba(0,0,0,.06)",
              cursor: "pointer",
            }}
          >
            ⚙️
          </button>
        </div>
      </div>
    </div>
  );
}
