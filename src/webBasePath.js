import { Capacitor } from "@capacitor/core";

const WEB_APP_BASE_PATH = "/flagiq";
const WEB_APP_HOSTS = new Set([
  "games.wildmoustachegames.com",
]);

function normalizePath(path) {
  if (!path) return "/";
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  return withSlash.replace(/\/+$/, "") || "/";
}

export function getWebAppBasePath() {
  if (typeof window === "undefined") return "";
  if (Capacitor.isNativePlatform()) return "";
  if (!WEB_APP_HOSTS.has(window.location.hostname)) return "";
  return WEB_APP_BASE_PATH;
}

export function withWebBasePath(path) {
  const normalized = normalizePath(path);
  const base = getWebAppBasePath();
  if (!base) return normalized;
  if (normalized === "/") return base;
  return `${base}${normalized}`;
}

export function getPathWithoutWebBase(pathname) {
  const normalized = normalizePath(pathname || "/");
  const base = getWebAppBasePath();
  if (!base) return normalized;
  if (normalized === base) return "/";
  if (normalized.startsWith(`${base}/`)) return normalized.slice(base.length);
  return normalized;
}

export function getPublicAssetUrl(path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${process.env.PUBLIC_URL || ""}${normalized}`;
}
