// src/purchases.js
// Centralised purchase entrypoint (web mock + native stub)

import { Capacitor, registerPlugin } from "@capacitor/core";
import { supabase } from "./supabaseClient";
import { getProductDefinition, SHOP_PRODUCTS } from "./shopProducts";

let rewardHandler = null;
const DEV_MODE_ENABLED = process.env.NODE_ENV !== "production";
const StoreKitPurchase = registerPlugin("StoreKitPurchase");
const IAP_LOG_MAX = 50;

let iapLogBuffer = [];
let iapLastFailure = null;
let iapPluginEcho = null;
let iapPluginEchoResult = null;
let iapPluginEchoError = null;

function appendIapLog(level, event, payload = {}) {
  const entry = {
    id: `${Date.now()}-${Math.random()}`,
    timestamp: new Date().toISOString(),
    level,
    event,
    payload,
  };
  iapLogBuffer = [entry, ...iapLogBuffer].slice(0, IAP_LOG_MAX);
  return entry;
}

function iapLog(event, payload = {}) {
  appendIapLog("info", event, payload);
  console.info(`[IAP] ${event}`, payload);
}

function iapWarn(event, payload = {}) {
  appendIapLog("warn", event, payload);
  console.warn(`[IAP] ${event}`, payload);
}

function recordIapFailure({ productId, errorDomain, errorCode, message, raw }) {
  iapLastFailure = {
    timestamp: new Date().toISOString(),
    productId: productId || "",
    errorDomain: errorDomain || "",
    errorCode: Number.isFinite(Number(errorCode)) ? Number(errorCode) : null,
    message: message || "",
    raw,
  };
  appendIapLog("error", "failure-captured", iapLastFailure);
}

export async function runIapStartupDiagnostics() {
  if (detectPlatform() !== "ios") {
    iapPluginEcho = null;
    iapPluginEchoResult = null;
    iapPluginEchoError = null;
    return;
  }

  if (typeof StoreKitPurchase?.echo !== "function") {
    iapPluginEcho = null;
    iapPluginEchoResult = null;
    iapPluginEchoError = { message: "StoreKitPurchase.echo not implemented" };
    return;
  }

  try {
    const result = await StoreKitPurchase.echo();
    iapPluginEcho = result?.status || null;
    iapPluginEchoResult = result ?? null;
    iapPluginEchoError = null;
  } catch (error) {
    iapPluginEcho = null;
    iapPluginEchoResult = null;
    iapPluginEchoError = toSerializableError(error);
  }
}

export function getIapDiagnosticsLogs() {
  return [...iapLogBuffer];
}

export function getIapLastFailure() {
  return iapLastFailure ? { ...iapLastFailure } : null;
}

export async function clearIapDiagnostics() {
  iapLogBuffer = [];
  iapLastFailure = null;
  if (typeof StoreKitPurchase?.iapDiagnosticsClear === "function") {
    try {
      await StoreKitPurchase.iapDiagnosticsClear();
    } catch (error) {
      iapWarn("native diagnostics clear failed", { error });
    }
  }
}

export async function getIapDiagnosticsState() {
  const base = {
    canMakePayments: null,
    requestedProductIds: SHOP_PRODUCTS.map((product) => product.id),
    products: [],
    invalidProductIdentifiers: [],
    lastPurchaseAttempt: null,
    nativeEvents: [],
    capacitorVersion: null,
    registrationSnapshot: null,
    packageClassList: [],
    resolvedPluginClasses: [],
    jsLogs: getIapDiagnosticsLogs(),
    jsLastFailure: getIapLastFailure(),
    pluginEchoStatus: iapPluginEcho,
    pluginEchoResult: iapPluginEchoResult,
    pluginEchoError: iapPluginEchoError,
  };

  if (detectPlatform() !== "ios") return base;

  if (typeof StoreKitPurchase?.iapDiagnosticsGetState === "function") {
    try {
      const nativeState = await StoreKitPurchase.iapDiagnosticsGetState();
      return {
        ...base,
        ...nativeState,
        jsLogs: getIapDiagnosticsLogs(),
        jsLastFailure: getIapLastFailure(),
        pluginEchoStatus: iapPluginEcho,
        pluginEchoResult: iapPluginEchoResult,
        pluginEchoError: iapPluginEchoError,
      };
    } catch (error) {
      iapWarn("native diagnostics fetch failed", { error });
      return {
        ...base,
        nativeFetchError: normalizeStoreKitError(error),
      };
    }
  }

  if (typeof StoreKitPurchase?.iapCanMakePayments === "function") {
    try {
      const result = await StoreKitPurchase.iapCanMakePayments();
      base.canMakePayments = result?.canMakePayments;
    } catch (error) {
      iapWarn("native canMakePayments failed", { error });
    }
  }

  return base;
}

