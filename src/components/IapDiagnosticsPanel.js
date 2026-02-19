import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearIapDiagnostics,
  fetchStoreProducts,
  getIapDiagnosticsState,
  purchaseProduct,
} from "../purchases";
import { PRODUCT_IDS, SHOP_PRODUCTS } from "../shopProducts";
import { getProductCurrencyDiagnostics } from "../storePriceDisplay";

const JS_BUILD_MARKER = "2026-02-19-B42";

function toPretty(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
}

function copyText(value) {
  if (navigator?.clipboard?.writeText) {
    return navigator.clipboard.writeText(value);
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
  return Promise.resolve();
}

export default function IapDiagnosticsPanel({ visible }) {
  const [state, setState] = useState(null);
  const [busyAction, setBusyAction] = useState("");
  const [safeAreaInfo, setSafeAreaInfo] = useState({
    safeAreaInsetTop: "unknown",
    configuredHeaderTopPadding: "unknown",
    currentHeaderTopPadding: "unknown",
  });
  const nativeBuildInfo = useMemo(() => {
    if (typeof window === "undefined") return null;
    return window.__NATIVE_BUILD_INFO__ || window.NATIVE_BUILD_INFO || null;
  }, [visible]);

  const refresh = useCallback(async () => {
    const next = await getIapDiagnosticsState();
    setState(next);
  }, []);

  useEffect(() => {
    if (!visible) return;
    refresh();
  }, [refresh, visible]);


  useEffect(() => {
    if (!visible || typeof window === "undefined" || typeof document === "undefined") return;

    const updateSafeAreaInfo = () => {
      const probe = document.createElement("div");
      probe.style.position = "fixed";
      probe.style.left = "-9999px";
      probe.style.top = "-9999px";
      probe.style.paddingTop = "env(safe-area-inset-top, 0px)";
      probe.style.margin = "0";

      document.body.appendChild(probe);
      const probeStyles = window.getComputedStyle(probe);
      const safeAreaInsetTop = probeStyles.paddingTop || "unknown";
      document.body.removeChild(probe);

      const rootStyles = window.getComputedStyle(document.documentElement);
      const configuredHeaderTopPadding =
        rootStyles.getPropertyValue("--header-top-padding")?.trim() || "unknown";

      const headerEl = document.querySelector(".header-wrapper");
      const currentHeaderTopPadding = headerEl
        ? window.getComputedStyle(headerEl).paddingTop || "unknown"
        : "n/a (header hidden)";

      setSafeAreaInfo({
        safeAreaInsetTop,
        configuredHeaderTopPadding,
        currentHeaderTopPadding,
      });
    };

    updateSafeAreaInfo();
    window.addEventListener("resize", updateSafeAreaInfo);
    return () => window.removeEventListener("resize", updateSafeAreaInfo);
  }, [visible]);

  const combinedLogs = useMemo(() => {
    const js = Array.isArray(state?.jsLogs)
      ? state.jsLogs.map((entry) => ({ ...entry, source: "js" }))
      : [];
    const native = Array.isArray(state?.nativeEvents)
      ? state.nativeEvents.map((entry) => ({ ...entry, source: "native" }))
      : [];
    return [...js, ...native]
      .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")))
      .slice(0, 50);
  }, [state]);



  const productsById = useMemo(() => {
    const products = Array.isArray(state?.products) ? state.products : [];
    return products.reduce((acc, product) => {
      if (product?.productId) acc[product.productId] = product;
      return acc;
    }, {});
  }, [state]);

  const productUiDiagnostics = useMemo(() => {
    return SHOP_PRODUCTS.map((shopProduct) => {
      const storeProduct = productsById[shopProduct.id];
      return getProductCurrencyDiagnostics(shopProduct.id, storeProduct);
    });
  }, [productsById]);

  const isEchoUnimplemented =
    state?.pluginEchoStatus === "UNIMPLEMENTED" ||
    state?.pluginEchoError?.code === "UNIMPLEMENTED" ||
    String(state?.pluginEchoError?.message || "")
      .toLowerCase()
      .includes("plugin is not implemented");


  const currencyMismatchSummary = useMemo(() => {
    const mismatchedProducts = productUiDiagnostics
      .filter((product) => {
        const storekitPrice = String(product.storekitLocalizedPriceString || "").trim();
        const uiPrice = String(product.uiDisplayedPrice || "").trim();
        if (!storekitPrice || product.uiPriceSource !== "storekit") return false;
        return uiPrice !== storekitPrice;
      })
      .map((product) => product.productId);

    const placeholderProducts = productUiDiagnostics
      .filter((product) => product.uiPriceSource !== "storekit")
      .map((product) => product.productId);

    const hasMismatch = mismatchedProducts.length > 0;
    const hasPlaceholder = placeholderProducts.length > 0;

    let summary = "Currency mismatch summary: all UI prices match StoreKit localizedPriceString.";
    if (hasMismatch || hasPlaceholder) {
      const parts = [];
      parts.push(
        hasMismatch
          ? `mismatched products: ${mismatchedProducts.join(", ")}`
          : "mismatched products: none"
      );
      parts.push(
        hasPlaceholder
          ? `ui placeholder products: ${placeholderProducts.join(", ")}`
          : "ui placeholder products: none"
      );
      summary = `Currency mismatch summary: ${parts.join(" | ")}`;
    }

    return {
      mismatchedProducts,
      placeholderProducts,
      hasMismatch,
      hasPlaceholder,
      summary,
    };
  }, [productUiDiagnostics]);

  const diagnosticsText = useMemo(() => {
    if (!state) {
      return [
        `JS Build Marker: ${JS_BUILD_MARKER}`,
        `Native Build Info: ${toPretty(nativeBuildInfo || "missing")}`,
        "IAP diagnostics unavailable",
      ].join("\n\n");
    }
    return [
      `JS Build Marker: ${JS_BUILD_MARKER}`,
      `Native Build Info: ${toPretty(nativeBuildInfo || "missing")}`,
      `App Version: ${String(state.appVersion || "unknown")}`,
      `Build: ${String(state.buildNumber || "unknown")}`,
      `safeAreaInsetTop: ${String(safeAreaInfo.safeAreaInsetTop || "unknown")}`,
      `configuredHeaderTopPadding(--header-top-padding): ${String(
        safeAreaInfo.configuredHeaderTopPadding || "unknown"
      )}`,
      `currentHeaderTopPadding(.header-wrapper): ${String(
        safeAreaInfo.currentHeaderTopPadding || "unknown"
      )}`,
      `Echo status: ${String(state.pluginEchoStatus || "n/a")}`,
      `Echo result: ${toPretty(state.pluginEchoResult || null)}`,
      `Echo error: ${toPretty(state.pluginEchoError || null)}`,
      `Capacitor version: ${String(state.capacitorVersion || "unknown")}`,
      `Bridge registration snapshot: ${toPretty(state.registrationSnapshot || null)}`,
      `packageClassList: ${toPretty(state.packageClassList || [])}`,
      `resolvedPluginClasses: ${toPretty(state.resolvedPluginClasses || [])}`,
      `canMakePayments: ${String(state.canMakePayments)}`,
      `deviceLocaleCurrentIdentifier: ${String(state.deviceLocaleCurrentIdentifier || "unknown")}`,
      `currencySourceNote: ${String(
        state.currencySourceNote ||
          "Currency must match StoreKit priceLocale/storefront, not device locale."
      )}`,
      `storefrontCountryCode: ${String(state.storefrontCountryCode || "unknown")}`,
      `storefrontCountryCodeNote: ${String(state.storefrontCountryCodeNote || "")}`,
      `requestedProductIds: ${toPretty(state.requestedProductIds || [])}`,
      `products: ${toPretty(state.products || [])}`,
      `invalidProductIdentifiers: ${toPretty(state.invalidProductIdentifiers || [])}`,
      `currencyMismatchSummary: ${currencyMismatchSummary.summary}`,
      `currencyMismatchProducts: ${toPretty(currencyMismatchSummary.mismatchedProducts)}`,
      `uiPlaceholderProducts: ${toPretty(currencyMismatchSummary.placeholderProducts)}`,
      `lastPurchaseAttempt: ${toPretty(state.lastPurchaseAttempt || null)}`,
      `jsLastFailure: ${toPretty(state.jsLastFailure || null)}`,
      `logs(last50): ${toPretty(combinedLogs)}`,
    ].join("\n\n");
  }, [combinedLogs, currencyMismatchSummary, nativeBuildInfo, safeAreaInfo, state]);

  const runAction = useCallback(
    async (name, fn) => {
      setBusyAction(name);
      try {
        await fn();
      } finally {
        setBusyAction("");
        await refresh();
      }
    },
    [refresh]
  );

  if (!visible) return null;

  return (
    <div
      style={{
        marginTop: 16,
        border: "1px solid rgba(148, 163, 184, 0.4)",
        borderRadius: 12,
        padding: 12,
        background: "rgba(2, 6, 23, 0.5)",
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
        IAP Diagnostics
      </div>
      {isEchoUnimplemented && (
        <div
          style={{
            marginBottom: 10,
            padding: "10px 12px",
            borderRadius: 10,
            background: "#dc2626",
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          Native StoreKitPurchase plugin missing in this build (UNIMPLEMENTED).
        </div>
      )}
      <div style={{ fontSize: 12, color: "#cbd5f5", marginBottom: 8 }}>
        <div>
          JS Build Marker: <strong>{JS_BUILD_MARKER}</strong>
        </div>
        <div>
          Native Build Info: <strong>{toPretty(nativeBuildInfo || "missing")}</strong>
        </div>
        <div>
          App Version: <strong>{String(state?.appVersion || "unknown")}</strong>
        </div>
        <div>
          Build: <strong>{String(state?.buildNumber || "unknown")}</strong>
        </div>
        <div>
          safe-area-inset-top: <strong>{String(safeAreaInfo.safeAreaInsetTop || "unknown")}</strong>
        </div>
        <div>
          Header top padding (configured):{" "}
          <strong>{String(safeAreaInfo.configuredHeaderTopPadding || "unknown")}</strong>
        </div>
        <div>
          Header top padding (current):{" "}
          <strong>{String(safeAreaInfo.currentHeaderTopPadding || "unknown")}</strong>
        </div>
        <div>
          Echo status: <strong>{String(state?.pluginEchoStatus || "") || "n/a"}</strong>
        </div>
        <div>
          Echo result: <strong>{toPretty(state?.pluginEchoResult || null)}</strong>
        </div>
        <div>
          Echo error: <strong>{toPretty(state?.pluginEchoError || null)}</strong>
        </div>
        <div>
          Capacitor version: <strong>{String(state?.capacitorVersion || "unknown")}</strong>
        </div>
        <div>
          packageClassList: <strong>{toPretty(state?.packageClassList || [])}</strong>
        </div>
        <div>
          resolvedPluginClasses: <strong>{toPretty(state?.resolvedPluginClasses || [])}</strong>
        </div>
        <div>
          canMakePayments: <strong>{String(state?.canMakePayments)}</strong>
        </div>
        <div>
          device Locale.current.identifier:{" "}
          <strong>{String(state?.deviceLocaleCurrentIdentifier || "unknown")}</strong>
        </div>
        <div>
          Currency source:{" "}
          <strong>
            {String(
              state?.currencySourceNote ||
                "Currency must match StoreKit priceLocale/storefront, not device locale."
            )}
          </strong>
        </div>
        <div>
          Storefront country code: <strong>{String(state?.storefrontCountryCode || "unknown")}</strong>
        </div>
        <div>
          Storefront note: <strong>{String(state?.storefrontCountryCodeNote || "") || "n/a"}</strong>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#cbd5f5", marginBottom: 8 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Product currency diagnostics</div>
        {productUiDiagnostics.map((product) => {
          const usesPlaceholder = product.uiPriceSource !== "storekit";
          return (
            <div
              key={product.productId}
              style={{
                marginBottom: 6,
                color: usesPlaceholder ? "#fca5a5" : "#cbd5f5",
                border: usesPlaceholder ? "1px solid rgba(220, 38, 38, 0.65)" : "none",
                borderRadius: usesPlaceholder ? 8 : 0,
                padding: usesPlaceholder ? "6px 8px" : 0,
                background: usesPlaceholder ? "rgba(127, 29, 29, 0.35)" : "transparent",
              }}
            >
              <strong>{String(product.productId || "unknown")}</strong>
              {" — "}
              uiDisplayedPrice={String(product.uiDisplayedPrice || "n/a")}, uiPriceSource=
              {String(product.uiPriceSource || "n/a")}, uiPriceSourceReason=
              {String(product.uiPriceSourceReason || "n/a")}, storekit.localizedPriceString=
              {String(product.storekitLocalizedPriceString || "n/a")}, storekit.currencyCode=
              {String(product.storekitCurrencyCode || "n/a")}, storekit.priceLocaleIdentifier=
              {String(product.storekitPriceLocaleIdentifier || "n/a")}, storekit.storefrontCountryCode=
              {String(product.storefrontCountryCode || "n/a")}, storekit.storefrontCountryCodeNote=
              {String(product.storefrontCountryCodeNote || "n/a")}
            </div>
          );
        })}
      </div>

      <div
        style={{
          fontSize: 12,
          color: "#d1fae5",
          marginBottom: 8,
          border: "1px solid rgba(52, 211, 153, 0.35)",
          borderRadius: 10,
          padding: "8px 10px",
          background: "rgba(6, 78, 59, 0.25)",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Currency mismatch summary</div>
        <div>{currencyMismatchSummary.summary}</div>
      </div>

      <div
        style={{
          fontSize: 12,
          color: "#fef9c3",
          marginBottom: 10,
          border: "1px solid rgba(250, 204, 21, 0.35)",
          borderRadius: 10,
          padding: "8px 10px",
          background: "rgba(113, 63, 18, 0.2)",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Troubleshooting (currency mismatch)</div>
        <div>• Delete app, reboot device, reinstall app.</div>
        <div>• Ensure Sandbox Apple Account storefront is correct (UK for GBP).</div>
        <div>• Re-fetch products from diagnostics (Retry fetch products).</div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        <button onClick={() => runAction("retry", fetchStoreProducts)} disabled={!!busyAction}>
          Retry fetch products
        </button>
        <button
          onClick={() => runAction("purchase", () => purchaseProduct(PRODUCT_IDS.COINS_250))}
          disabled={!!busyAction}
        >
          Test purchase: 250 coins
        </button>
        <button onClick={() => runAction("clear", clearIapDiagnostics)} disabled={!!busyAction}>
          Clear diagnostics
        </button>
        <button
          onClick={() => copyText(diagnosticsText)}
          disabled={!state}
        >
          Copy diagnostics to clipboard
        </button>
        {typeof navigator?.share === "function" && (
          <button
            onClick={() => navigator.share({ title: "IAP Diagnostics", text: diagnosticsText })}
            disabled={!state}
          >
            Share diagnostics
          </button>
        )}
      </div>

      <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", margin: 0 }}>
        {diagnosticsText}
      </pre>
    </div>
  );
}
