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

// Safety-first production behavior: disable SW registration and aggressively
// unregister any previously installed workers/caches to avoid stale bundles.
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister()))
      )
      .catch(() => null);

    if (window.caches?.keys) {
      window.caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith("flagiq-"))
              .map((key) => window.caches.delete(key))
          )
        )
        .catch(() => null);
    }
  });
}