export function registerPurchaseRewardHandler(handler) {
  rewardHandler = handler;
}

function detectPlatform() {
  try {
    if (Capacitor && typeof Capacitor.isNativePlatform === "function") {
      const isNative = Capacitor.isNativePlatform();
      if (isNative) {
        const platform =
          typeof Capacitor.getPlatform === "function"
            ? Capacitor.getPlatform()
            : "unknown";
        if (platform === "ios" || platform === "android") return platform;
        return "unknown";
      }
    }
  } catch (e) {}
  return "web";
}

async function persistPurchase(product, platform, rewardResult) {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    const userId = data?.user?.id;
    if (!userId) return;

    const coinsGranted = Number(rewardResult?.coinsGranted || 0);
    const heartsRefill = Boolean(
      rewardResult?.heartsRefilled || product?.reward?.heartsRefill
    );

    await supabase.from("purchases").insert([
      {
        user_id: userId,
        product_id: product.id,
        coins_granted: coinsGranted,
        hearts_refill: heartsRefill,
        platform,
      },
    ]);
  } catch (e) {
    console.warn("Failed to persist purchase", e);
  }
}

async function applyRewards(product, platform) {
  if (typeof rewardHandler !== "function") {
    iapWarn("entitlement handler missing", { productId: product?.id, platform });
    return { success: false, error: "Purchase system not ready" };
  }

  const rewardResult = await rewardHandler(product);
  iapLog("entitlements granted", {
    productId: product?.id,
    platform,
    rewardResult,
  });
  if (!rewardResult?.success) {
    return {
      success: false,
      error: rewardResult?.error || "Purchase failed",
    };
  }

  await persistPurchase(product, platform, rewardResult);
  return { success: true };
}

function normalizeStoreKitError(error) {
  if (!error) {
    return "Purchase failed (unknown error). Please contact support with code IAP_UNKNOWN.";
  }
  if (typeof error === "string") return error;
  const message =
    error?.message ||
    "Purchase failed (unknown error). Please contact support with code IAP_UNKNOWN.";
  if (message.includes("plugin is not implemented")) {
    return "StoreKit is not implemented in this build. Please update the app.";
  }
  return message;
}

function toSerializableError(error) {
  if (error == null) {
    return { message: "Unknown error" };
  }
  if (typeof error === "string") {
    return { message: error };
  }

  const serialized = {
    name: error?.name,
    code: error?.code,
    message: error?.message,
    stack: error?.stack,
    ...(error && typeof error === "object" ? error : {}),
  };

  return Object.fromEntries(
    Object.entries(serialized).filter(([, value]) => value !== undefined)
  );
}

