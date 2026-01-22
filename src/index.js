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

// Register the service worker from /public
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const swPath = process.env.PUBLIC_URL
      ? `${process.env.PUBLIC_URL}/service-worker.js`
      : "/service-worker.js";
    navigator.serviceWorker
      .register(swPath)
      .then((reg) => {
        console.log("Service worker registered:", reg.scope);
      })
      .catch((err) => {
        console.log("Service worker registration failed:", err);
      });
  });
}
