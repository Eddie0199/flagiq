import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearIapDiagnostics,
  fetchStoreProducts,
  getIapDiagnosticsState,
  purchaseProduct,
} from "../purchases";
import { PRODUCT_IDS } from "../shopProducts";

const JS_BUILD_MARKER = "2026-02-14-A";

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


  const isEchoUnimplemented =
    state?.pluginEchoStatus === "UNIMPLEMENTED" ||
    state?.pluginEchoError?.code === "UNIMPLEMENTED" ||
    String(state?.pluginEchoError?.message || "")
      .toLowerCase()
      .includes("plugin is not implemented");

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
      `requestedProductIds: ${toPretty(state.requestedProductIds || [])}`,
      `products: ${toPretty(state.products || [])}`,
      `invalidProductIdentifiers: ${toPretty(state.invalidProductIdentifiers || [])}`,
      `lastPurchaseAttempt: ${toPretty(state.lastPurchaseAttempt || null)}`,
      `jsLastFailure: ${toPretty(state.jsLastFailure || null)}`,
      `logs(last50): ${toPretty(combinedLogs)}`,
    ].join("\n\n");
  }, [combinedLogs, nativeBuildInfo, state]);

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
      </div>

      <div style={{ fontSize: 12, color: "#cbd5f5", marginBottom: 8 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Product currency diagnostics</div>
        {(Array.isArray(state?.products) ? state.products : []).map((product, index) => (
          <div key={product?.productId || `product-${index}`} style={{ marginBottom: 6 }}>
            <strong>{String(product?.productId || "unknown")}</strong>
            {" — "}
            price={String(product?.price || "n/a")}, priceLocale.identifier=
            {String(
              product?.priceLocaleIdentifier || product?.priceLocale?.identifier || "n/a"
            )}
            , priceLocale.currencyCode=
            {String(product?.currencyCode || product?.priceLocale?.currencyCode || "n/a")}
            , localizedPriceString(displayed)=
            {String(product?.localizedPriceString || "n/a")}
          </div>
        ))}
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