async function purchaseWithStoreKit(productId) {
  const hasPurchaseMethod = typeof StoreKitPurchase?.purchase === "function";
  const pluginAvailable =
    typeof Capacitor?.isPluginAvailable === "function"
      ? Capacitor.isPluginAvailable("StoreKitPurchase")
      : undefined;
  if (!hasPurchaseMethod) {
    iapWarn("StoreKit plugin unavailable", {
      pluginAvailable,
      hasPurchaseMethod,
      platform:
        typeof Capacitor?.getPlatform === "function"
          ? Capacitor.getPlatform()
          : "unknown",
    });
    const unavailableError = "StoreKit is unavailable in this build. Please reinstall or update the app.";
    recordIapFailure({
      productId,
      message: unavailableError,
      raw: { pluginAvailable, hasPurchaseMethod },
    });
    return {
      success: false,
      error: unavailableError,
    };
  }

  try {
    iapLog("purchase start", { productId, platform: "ios" });
    const result = await StoreKitPurchase.purchase({ productId });
    if (result?.success) {
      iapLog("purchase completion", {
        productId,
        platform: "ios",
        transactionId: result?.transactionId,
      });
      return { success: true, transactionId: result?.transactionId };
    }
    if (result?.cancelled) {
      iapLog("purchase cancelled", { productId, platform: "ios" });
      return { success: false, cancelled: true, error: "Purchase cancelled" };
    }
    iapWarn("purchase failure", {
      productId,
      platform: "ios",
      errorCode: result?.errorCode,
      errorDomain: result?.errorDomain,
      errorMessage: result?.error,
    });
    recordIapFailure({
      productId,
      errorDomain: result?.errorDomain,
      errorCode: result?.errorCode,
      message: result?.error || result?.errorLocalizedDescription,
      raw: result,
    });
    return {
      success: false,
      errorCode: result?.errorCode,
      errorDomain: result?.errorDomain,
      error:
        result?.error ||
        "Purchase failed (unknown error). Please contact support with code IAP_UNKNOWN.",
    };
  } catch (error) {
    iapWarn("purchase exception", { productId, platform: "ios", error });
    recordIapFailure({
      productId,
      message: normalizeStoreKitError(error),
      raw: error,
    });
    return { success: false, error: normalizeStoreKitError(error) };
  }
}

export async function fetchStoreProducts() {
  const platform = detectPlatform();
  const productIds = SHOP_PRODUCTS.map((product) => product.id);
  iapLog("product fetch start", { platform, requestedProductIds: productIds });

  if (platform !== "ios") {
    const products = SHOP_PRODUCTS.map((product) => ({
      productId: product.id,
      price: product.priceLabel,
      localizedPrice: product.priceLabel,
    }));
    iapLog("product fetch response", {
      platform,
      validProducts: products,
      invalidProductIds: [],
    });
    return { success: true, products, invalidProductIds: [] };
  }

  const hasFetchProductsMethod =
    typeof StoreKitPurchase?.fetchProducts === "function";
  if (!hasFetchProductsMethod) {
    iapWarn("product fetch unavailable", {
      platform,
      reason: "StoreKitPurchase.fetchProducts not implemented",
    });
    const unavailableError = "Store unavailable, please try again.";
    recordIapFailure({
      productId: "fetchProducts",
      message: unavailableError,
      raw: { reason: "StoreKitPurchase.fetchProducts not implemented" },
    });
    return {
      success: false,
      error: unavailableError,
      products: [],
      invalidProductIds: productIds,
    };
  }

  try {
    const result = await StoreKitPurchase.fetchProducts({ productIds });
    const products = Array.isArray(result?.products) ? result.products : [];
    const invalidProductIds = Array.isArray(result?.invalidProductIds)
      ? result.invalidProductIds
      : [];
    iapLog("product fetch response", {
      platform,
      validProducts: products,
      invalidProductIds,
    });

    return {
      success: Boolean(result?.success),
      products,
      invalidProductIds,
      error: result?.error,
    };
  } catch (error) {
    iapWarn("product fetch exception", { platform, error });
    recordIapFailure({
      productId: "fetchProducts",
      message: "Store unavailable, please try again.",
      raw: error,
    });
    return {
      success: false,
      error: "Store unavailable, please try again.",
      products: [],
      invalidProductIds: productIds,
    };
  }
}

export async function purchaseProduct(productId) {
  const product = getProductDefinition(productId);
  if (!product) {
    iapWarn("purchase blocked unknown product", { productId });
    return { success: false, error: "Unknown product" };
  }

  const platform = detectPlatform();
  iapLog("purchase requested", { productId: product.id, platform });

  if (platform === "ios") {
    const nativeResult = await purchaseWithStoreKit(product.id);
    if (!nativeResult.success) {
      if (nativeResult.cancelled) {
        return { success: false, cancelled: true, error: nativeResult.error };
      }
      if (!DEV_MODE_ENABLED) {
        return {
          success: false,
          cancelled: nativeResult.cancelled,
          error: nativeResult.error,
        };
      }
      return await applyRewards(product, platform);
    }
    return await applyRewards(product, platform);
  }

  if (platform !== "web") {
    return { success: false, error: "Purchases coming soon" };
  }

  if (!DEV_MODE_ENABLED) {
    return { success: false, error: "Purchases unavailable" };
  }

  return await applyRewards(product, platform);
}
