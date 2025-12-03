// /src/components/StoreScreen.js
// Booster shop: spend coins on hints & (dev) get more coins.

import React, { useState } from "react";

const BOOSTER_ITEMS = [
  {
    id: "remove2_1",
    type: "remove2",
    qty: 1,
    cost: 80,
    icon: "🎯",
    labelKey: "storeRemove2Single",
    fallbackLabel: "Remove 2 (x1)",
  },
  {
    id: "pause_1",
    type: "pause",
    qty: 1,
    cost: 90,
    icon: "⏸️",
    labelKey: "storePauseSingle",
    fallbackLabel: "Pause timer (x1)",
  },
  {
    id: "autoPass_1",
    type: "autoPass",
    qty: 1,
    cost: 120,
    icon: "✅",
    labelKey: "storeAutoPassSingle",
    fallbackLabel: "Auto pass (x1)",
  },
  {
    id: "bundle_all",
    type: "bundle",
    qty: 1,
    cost: 250,
    icon: "⭐",
    labelKey: "storeAllBundle",
    fallbackLabel: "Triple pack (1 of each)",
  },
];

const COIN_PACKS = [
  { id: "coins_250", coins: 250, priceLabel: "€0.99" },
  { id: "coins_600", coins: 600, priceLabel: "€1.99" },
  { id: "coins_1500", coins: 1500, priceLabel: "€3.99" },
];

// 💖 cost for +1 heart (coins)
const HEART_COIN_COST = 50;

