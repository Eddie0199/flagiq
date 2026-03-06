import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./styles.css";

const APP_BUILD_MARKER =
  process.env.REACT_APP_BUILD_MARKER ||
  process.env.REACT_APP_VERCEL_GIT_COMMIT_SHA ||
  process.env.REACT_APP_COMMIT_SHA ||
  "dev";
const SW_CACHE_VERSION = `flagiq-runtime-${APP_BUILD_MARKER}`;

const promptForRefresh = (registration) => {
  const shouldRefresh = window.confirm(
    "A new version of FlagIQ is available. Refresh now to update?"
  );
  if (shouldRefresh) {
    registration.waiting?.postMessage({ type: "SKIP_WAITING" });
  }
};

const logStartupDiagnostics = () => {
  const activeSw = Boolean(navigator.serviceWorker?.controller);
  console.info("[FlagIQ] Startup diagnostics", {
    hostname: window.location.hostname,
    buildMarker: APP_BUILD_MARKER,
    serviceWorkerActive: activeSw,
    serviceWorkerCacheVersion: SW_CACHE_VERSION,
  });
};

const rootElement = document.getElementById("root");
const root = createRoot(rootElement);

root.render(
  <StrictMode>
    <ErrorBoundary
      onError={(error, info) => {
        if (typeof window === "undefined") return;
        if (window.__FLIQ_DEBUG_CAPTURE) {
          window.__FLIQ_DEBUG_CAPTURE(error, {
            source: "ErrorBoundary",
            stack: info?.componentStack,
          });
        }
      }}
    >
      <App />
    </ErrorBoundary>
  </StrictMode>
);

// Register the service worker from /public
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    logStartupDiagnostics();

    const swPath = process.env.PUBLIC_URL
      ? `${process.env.PUBLIC_URL}/service-worker.js?v=${encodeURIComponent(
          APP_BUILD_MARKER
        )}`
      : `/service-worker.js?v=${encodeURIComponent(APP_BUILD_MARKER)}`;

    let isRefreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (isRefreshing) return;
      isRefreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register(swPath)
      .then((reg) => {
        console.log("Service worker registered:", reg.scope);

        if (reg.waiting) {
          promptForRefresh(reg);
        }

        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              promptForRefresh(reg);
            }
          });
        });
      })
      .catch((err) => {
        console.log("Service worker registration failed:", err);
      });
  });
}
