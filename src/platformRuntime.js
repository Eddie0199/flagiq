import { Capacitor } from "@capacitor/core";

export function getRuntimePlatform() {
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
  } catch (error) {}

  return "web";
}

export function isNativeAppRuntime() {
  const platform = getRuntimePlatform();
  return platform === "ios" || platform === "android";
}

export function getPlatformShopMode() {
  return isNativeAppRuntime() ? "native_iap_enabled" : "web_iap_hidden";
}
