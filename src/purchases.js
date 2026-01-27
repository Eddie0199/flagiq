// src/purchases.js
// Centralised purchase entrypoint (web mock + native stub)

import { Capacitor, registerPlugin } from "@capacitor/core";
import { supabase } from "./supabaseClient";
import { getProductDefinition } from "./shopProducts";

let rewardHandler = null;
const DEV_MODE_ENABLED = process.env.NODE_ENV !== "production";
const StoreKitPurchase = registerPlugin("StoreKitPurchase");

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
    return { success: false, error: "Purchase system not ready" };
  }

  const rewardResult = await rewardHandler(product);
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

async function purchaseWithStoreKit(productId) {
  const hasPurchaseMethod = typeof StoreKitPurchase?.purchase === "function";
  const pluginAvailable =
    typeof Capacitor?.isPluginAvailable === "function"
      ? Capacitor.isPluginAvailable("StoreKitPurchase")
      : undefined;
  if (!hasPurchaseMethod) {
    console.warn("StoreKit plugin unavailable", {
      pluginAvailable,
      hasPurchaseMethod,
      platform:
        typeof Capacitor?.getPlatform === "function"
          ? Capacitor.getPlatform()
          : "unknown",
    });
    return {
      success: false,
      error:
        "StoreKit is unavailable in this build. Please reinstall or update the app.",
    };
  }

  try {
    const result = await StoreKitPurchase.purchase({ productId });
    if (result?.success) {
      return { success: true, transactionId: result?.transactionId };
    }
    if (result?.cancelled) {
      return { success: false, cancelled: true, error: "Purchase cancelled" };
    }
    return {
      success: false,
      error:
        result?.error ||
        "Purchase failed (unknown error). Please contact support with code IAP_UNKNOWN.",
    };
  } catch (error) {
    return { success: false, error: normalizeStoreKitError(error) };
  }
}

export async function purchaseProduct(productId) {
  const product = getProductDefinition(productId);
  if (!product) {
    return { success: false, error: "Unknown product" };
  }

  const platform = detectPlatform();

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