export default function StoreScreen({
  t,
  lang,
  coins,
  hints,
  setHints,
  onUpdateCoins,
  onBack,
  hearts,
  maxHearts,
  onBuyHeartWithCoins,
  onRefillHeartsWithMoney,
}) {
  const [message, setMessage] = useState("");

  const text = (key, fallback) => (t && lang ? t(lang, key) : fallback);

  const ensureHintsShape = (prev) => {
    const base = prev || {};
    return {
      remove2: base.remove2 ?? 0,
      autoPass: base.autoPass ?? 0,
      pause: base.pause ?? 0,
    };
  };

  function buyBooster(item) {
    if (!onUpdateCoins || !setHints) return;
    if (coins < item.cost) {
      setMessage(text("storeNotEnoughCoins", "Not enough coins for that."));
      return;
    }

    onUpdateCoins(coins - item.cost);

    setHints((prev) => {
      const base = ensureHintsShape(prev);
      if (item.type === "bundle") {
        return {
          ...base,
          remove2: base.remove2 + 1,
          autoPass: base.autoPass + 1,
          pause: base.pause + 1,
        };
      }
      return {
        ...base,
        [item.type]: base[item.type] + item.qty,
      };
    });

    const wonStr =
      item.type === "bundle"
        ? text("storeBoughtBundle", "You bought 1 of each hint!")
        : text("storeBoughtSingle", "Purchase successful!");

    setMessage(wonStr);
  }

  function buyCoins(pack) {
    if (!onUpdateCoins) return;

    // NOTE: prototype → adds directly
    onUpdateCoins(coins + pack.coins);

    setMessage(
      text(
        "storeCoinsAdded",
        `Dev mode: added ${pack.coins} coins to your balance.`
      )
    );
  }

  const heartsFull = typeof hearts === "number" && hearts >= maxHearts;
  const canBuyHeartWithCoins =
    !heartsFull && typeof coins === "number" && coins >= HEART_COIN_COST;

  return (
    <div style={{ padding: "10px 16px 24px", maxWidth: 900, margin: "0 auto" }}>
      {/* Title */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          marginBottom: 8,
        }}
      >
        <h1
          style={{
            fontSize: 26,
            fontWeight: 800,
            margin: "4px 0 2px",
            color: "#0f172a",
          }}
        >
          {text("storeTitle", "Booster shop")}
        </h1>
      </div>

      {/* Main content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 18,
          alignItems: "stretch",
        }}
      >
        {/* Boosters card */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: 18,
            padding: "14px 14px 12px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 4px 14px rgba(15,23,42,0.06)",
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              margin: "0 0 10px",
              color: "#0f172a",
            }}
          >
            {text("storeBoostersTitle", "Spend coins on boosters")}
          </h2>
          <p
            style={{
              margin: "0 0 12px",
              fontSize: 12,
              color: "#64748b",
            }}
          >
            {text(
              "storeBoostersDesc",
              "Booster hints can be used in any mode."
            )}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {BOOSTER_ITEMS.map((item) => {
              const affordable = coins >= item.cost;
              const label = text(item.labelKey, item.fallbackLabel);

              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 10px",
                    borderRadius: 14,
                    border: "1px solid #e2e8f0",
                    background: "#f8fafc",
                    gap: 10,
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 999,
                        background: "#ffffff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 2px 6px rgba(15,23,42,0.08)",
                        fontSize: 20,
                      }}
                    >
                      {item.icon}
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "#0f172a",
                        }}
                      >
                        {label}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => buyBooster(item)}
                    disabled={!affordable}
                    style={{
                      border: "none",
                      borderRadius: 999,
                      padding: "6px 14px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: affordable ? "pointer" : "not-allowed",
                      background: affordable ? "#0f172a" : "#cbd5e1",
                      color: "#fff",
                      minWidth: 80,
                      textAlign: "center",
                    }}
                  >
                    💰 {item.cost}
                  </button>
                </div>
              );
            })}

            {/* +1 Heart (coins) */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 10px",
                borderRadius: 14,
                border: "1px solid #fecaca",
                background: "#fef2f2",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 999,
                    background: "#fee2e2",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 6px rgba(15,23,42,0.08)",
                    fontSize: 20,
                  }}
                >
                  ❤️
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#0f172a",
                    }}
                  >
                    {text("storeExtraHeartLabel", "Extra Heart")}
                  </div>
                </div>
              </div>

              <button
                onClick={onBuyHeartWithCoins}
                disabled={!canBuyHeartWithCoins}
                style={{
                  border: "none",
                  borderRadius: 999,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: canBuyHeartWithCoins ? "pointer" : "not-allowed",
                  background: canBuyHeartWithCoins ? "#b91c1c" : "#fecaca",
                  color: "#fff",
                  minWidth: 80,
                  textAlign: "center",
                }}
              >
                {heartsFull
                  ? text("storeHeartsFull", "Full")
                  : `💰 ${HEART_COIN_COST}`}
              </button>
            </div>
          </div>
        </div>

        {/* Coin packs */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: 18,
            padding: "14px 14px 12px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 4px 14px rgba(15,23,42,0.06)",
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              margin: "0 0 10px",
              color: "#0f172a",
            }}
          >
            {text("storeCoinPacksTitle", "Get more coins")}
          </h2>
          <p
            style={{
              margin: "0 0 12px",
              fontSize: 12,
              color: "#64748b",
            }}
          >
            {text(
              "storeCoinPacksDesc",
              "Prototype mode: tapping a pack simply adds coins."
            )}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {COIN_PACKS.map((pack) => (
              <div
                key={pack.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 10px",
                  borderRadius: 14,
                  border: "1px solid #e2e8f0",
                  background: "#f8fafc",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 999,
                      background: "#fffbeb",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 2px 6px rgba(15,23,42,0.08)",
                      fontSize: 20,
                    }}
                  >
                    💰
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#0f172a",
                      }}
                    >
                      {pack.coins} {text("storeCoinsLabel", "coins")}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => buyCoins(pack)}
                  style={{
                    border: "none",
                    borderRadius: 999,
                    padding: "6px 14px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    background: "#0f172a",
                    color: "#fff",
                    minWidth: 80,
                    textAlign: "center",
                  }}
                >
                  {pack.priceLabel}
                </button>
              </div>
            ))}

            {/* Refill hearts (money) */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 10px",
                borderRadius: 14,
                border: "1px solid #fecaca",
                background: "#fef2f2",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 999,
                    background: "#fee2e2",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 6px rgba(15,23,42,0.08)",
                    fontSize: 20,
                  }}
                >
                  ❤️
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#0f172a",
                    }}
                  >
                    {text("storeRefillHeartsLabel", "Refill hearts to max")}
                  </div>
                </div>
              </div>

              <button
                onClick={onRefillHeartsWithMoney}
                disabled={heartsFull}
                style={{
                  border: "none",
                  borderRadius: 999,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: heartsFull ? "not-allowed" : "pointer",
                  background: heartsFull ? "#cbd5e1" : "#0f172a",
                  color: "#fff",
                  minWidth: 80,
                  textAlign: "center",
                }}
              >
                {heartsFull ? text("storeHeartsFull", "Full") : "€0.99"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* system message */}
      {message && (
        <div
          style={{
            marginTop: 14,
            fontSize: 12,
            color: "#0f172a",
            fontWeight: 600,
          }}
        >
          {message}
        </div>
      )}
    </div>
  );
}
