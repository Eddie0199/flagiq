// /src/components/StoreScreen.js
// Booster shop: spend coins on hints & (dev) get more coins.

import React, { useEffect, useRef, useState } from "react";
import {
  fetchStoreProducts,
  getIapDiagnosticsState,
  purchaseProduct,
} from "../purchases";
import { PRODUCT_IDS, SHOP_PRODUCTS } from "../shopProducts";
import { getDisplayedIapPrice } from "../storePriceDisplay";

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

const COIN_PACKS = SHOP_PRODUCTS.filter((p) => p.type === "coins");

// 💖 cost for +1 heart (coins)
const HEART_COIN_COST = 50;
const CTA_STATES = {
  idle: "idle",
  purchasing: "purchasing",
  success: "success",
  owned: "owned",
};

function useCtaStateMachine(successDurationMs = 1200) {
  const [states, setStates] = useState({});
  const timersRef = useRef({});

  const clearTimer = (id) => {
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
  };

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(clearTimeout);
      timersRef.current = {};
    };
  }, []);

  const setState = (id, state) => {
    setStates((prev) => {
      if (prev[id] === state) return prev;
      return { ...prev, [id]: state };
    });
  };

  const beginPurchase = (id) => {
    clearTimer(id);
    setState(id, CTA_STATES.purchasing);
  };

  const markSuccess = (id, { owned = false } = {}) => {
    clearTimer(id);
    if (owned) {
      setState(id, CTA_STATES.owned);
      return;
    }
    setState(id, CTA_STATES.success);
    timersRef.current[id] = setTimeout(() => {
      setState(id, CTA_STATES.idle);
    }, successDurationMs);
  };

  const resetState = (id) => {
    clearTimer(id);
    setState(id, CTA_STATES.idle);
  };

  const getState = (id) => states[id] || CTA_STATES.idle;

  const resetAll = () => {
    Object.keys(timersRef.current).forEach((id) => clearTimer(id));
    setStates({});
  };

  return {
    getState,
    beginPurchase,
    markSuccess,
    resetState,
    resetAll,
  };
}

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
  showPriceDebugOverlay = false,
}) {
  const [message, setMessage] = useState("");
  const [storeStatus, setStoreStatus] = useState("loading");
  const [storeProductsById, setStoreProductsById] = useState({});
  const [nativeStoreSummary, setNativeStoreSummary] = useState({
    storefrontCountryCode: null,
    deviceLocaleCurrentIdentifier: null,
  });
  const loadRequestIdRef = useRef(0);
  const ctaListRef = useRef(null);
  const ctaState = useCtaStateMachine(1200);

  const text = (key, fallback) => {
    if (t && lang) {
      const value = t(lang, key);
      return value === key ? fallback : value;
    }
    return fallback;
  };

  const purchaseFailedMessage = text(
    "storePurchaseFailedRetry",
    "Purchase failed. Please try again."
  );
  const purchaseCancelledMessage = text(
    "storePurchaseCancelled",
    "Purchase cancelled."
  );
  const storeUnavailableMessage = "Store unavailable, please try again.";

  const loadStoreProducts = async () => {
    const requestId = ++loadRequestIdRef.current;
    setStoreStatus("loading");
    ctaState.resetAll();

    try {
      const result = await fetchStoreProducts();
      if (requestId !== loadRequestIdRef.current) return;

      if (!result?.success) {
        setStoreStatus("unavailable");
        setStoreProductsById({});
        setMessage(storeUnavailableMessage);
        return;
      }

      const validProductIds = new Set(SHOP_PRODUCTS.map((p) => p.id));
      const mappedProducts = (result?.products || []).reduce((acc, product) => {
        if (product?.productId && validProductIds.has(product.productId)) {
          acc[product.productId] = product;
        }
        return acc;
      }, {});

      if (Object.keys(mappedProducts).length === 0) {
        setStoreStatus("unavailable");
        setStoreProductsById({});
        setMessage(storeUnavailableMessage);
        return;
      }

      setStoreProductsById(mappedProducts);
      setStoreStatus("loaded");
      setMessage("");

      if (showPriceDebugOverlay) {
        const diagnostics = await getIapDiagnosticsState();
        setNativeStoreSummary({
          storefrontCountryCode: diagnostics?.storefrontCountryCode || null,
          deviceLocaleCurrentIdentifier:
            diagnostics?.deviceLocaleCurrentIdentifier || null,
        });
      }
    } catch (e) {
      if (requestId !== loadRequestIdRef.current) return;
      setStoreStatus("unavailable");
      setStoreProductsById({});
      setMessage(storeUnavailableMessage);
    }
  };

  useEffect(() => {
    loadStoreProducts();
  }, []);

  useEffect(() => {
    if (!showPriceDebugOverlay) return;
    getIapDiagnosticsState()
      .then((diagnostics) => {
        setNativeStoreSummary({
          storefrontCountryCode: diagnostics?.storefrontCountryCode || null,
          deviceLocaleCurrentIdentifier:
            diagnostics?.deviceLocaleCurrentIdentifier || null,
        });
      })
      .catch(() => {});
  }, [showPriceDebugOverlay]);

  const ensureHintsShape = (prev) => {
    const base = prev || {};
    return {
      remove2: base.remove2 ?? 0,
      autoPass: base.autoPass ?? 0,
      pause: base.pause ?? 0,
    };
  };

  async function buyBooster(item) {
    if (!onUpdateCoins || !setHints) {
      setMessage(purchaseFailedMessage);
      return;
    }
    if (coins < item.cost) {
      setMessage(text("storeNotEnoughCoins", "Not enough coins for that."));
      return;
    }

    ctaState.beginPurchase(item.id);

    try {
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

      setMessage("");
      ctaState.markSuccess(item.id);
    } catch (e) {
      ctaState.resetState(item.id);
      setMessage(purchaseFailedMessage);
    }
  }

  async function buyHeartWithCoins() {
    const id = "heart_coin";
    if (!onBuyHeartWithCoins) {
      setMessage(purchaseFailedMessage);
      return;
    }
    if (!canBuyHeartWithCoins) {
      return;
    }

    ctaState.beginPurchase(id);
    try {
      await onBuyHeartWithCoins();
      setMessage("");
      ctaState.markSuccess(id);
    } catch (e) {
      ctaState.resetState(id);
      setMessage(purchaseFailedMessage);
    }
  }

  async function buyCoins(pack) {
    const displayedPrice = getDisplayedIapPrice(pack.id, storeProductsById);
    if (storeStatus !== "loaded") {
      setMessage(storeUnavailableMessage);
      return;
    }
    if (displayedPrice.source !== "storekit") {
      setMessage(storeUnavailableMessage);
      return;
    }

    ctaState.beginPurchase(pack.id);

    try {
      const result = await purchaseProduct(pack.id);
      if (result?.success) {
        setMessage(text("storeCoinsAdded", "Purchase successful! Coins added."));
        ctaState.markSuccess(pack.id);
      } else if (result?.cancelled) {
        ctaState.resetState(pack.id);
        setMessage(purchaseCancelledMessage);
      } else {
        ctaState.resetState(pack.id);
        setMessage(
          result?.error || text("storePurchaseFailed", "Purchase failed")
        );
      }
    } catch (e) {
      ctaState.resetState(pack.id);
      setMessage(text("storePurchaseFailed", "Purchase failed"));
    }
  }

  const heartsFull = typeof hearts === "number" && hearts >= maxHearts;
  const storeUnavailable = storeStatus === "unavailable";
  const storeLoading = storeStatus === "loading";
  const storeReady = storeStatus === "loaded";
  const storeProducts = Object.values(storeProductsById);
  const showStoreUnavailableBanner =
    storeProducts.length === 0 && storeUnavailable;
  const canBuyHeartWithCoins =
    !heartsFull && typeof coins === "number" && coins >= HEART_COIN_COST;
  const heartCtaState = ctaState.getState("heart_coin");
  const heartCtaDisabled =
    !canBuyHeartWithCoins ||
    heartCtaState === CTA_STATES.purchasing ||
    heartCtaState === CTA_STATES.success ||
    heartCtaState === CTA_STATES.owned;
  const getStoreProductPriceViewModel = (productId) => {
    const displayedPrice = getDisplayedIapPrice(productId, storeProductsById);
    return { storeProduct: displayedPrice.storeProduct, displayedPrice };
  };
  const heartsRefillPriceViewModel = getStoreProductPriceViewModel(
    PRODUCT_IDS.HEARTS_REFILL
  );
  const heartsRefillState = ctaState.getState(PRODUCT_IDS.HEARTS_REFILL);
  const heartsRefillDisabled =
    heartsFull ||
    !storeReady ||
    heartsRefillPriceViewModel.displayedPrice.source !== "storekit" ||
    heartsRefillState === CTA_STATES.purchasing ||
    heartsRefillState === CTA_STATES.success;
  const mappedProductCount = Object.keys(storeProductsById).length;
  const storeProductsLoaded = mappedProductCount > 0;

  useEffect(() => {
    if (!storeReady) return;

    const hasPoundFromStoreKit = Object.values(storeProductsById).some((product) =>
      String(product?.localizedPriceString || "").includes("£")
    );
    if (!hasPoundFromStoreKit) return;

    const nonStoreKitProducts = SHOP_PRODUCTS.map((product) => {
      const displayedPrice = getDisplayedIapPrice(product.id, storeProductsById);
      return displayedPrice.source !== "storekit" ? product.id : null;
    }).filter(Boolean);

    if (nonStoreKitProducts.length > 0) {
      console.warn("[IAP diagnostics] StoreKit returned £ but UI is not bound to StoreKit for some products.", {
        nonStoreKitProducts,
        storeStatus,
      });
    }
  }, [storeProductsById, storeReady, storeStatus]);

  useEffect(() => {
    if (!showPriceDebugOverlay) return;

    SHOP_PRODUCTS.forEach((product) => {
      const displayedPrice = getDisplayedIapPrice(product.id, storeProductsById);
      const storekitLocalizedPriceString =
        displayedPrice.storeProduct?.localizedPriceString || null;
      if (storekitLocalizedPriceString) return;

      const ctaNode = ctaListRef.current?.querySelector(
        `[data-iap-cta-product-id="${product.id}"]`
      );
      const ctaText = ctaNode?.textContent?.trim() || "";
      if (ctaText.includes("$")) {
        console.error("[IAP diagnostics] Dollar sign detected while StoreKit localizedPriceString is null.", {
          componentPath: "StoreScreen > iap-cta",
          productId: product.id,
          uiDisplayedPrice: displayedPrice.text,
          ctaRenderedText: ctaText,
          uiPriceSource: displayedPrice.source,
          storekitLocalizedPriceString,
        });
      }
    });
  }, [showPriceDebugOverlay, storeProductsById, storeStatus]);

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
            color: "#fff",
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
              const state = ctaState.getState(item.id);
              const isSuccess = state === CTA_STATES.success;
              const isPurchasing = state === CTA_STATES.purchasing;
              const isOwned = state === CTA_STATES.owned;
              const disabled = !affordable || isPurchasing || isSuccess || isOwned;
              const successLabel = "✓";

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
                    disabled={disabled}
                    style={{
                      border: "none",
                      borderRadius: 999,
                      padding: "6px 14px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: disabled ? "not-allowed" : "pointer",
                      background: isSuccess
                        ? "#16a34a"
                        : affordable
                        ? "#0f172a"
                        : "#cbd5e1",
                      border: isSuccess ? "1px dashed #15803d" : "none",
                      color: "#fff",
                      minWidth: 80,
                      textAlign: "center",
                    }}
                  >
                    {isSuccess ? successLabel : `💰 ${item.cost}`}
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
                onClick={buyHeartWithCoins}
                disabled={heartCtaDisabled}
                style={{
                  border: "none",
                  borderRadius: 999,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: heartCtaDisabled ? "not-allowed" : "pointer",
                  background:
                    heartCtaState === CTA_STATES.success
                      ? "#16a34a"
                      : canBuyHeartWithCoins
                      ? "#b91c1c"
                      : "#fecaca",
                  border:
                    heartCtaState === CTA_STATES.success
                      ? "1px dashed #15803d"
                      : "none",
                  color: "#fff",
                  minWidth: 80,
                  textAlign: "center",
                }}
              >
                {heartsFull
                  ? text("storeHeartsFull", "Full")
                  : heartCtaState === CTA_STATES.success
                  ? "✓"
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
              "Choose a pack to add coins."
            )}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(showStoreUnavailableBanner || storeLoading) && (
              <div
                style={{
                  borderRadius: 12,
                  border: "1px solid #cbd5e1",
                  background: "#f8fafc",
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#0f172a",
                  }}
                >
                  {storeLoading
                    ? text("storeLoading", "Connecting to store…")
                    : storeUnavailableMessage}
                </div>
                <button
                  onClick={loadStoreProducts}
                  disabled={storeLoading}
                  style={{
                    border: "none",
                    borderRadius: 999,
                    padding: "6px 12px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: storeLoading ? "not-allowed" : "pointer",
                    background: storeLoading ? "#94a3b8" : "#0f172a",
                    color: "#fff",
                  }}
                >
                  {text("storeRetry", "Retry")}
                </button>
              </div>
            )}

            {showPriceDebugOverlay && (
              <div
                style={{
                  borderRadius: 10,
                  border: "1px solid rgba(30, 41, 59, 0.3)",
                  background: "rgba(15, 23, 42, 0.8)",
                  padding: "10px 12px",
                  fontSize: 11,
                  color: "#e2e8f0",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div style={{ fontWeight: 700 }}>Shop price debug overlay</div>
                <div>storeProductsLoaded: {String(storeProductsLoaded)}</div>
                <div>mappedProductCount: {mappedProductCount}</div>
                <div>
                  storefrontCountryCode(native): {nativeStoreSummary.storefrontCountryCode || "null"}
                </div>
                <div>
                  deviceLocaleCurrentIdentifier(native): {nativeStoreSummary.deviceLocaleCurrentIdentifier || "null"}
                </div>
                {SHOP_PRODUCTS.map((product) => {
                  const displayed = getDisplayedIapPrice(product.id, storeProductsById);
                  const storeProduct = displayed.storeProduct || {};
                  return (
                    <div key={`diag-${product.id}`}>
                      {product.id} — uiDisplayedPrice={displayed.text}, uiPriceSource={displayed.source},
                      storekit.localizedPriceString={String(
                        storeProduct.localizedPriceString || null
                      )}, storekit.currencyCode={String(storeProduct.currencyCode || null)},
                      storekit.priceLocaleIdentifier={String(
                        storeProduct.priceLocaleIdentifier ||
                          storeProduct.priceLocale?.identifier ||
                          null
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div ref={ctaListRef} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {COIN_PACKS.map((pack) => {
              const coinsAmount =
                pack.reward?.coins ??
                pack.coins ??
                (pack.label ? parseInt(pack.label, 10) : 0);
              const priceViewModel = getStoreProductPriceViewModel(pack.id);
              const displayedPrice = priceViewModel.displayedPrice;
              const state = ctaState.getState(pack.id);
              const isSuccess = state === CTA_STATES.success;
              const isPurchasing = state === CTA_STATES.purchasing;
              const disabled =
                !storeReady ||
                displayedPrice.source !== "storekit" ||
                isPurchasing ||
                isSuccess;
              return (
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
                        fontSize: 12,
                        fontWeight: 800,
                        color: "#0f172a",
                      }}
                    >
                      {coinsAmount} {text("storeCoinsLabel", "coins")}
                    </div>
                  </div>
                </div>

                <button
                  data-iap-cta-product-id={pack.id}
                  onClick={() => buyCoins(pack)}
                  disabled={disabled}
                  style={{
                    border: "none",
                    borderRadius: 999,
                    padding: "6px 14px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: disabled ? "not-allowed" : "pointer",
                    background: isSuccess ? "#16a34a" : storeReady ? "#0f172a" : "#94a3b8",
                    border: isSuccess ? "1px dashed #15803d" : "none",
                    color: "#fff",
                    minWidth: 80,
                    textAlign: "center",
                  }}
                >
                  {isSuccess ? "✓" : displayedPrice.text}
                </button>
              </div>
              );
            })}

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
                data-iap-cta-product-id={PRODUCT_IDS.HEARTS_REFILL}
                onClick={async () => {
                  const id = PRODUCT_IDS.HEARTS_REFILL;
                  const refillPriceData = getDisplayedIapPrice(id, storeProductsById);
                  try {
                    if (!storeReady || refillPriceData.source !== "storekit") {
                      setMessage(storeUnavailableMessage);
                      return;
                    }

                    ctaState.beginPurchase(id);
                    const res = await purchaseProduct(PRODUCT_IDS.HEARTS_REFILL);
                    if (res?.success) {
                      ctaState.markSuccess(id);
                      setMessage(
                        text("storePurchaseSuccess", "Purchase successful! Hearts refilled.")
                      );
                    } else if (res?.cancelled) {
                      ctaState.resetState(id);
                      setMessage(purchaseCancelledMessage);
                    } else {
                      ctaState.resetState(id);
                      setMessage(
                        res?.error || text("storePurchaseFailed", "Purchase failed")
                      );
                    }
                  } catch (e) {
                    ctaState.resetState(id);
                    setMessage(text("storePurchaseFailed", "Purchase failed"));
                  }
                }}
                disabled={heartsRefillDisabled}
                style={{
                  border: "none",
                  borderRadius: 999,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: heartsRefillDisabled ? "not-allowed" : "pointer",
                  background:
                    heartsRefillState === CTA_STATES.success
                      ? "#16a34a"
                      : heartsRefillDisabled
                      ? "#cbd5e1"
                      : "#0f172a",
                  border:
                    heartsRefillState === CTA_STATES.success
                      ? "1px dashed #15803d"
                      : "none",
                  color: "#fff",
                  minWidth: 80,
                  textAlign: "center",
                }}
              >
                {heartsFull
                  ? text("storeHeartsFull", "Full")
                  : heartsRefillState === CTA_STATES.success
                  ? "✓"
                  : heartsRefillPriceViewModel.displayedPrice.text}
              </button>
            </div>
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
