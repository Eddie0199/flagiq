import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./styles.css";

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

// Register the service worker from /public with aggressive update checks.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    const swPath = process.env.PUBLIC_URL
      ? `${process.env.PUBLIC_URL}/service-worker.js`
      : "/service-worker.js";

    let hasRefreshedForServiceWorker = false;

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hasRefreshedForServiceWorker) return;
      hasRefreshedForServiceWorker = true;
      window.location.reload();
    });

    try {
      const reg = await navigator.serviceWorker.register(swPath, {
        updateViaCache: "none",
      });
      console.log("Service worker registered:", reg.scope);

      if (reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }

      reg.addEventListener("updatefound", () => {
        const nextWorker = reg.installing;
        if (!nextWorker) return;
        nextWorker.addEventListener("statechange", () => {
          if (
            nextWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            nextWorker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });

      setInterval(() => {
        reg.update().catch(() => {});
      }, 60 * 1000);
    } catch (err) {
      console.log("Service worker registration failed:", err);
    }
  });
}
