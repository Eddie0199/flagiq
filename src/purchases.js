// src/purchases.js
// Centralised purchase entrypoint (web mock + native stub)

import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabaseClient";
import { getProductDefinition } from "./shopProducts";

let rewardHandler = null;

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

export async function purchaseProduct(productId) {
  const product = getProductDefinition(productId);
  if (!product) {
    return { success: false, error: "Unknown product" };
  }

  const platform = detectPlatform();

  if (platform !== "web") {
    return { success: false, error: "Purchases coming soon" };
  }

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
