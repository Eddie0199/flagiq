// components/Modals.js
import React, { useEffect, useState } from "react";
import { REGEN_MS } from "../App";

function formatRemaining(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

export function LockedModal({ info, onClose, lang }) {
  const { need, blockStart, blockEnd } = info || {};
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 60,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,.25)",
          padding: 18,
        }}
      >
        <div style={{ fontSize: 16, color: "#0f172a" }}>
          You need <b>{need}</b> more ★ to unlock levels {blockStart}–{blockEnd}
          .
        </div>
        <div style={{ marginTop: 14, textAlign: "right" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              background: "#fff",
              fontWeight: 600,
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

export function NoLivesModal({ onClose, lastTick }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const nextMs = Math.max(0, REGEN_MS - (now - lastTick));
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 70,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,.25)",
          padding: 18,
          textAlign: "center",
        }}
      >
        <h3 style={{ marginTop: 0 }}>No lives left</h3>
        <p style={{ margin: "8px 0" }}>
          New life in <b>{formatRemaining(nextMs)}</b>.
        </p>
        <p style={{ margin: "8px 0", color: "#64748b" }}>
          Lives refill over time (max 5).
        </p>
        <div style={{ marginTop: 12 }}>
          <button
            onClick={onClose}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              background: "#fff",
              fontWeight: 700,
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
