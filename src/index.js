import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const rootElement = document.getElementById("root");
const root = createRoot(rootElement);

root.render(
  <StrictMode>
    <App />
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
