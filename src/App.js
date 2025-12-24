// App.js — FlagIQ v4.25.2 (per-user persistence + store screen)
import React, { useEffect, useRef, useState } from "react";
import FLAGS from "./flags";
import { LANGS, t } from "./i18n";

import Header from "./components/Header";
import HomeScreen from "./components/HomeScreen";
import LevelScreen from "./components/LevelScreen";
import GameScreen from "./components/GameScreen";
import AuthModal from "./components/AuthModal";
import SettingsModal from "./components/SettingsModal";
import { LockedModal, NoLivesModal } from "./components/Modals";
import StoreScreen from "./components/StoreScreen";
import ResetPasswordPage from "./components/ResetPasswordPage";

// 🔹 NEW: Supabase client import
import { supabase } from "./supabaseClient";
import {
  ensurePlayerState,
  getPlayerState,
  updatePlayerState,
} from "./playerStateApi";


const VERSION = "v1.1";

// ----- constants -----
export const TOTAL_LEVELS = 30;
export const STARS_PER_LEVEL_MAX = 3;
export const BATCH = 5;
export const UNLOCK_THRESHOLD = 0.8;
export const BLOCK_REQUIRE = { 5: 0, 10: 12, 15: 24, 20: 36, 25: 48, 30: 60 };

export const MAX_HEARTS = 5;
export const REGEN_MS = 10 * 60 * 1000;

// ----- helpers -----
export const shuffle = (arr) =>
  arr
    .map((v) => [Math.random(), v])
    .sort((a, b) => a[0] - b[0])
    .map((x) => x[1]);
export const pickN = (arr, n) => shuffle([...arr]).slice(0, n);
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

// flag helper (fix Northern Ireland + fallback map)
export const flagSrc = (flagOrCode, w = 256) => {
  const FALLBACK_MAP = {
    england: "gb-eng",
    scotland: "gb-sct",
    wles: "gb-wls",
    wales: "gb-wls",
    "northern ireland": "gb-nir",
    "isle of man": "im",
    greenland: "gl",
    "puerto rico": "pr",
    "hong kong": "hk",
    macau: "mo",
    "faroe islands": "fo",
    bermuda: "bm",
    curaçao: "cw",
    aruba: "aw",
    "cayman islands": "ky",
    guernsey: "gg",
    jersey: "je",
    gibraltar: "gi",
    "french polynesia": "pf",
    "new caledonia": "nc",
  };

  const CODE_FALLBACK = {
    nir: "gb-nir",
  };

  if (flagOrCode && typeof flagOrCode === "object") {
    if (flagOrCode.img) return flagOrCode.img;

    let code = (flagOrCode.code || "").toLowerCase();
    const name = (flagOrCode.name || "").toLowerCase();

    if (CODE_FALLBACK[code]) {
      code = CODE_FALLBACK[code];
    } else if (FALLBACK_MAP[name]) {
      code = FALLBACK_MAP[name];
    }

    return `https://flagcdn.com/w${w}/${code}.png`;
  }

  const raw = String(flagOrCode || "").toLowerCase();
  const mapped = FALLBACK_MAP[raw] || raw;
  return `https://flagcdn.com/w${w}/${mapped}.png`;
};

export const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const hashPwd = (str) => {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(16);
};
export const starsFromLives = (l) => clamp(l, 0, 3);
export const sumStars = (m) =>
  Object.values(m || {}).reduce((a, v) => a + (Number(v) || 0), 0);

export function computeUnlockedLevels(starsMap) {
  let unlocked = BATCH;
  while (unlocked < TOTAL_LEVELS) {
    const maxStarsPossible = unlocked * STARS_PER_LEVEL_MAX;
    const have = sumStars(starsMap);
    const ratio = maxStarsPossible > 0 ? have / maxStarsPossible : 0;
    if (ratio >= UNLOCK_THRESHOLD)
      unlocked = Math.min(unlocked + BATCH, TOTAL_LEVELS);
    else break;
  }
  return unlocked;
}

function normalizeStarsByMode(raw) {
  if (!raw) return {};

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  return raw;
}

function normalizeModeKey(rawMode) {
  const m = String(rawMode || "").toLowerCase();
  if (m === "timetrial" || m === "time trial") return "timetrial";
  return m || "classic";
}

function normalizeProgress(raw) {
  const base = {
    classic: { starsByLevel: {}, unlockedUntil: 5 },
    timetrial: { starsByLevel: {}, unlockedUntil: 5 },
  };

  if (!raw) return base;

  let parsed = raw;

  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return base;
    }
  }

  if (!parsed || typeof parsed !== "object") return base;

  Object.entries(parsed).forEach(([modeKey, value]) => {
    const normalisedMode = normalizeModeKey(modeKey);
    const target = base[normalisedMode];
    if (!target || !value || typeof value !== "object") return;

    if (value.starsByLevel && typeof value.starsByLevel === "object") {
      target.starsByLevel = { ...value.starsByLevel };
    }

    if (Number.isFinite(value.unlockedUntil)) {
      target.unlockedUntil = value.unlockedUntil;
    }
  });

  return base;
}

function mergeStarsMaps(a = {}, b = {}) {
  const out = {};
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  keys.forEach((k) => {
    const av = Number(a?.[k] || 0);
    const bv = Number(b?.[k] || 0);
    const best = Math.max(
      Number.isFinite(av) ? av : 0,
      Number.isFinite(bv) ? bv : 0
    );
    out[k] = best;
  });
  return out;
}

export function starsNeededForLevelId(levelId, starsMap) {
  const blockEnd = Math.min(Math.ceil(levelId / BATCH) * BATCH, TOTAL_LEVELS);
  const required = BLOCK_REQUIRE[blockEnd] ?? 0;
  const have = sumStars(starsMap);
  return {
    need: Math.max(0, required - have),
    blockStart: blockEnd - (BATCH - 1),
    blockEnd,
  };
}

export function lastCompletedLevel(starsMap) {
  let last = 0;
  for (let i = 1; i <= TOTAL_LEVELS; i++) if ((starsMap[i] || 0) > 0) last = i;
  return last || 1;
}

function targetDifficultyForLevel(i) {
  const t0 = (i - 1) / (TOTAL_LEVELS - 1);
  const eased = t0 * t0 * t0;
  return 1 + eased * 8.5;
}

// NEW: minimum difficulty floor per level
function minDiffForLevel(i) {
  // 1–5: anything
  if (i <= 5) return 1;
  // 6–10: no diff-1
  if (i <= 10) return 2;
  // 11–15
  if (i <= 15) return 3;
  // 16–20 (England & similar won't appear)
  if (i <= 20) return 4;
  // 21–25
  if (i <= 25) return 5;
  // 26–30: only pretty hard stuff
  return 6;
}

function capForLevel(i) {
  if (i <= 3) return 2.5;
  if (i <= 5) return 3.5;
  if (i <= 10) return 5.0;
  if (i <= 15) return 6.5;
  if (i <= 20) return 7.5;
  if (i <= 25) return 8.5;
  return 9.5;
}

export function buildLevels(flags) {
  const levels = [];
  const byDiff = [...flags].sort((a, b) => a.difficulty - b.difficulty);

  for (let i = 1; i <= TOTAL_LEVELS; i++) {
    const cap = capForLevel(i);
    const minDiff = minDiffForLevel(i);
    const target = targetDifficultyForLevel(i);

    // only flags within [minDiff, cap]
    let candidates = byDiff.filter(
      (f) =>
        typeof f.difficulty === "number" &&
        f.difficulty >= minDiff &&
        f.difficulty <= cap
    );

    // safety net – if for some reason too few candidates, fall back
    if (candidates.length < 40) candidates = byDiff;

    const nearest = [...candidates]
      .sort(
        (a, b) =>
          Math.abs(a.difficulty - target) - Math.abs(b.difficulty - target)
      )
      .slice(0, Math.min(120, candidates.length));

    let pool = pickN(nearest, Math.min(20, nearest.length));
    if (pool.length < 20) {
      const remain = candidates.filter(
        (f) => !pool.some((p) => p.code === f.code)
      );
      pool = [
        ...pool,
        ...pickN(remain, Math.min(20 - pool.length, remain.length)),
      ];
    }
    if (pool.length === 0) pool = pickN(byDiff, Math.min(20, byDiff.length));
    levels.push({ id: i, pool, questionCount: 10 });
  }
  return levels;
}

// ---- storage hooks ----
function useLocalStorage(key, init) {
  const [val, setVal] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : init;
    } catch (e) {
      return init;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {}

  }, [key, val]);
  return [val, setVal];
}

function useUserStorage(username, suffix, init) {
  const key = username ? `flagiq:u:${username}:${suffix}` : null;
  const [val, setVal] = useState(init);
  useEffect(() => {
    if (!key) return;
    try {
      const v = localStorage.getItem(key);
      setVal(v ? JSON.parse(v) : init);
    } catch (e) {
      setVal(init);
    }
  }, [username, suffix]);
  useEffect(() => {
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {}

  }, [key, val]);
  return [val, setVal];
}

// read per-mode stats for homepage directly from the per-mode starsBest maps
function getModeStatsFromLocal(username, mode) {
  if (!username) return { level: 0, stars: 0 };

  try {
    const raw = localStorage.getItem(`flagiq:u:${username}:${mode}:starsBest`);
    const starsMap =
      raw && raw !== "null" && raw !== "undefined" ? JSON.parse(raw) : {};

    const totalStars = sumStars(starsMap);
    if (totalStars === 0) {
      return { level: 0, stars: 0 };
    }

    const lastLevel = lastCompletedLevel(starsMap);
    return {
      level: lastLevel,
      stars: totalStars,
    };
  } catch (e) {
    return { level: 0, stars: 0 };
  }
}

// ----- per-user hints hook (with migration from old keys) -----
const DEFAULT_HINTS = { remove2: 3, autoPass: 1, pause: 2 };

const LEGACY_HINT_KEY_MAP = {
  "Remove Two": "remove2",
  InstantCorrect: "autoPass",
  "Extra Time": "pause",
};

function normalizeInventory(rawInventory) {
  const base = rawInventory && typeof rawInventory === "object" ? rawInventory : {};

  const legacyHints = {};
  const cleanedEntries = Object.entries(base).filter(([key, value]) => {
    if (LEGACY_HINT_KEY_MAP[key]) {
      if (Number.isFinite(value)) {
        legacyHints[LEGACY_HINT_KEY_MAP[key]] = value;
      }
      return false;
    }
    return true;
  });

  return {
    cleaned: Object.fromEntries(cleanedEntries),
    legacyHints,
  };
}

function loadHintsForUser(username) {
  try {
    if (username) {
      const userKey = `flagiq:u:${username}:hints`;
      const rawUser = localStorage.getItem(userKey);
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        if (parsed && typeof parsed === "object") {
          return {
            ...DEFAULT_HINTS,
            ...parsed,
          };
        }
      }

      // migrate from legacy keys on first run
      const legacyRaw =
        localStorage.getItem("flag_hints") || localStorage.getItem("hints");
      if (legacyRaw) {
        const legacyParsed = JSON.parse(legacyRaw);
        const merged = {
          ...DEFAULT_HINTS,
          ...(legacyParsed && typeof legacyParsed === "object"
            ? legacyParsed
            : {}),
        };
        localStorage.setItem(userKey, JSON.stringify(merged));
        return merged;
      }

      return DEFAULT_HINTS;
    }

    // no username: just fall back to legacy/global if present
    const legacyRaw =
      localStorage.getItem("flag_hints") || localStorage.getItem("hints");
    if (legacyRaw) {
      const legacyParsed = JSON.parse(legacyRaw);
      return {
        ...DEFAULT_HINTS,
        ...(legacyParsed && typeof legacyParsed === "object"
          ? legacyParsed
          : {}),
      };
    }
  } catch (e) {
    // ignore
  }
  return DEFAULT_HINTS;
}

function usePerUserHints(username) {
  const [hints, setHints] = useState(() => loadHintsForUser(username));

  // reload when user changes (login/switch)
  useEffect(() => {
    const next = loadHintsForUser(username);
    setHints(next);
  }, [username]);

  // persist whenever hints change
  useEffect(() => {
    if (!username) return;
    try {
      localStorage.setItem(`flagiq:u:${username}:hints`, JSON.stringify(hints));
    } catch (e) {
      // ignore
    }
  }, [username, hints]);

  return [hints, setHints];
}

// ================= Main App =================
function isResetPasswordRoute() {
  return window.location.pathname === "/reset-password";
}

export default function App() {
  // 🔐 Handle Supabase password reset redirect
  if (isResetPasswordRoute()) {
    return <ResetPasswordPage />;
  }

  // preferences
  const [lang, setLang] = useLocalStorage("flagiq:lang", "en");
  const [soundOn, setSoundOn] = useLocalStorage("flagiq:soundOn", true);
  const [volume, setVolume] = useLocalStorage("flagiq:volume", 0.5);

  const [screen, setScreen] = useLocalStorage("flagiq:screen", "home");
  const [mode, setMode] = useLocalStorage("flagiq:mode", "classic");

  const [users, setUsers] = useLocalStorage("flagiq:users", {});
  const [activeUser, setActiveUser] = useLocalStorage("flagiq:activeUser", "");
  const [activeUserLabel, setActiveUserLabel] = useLocalStorage(
    "flagiq:activeUserLabel",
    ""
  );
  const [lastCreds, setLastCreds] = useLocalStorage("flagiq:lastCreds", {});
  const loggedIn = !!activeUser;
  const [backendLoaded, setBackendLoaded] = useState(false);


  useEffect(() => {
    if (activeUser && !activeUserLabel) {
      setActiveUserLabel(activeUser);
    }
  }, [activeUser, activeUserLabel, setActiveUserLabel]);


  // remember where to go back to when leaving the store
  const [lastNonStoreScreen, setLastNonStoreScreen] = useState("home");

  // per-user data
  const [levelId, setLevelId] = useUserStorage(activeUser, `${mode}:level`, 1);
  const [starsByLevel, setStarsByLevel] = useUserStorage(
    activeUser,
    `${mode}:starsBest`,
    {}
  );

  useEffect(() => {
    if (!activeUser || !backendLoaded) return;

    const starsByMode = {
      classic: JSON.parse(
        localStorage.getItem(`flagiq:u:${activeUser}:classic:starsBest`) || "{}"
      ),
      timetrial: JSON.parse(
        localStorage.getItem(`flagiq:u:${activeUser}:timetrial:starsBest`) || "{}"
      ),
    };

    const progress = {
      classic: {
        starsByLevel: starsByMode.classic,
        unlockedUntil: computeUnlockedLevels(starsByMode.classic || {}),
      },
      timetrial: {
        starsByLevel: starsByMode.timetrial,
        unlockedUntil: computeUnlockedLevels(starsByMode.timetrial || {}),
      },
    };

    updatePlayerState(activeUser, {
      stars_by_mode: starsByMode,
      progress,
    });
  }, [starsByLevel, activeUser, backendLoaded, mode]);



  // 🔁 HINTS: now use dedicated per-user hook (with legacy migration)
  const [hints, setHints] = usePerUserHints(activeUser);

  // Backend inventory (includes hints). We keep a copy so we can merge
  // additional keys the backend might have without losing them when we
  // update hints.
  const [inventory, setInventory] = useState(null);

  // 🔑 COINS: single source of truth synced with localStorage
  const [coins, setCoins] = useState(0);

  useEffect(() => {
    if (!activeUser) {
      setCoins(0);
      setBackendLoaded(false);
      setInventory(null);
      return;
    }

    (async () => {
      try {
        await ensurePlayerState(activeUser);

        const state = await getPlayerState(activeUser);
        if (state) {
          setCoins(Number(state.coins) || 0);

          const { cleaned: backendInventory, legacyHints } = normalizeInventory(
            state.inventory || state.inventory_state || state.items || {}
          );

          setInventory(backendInventory);

          const backendHints =
            (backendInventory && backendInventory.hints) ||
            (backendInventory && backendInventory.boosters);
          if (backendHints && typeof backendHints === "object") {
            setHints((prev) => ({
              ...DEFAULT_HINTS,
              ...prev,
              ...backendHints,
              ...legacyHints,
            }));
          } else if (Object.keys(legacyHints).length > 0) {
            setHints((prev) => ({
              ...DEFAULT_HINTS,
              ...prev,
              ...legacyHints,
            }));
          }

          const persistStarsForMode = (modeKey, starsMap, mergeWithExisting) => {
            const normalisedMode = normalizeModeKey(modeKey);
            const existing = mergeWithExisting
              ? (() => {
                  try {
                    const raw = localStorage.getItem(
                      `flagiq:u:${activeUser}:${normalisedMode}:starsBest`
                    );
                    return raw ? JSON.parse(raw) : {};
                  } catch (e) {
                    return {};
                  }
                })()
              : {};

            const merged = mergeStarsMaps(existing, starsMap || {});

            localStorage.setItem(
              `flagiq:u:${activeUser}:${normalisedMode}:starsBest`,
              JSON.stringify(merged)
            );

            // immediately hydrate the current mode so progress shows up from backend
            if (normalisedMode === mode) {
              setStarsByLevel(merged);
            }
          };

          const progress = normalizeProgress(state.progress);
          Object.entries(progress).forEach(([modeKey, modeProgress]) => {
            persistStarsForMode(modeKey, modeProgress?.starsByLevel, false);
          });

          const starsByMode = normalizeStarsByMode(state.stars_by_mode);
          Object.entries(starsByMode).forEach(([modeKey, starsMap]) => {
            // merge stars_by_mode on top of progress so we keep the best values
            persistStarsForMode(modeKey, starsMap, true);
          });

          const backendLang =
            state.preferred_lang || state.lang || state.language || "";
          if (backendLang && backendLang !== lang) {
            setLang(backendLang);
          }

          const backendHearts =
            state.hearts || state.hearts_state || state.lives_state;
          if (
            backendHearts &&
            Number.isFinite(Number(backendHearts.count)) &&
            Number.isFinite(Number(backendHearts.lastTick))
          ) {
            setHeartsState({
              count: Number(backendHearts.count),
              lastTick: Number(backendHearts.lastTick),
            });
          }
        }

        setBackendLoaded(true);
      } catch (e) {
        // fallback to local only
        try {
          const raw = localStorage.getItem(`flagiq:u:${activeUser}:coins`);
          setCoins(raw ? Number(raw) : 0);
        } catch (e) {}

        // ✅ allow later sync back to backend
        setBackendLoaded(true);
      }
    })();
  }, [activeUser, lang, mode]);


  // helper to update coins AND persist to localStorage
  const applyCoinsUpdate = (valueOrUpdater) => {
    setCoins((prev) => {
      const next =
        typeof valueOrUpdater === "function"
          ? valueOrUpdater(prev)
          : valueOrUpdater;
      const safe = Number.isFinite(Number(next)) ? Number(next) : 0;
      if (activeUser) {
        try {
          localStorage.setItem(`flagiq:u:${activeUser}:coins`, String(safe));
        } catch (e) {}

      }
      return safe;
    });
  };

  useEffect(() => {
    if (!activeUser || !backendLoaded) return;

    updatePlayerState(activeUser, {
      coins,
    });
  }, [coins, activeUser, backendLoaded]);

  // Persist hints to backend inventory, keeping any other inventory keys intact
  useEffect(() => {
    if (!activeUser || !backendLoaded) return;

    setInventory((prev) => {
      const { cleaned } = normalizeInventory(prev);
      const next = { ...cleaned, hints };
      updatePlayerState(activeUser, { inventory: next });
      return next;
    });
  }, [hints, activeUser, backendLoaded]);

  useEffect(() => {
    if (!activeUser || !backendLoaded) return;

    updatePlayerState(activeUser, {
      preferred_lang: lang,
    });
  }, [lang, activeUser, backendLoaded]);


  // Hearts are stored locally for offline durability and synced to the backend
  // when a user is logged in.
  const [heartsState, setHeartsState] = useLocalStorage("flagiq:hearts", {
    count: MAX_HEARTS,
    lastTick: Date.now(),
  });
  const hearts = heartsState?.count ?? MAX_HEARTS;
  const lastTick = heartsState?.lastTick ?? Date.now();

  useEffect(() => {
    if (!activeUser || !backendLoaded) return;

    updatePlayerState(activeUser, {
      hearts: { count: hearts, lastTick },
    });
  }, [activeUser, backendLoaded, hearts, lastTick]);

  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState("login");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lockInfo, setLockInfo] = useState(null);
  const [noLivesOpen, setNoLivesOpen] = useState(false);

  const [levels] = useState(() => buildLevels(FLAGS));

  // regen loop
  useEffect(() => {
    if (!loggedIn) return;
    const id = setInterval(() => {
      setHeartsState((prev) => {
        if (!prev) return { count: MAX_HEARTS, lastTick: Date.now() };
        let { count, lastTick } = prev;
        if (count >= MAX_HEARTS) return prev;
        const now = Date.now();
        const grown = Math.floor((now - lastTick) / REGEN_MS);
        if (grown <= 0) return prev;
        count = Math.min(MAX_HEARTS, count + grown);
        lastTick = count >= MAX_HEARTS ? now : lastTick + grown * REGEN_MS;
        return { count, lastTick };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [loggedIn, setHeartsState]);

  // home guard
  useEffect(() => {
    if (!loggedIn && screen !== "home") setScreen("home");
  }, [loggedIn, screen, setScreen]);

  const goHome = () => setScreen("home");
  const goLevels = () => setScreen("levels");
  const goGame = () => setScreen("game");

  // ★ IMPORTANT: rely on LevelScreen for lock logic; just check hearts here
  function onLevelClick(id) {
    if (hearts <= 0) {
      setNoLivesOpen(true);
      return;
    }
    setLevelId(id);
    goGame();
  }

  function onRunLost() {
    setHeartsState((prev) => {
      const current = prev ?? { count: MAX_HEARTS, lastTick: Date.now() };
      const wasFull = current.count === MAX_HEARTS;
      const newCount = Math.max(0, current.count - 1);
      return {
        count: newCount,
        lastTick: wasFull ? Date.now() : current.lastTick,
      };
    });
  }

  const audioCtxRef = useRef(null);
  const ensureAudio = () => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtxRef.current = new Ctx();
    }
    return audioCtxRef.current;
  };
  const tone = (f, d, type = "sine", delay = 0) => {
    if (!soundOn) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.value = volume;
    o.connect(g).connect(ctx.destination);
    const t0 = ctx.currentTime + delay;
    o.start(t0);
    o.stop(t0 + d);
  };
  const soundCorrect = () => {
    tone(523.25, 0.12, "triangle", 0.0);
    tone(659.25, 0.12, "triangle", 0.12);
    tone(783.99, 0.18, "triangle", 0.24);
  };
  const soundWrong = () => {
    tone(200, 0.1, "sawtooth");
  };

  const openAuth = () => {
    setAuthTab("login");
    setAuthOpen(true);
  };
  const closeAuth = () => setAuthOpen(false);

  // NEW: per-mode stats for homepage cards, based ONLY on per-mode starsBest maps
  const classicStats = getModeStatsFromLocal(activeUser, "classic");
  const timetrialStats = getModeStatsFromLocal(activeUser, "timetrial");

  const handleHomeStart = (nextMode) => {
    if (!loggedIn) {
      openAuth();
      return;
    }
    setMode(nextMode || "classic");
    setScreen("levels");
  };

  // navigation helper for opening the store from header
  const openStoreFromScreen = () => {
    setLastNonStoreScreen(screen || "levels");
    setScreen("shop");
  };

  // Buy a single extra heart using coins (prototype only)
  const handleBuyHeartWithCoins = () => {
    const HEART_COST = 50;
    if (hearts >= MAX_HEARTS) return;
    if (coins < HEART_COST) return;

    // deduct coins
    applyCoinsUpdate((prev) => {
      const next = Math.max(0, (Number(prev) || 0) - HEART_COST);
      return next;
    });

    // add +1 heart, capped at max
    setHeartsState((prev) => {
      const current = prev ?? { count: MAX_HEARTS, lastTick: Date.now() };
      const currentCount =
        typeof current.count === "number" ? current.count : MAX_HEARTS;
      return {
        ...current,
        count: Math.min(MAX_HEARTS, currentCount + 1),
      };
    });
  };

  // Refill hearts to max via paid option (no coin impact in prototype)
  const handleRefillHeartsWithMoney = () => {
    if (hearts >= MAX_HEARTS) return;
    setHeartsState({
      count: MAX_HEARTS,
      lastTick: Date.now(),
    });
  };

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* version badge */}
      <div
        style={{
          position: "fixed",
          top: 6,
          left: 8,
          zIndex: 3,
          fontSize: 11,
          color: "#64748b",
          background: "rgba(255,255,255,.8)",
          padding: "2px 6px",
          borderRadius: 8,
          border: "1px solid #e5e7eb",
        }}
      >
        {VERSION}
      </div>

      {/* HOME */}
      {screen === "home" && (
        <HomeScreen
          username={activeUser}
          onSettings={() => setSettingsOpen(true)}
          onStart={handleHomeStart}
          classicStats={classicStats}
          timetrialStats={timetrialStats}
          t={t}
          lang={lang}
          setHints={setHints}
        />
      )}

      {/* LEVELS */}
      {loggedIn && screen === "levels" && (
        <>
          <Header
            showBack
            onBack={goHome}
            hearts={{ count: hearts, lastTick }}
            username={activeUser}
            onSettings={() => setSettingsOpen(true)}
            showHearts
            t={t}
            lang={lang}
            coins={coins}
            onCoinsClick={openStoreFromScreen}
          />
          <LevelScreen
            t={t}
            lang={lang}
            onLevelClick={onLevelClick}
            onLockedAttempt={(info) => setLockInfo(info)}
            username={activeUser}
            mode={mode}
          />
        </>
      )}

      {/* GAME */}
      {loggedIn && screen === "game" && (
        <>
          <Header
            showBack
            onBack={goLevels}
            hearts={{ count: hearts, lastTick }}
            username={activeUser}
            onSettings={() => setSettingsOpen(true)}
            showHearts
            t={t}
            lang={lang}
            coins={coins}
            onCoinsClick={openStoreFromScreen}
          />
          <GameScreen
            t={t}
            lang={lang}
            FLAGS={FLAGS}
            mode={mode}
            levelId={levelId}
            levels={levels}
            currentStars={Number(starsByLevel[levelId]) || 0}
            setStarsByLevel={setStarsByLevel}
            onRunLost={onRunLost}
            soundCorrect={soundCorrect}
            soundWrong={soundWrong}
            onBack={() => setScreen("levels")}
            onNextLevel={() => {
              const next = levelId + 1;
              const unlocked = computeUnlockedLevels(starsByLevel || {});
              if (next <= unlocked) {
                setLevelId(next);
                setScreen("game");
              } else {
                setScreen("levels");
              }
            }}
            starsFromLives={starsFromLives}
            hints={hints}
            setHints={setHints}
            activeUser={activeUser}
            username={activeUser}
            // GameScreen sends coin *delta* (e.g. +100), not absolute total
            onCoinsChange={(delta) =>
              applyCoinsUpdate((prev) => {
                const d = Number(delta) || 0;
                const next = Math.max(0, prev + d);
                return next;
              })
            }
          />
        </>
      )}

      {/* SHOP / STORE */}
      {loggedIn && screen === "shop" && (
        <>
          {/* Header still shows hearts & coins but coins are DISPLAY only here */}
          <Header
            showBack
            onBack={() => setScreen(lastNonStoreScreen || "levels")}
            hearts={{ count: hearts, lastTick }}
            username={activeUser}
            onSettings={() => setSettingsOpen(true)}
            showHearts
            t={t}
            lang={lang}
            coins={coins}
          />
          <StoreScreen
            t={t}
            lang={lang}
            coins={coins}
            hints={hints}
            setHints={setHints}
            // Store passes an *absolute* new total
            onUpdateCoins={(next) => applyCoinsUpdate(next)}
            onBack={() => setScreen(lastNonStoreScreen || "levels")}
            hearts={hearts}
            maxHearts={MAX_HEARTS}
            onBuyHeartWithCoins={handleBuyHeartWithCoins}
            onRefillHeartsWithMoney={handleRefillHeartsWithMoney}
          />
        </>
      )}

      {/* Settings */}
      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          soundOn={soundOn}
          setSoundOn={setSoundOn}
          volume={volume}
          setVolume={setVolume}
          lang={lang}
          setLang={setLang}
          activeUser={activeUser}
          setActiveUser={(u) => {
            setActiveUser(u);
            if (!u) {
              setActiveUserLabel("");
              setScreen("home");
            }
          }}
          setActiveUserLabel={setActiveUserLabel}
          setScreen={setScreen}
          LANGS={LANGS}
          t={t}
        />
      )}

      {/* modals */}
      {lockInfo && (
        <LockedModal
          lang={lang}
          info={lockInfo}
          onClose={() => setLockInfo(null)}
        />
      )}
      {noLivesOpen && (
        <NoLivesModal
          lastTick={lastTick}
          onClose={() => setNoLivesOpen(false)}
        />
      )}

      {/* Auth */}
      {!loggedIn && authOpen && (
        <AuthModal
          lang={lang}
          t={t}
          onClose={closeAuth}
          tab={authTab}
          setTab={setAuthTab}
          users={users}
          setUsers={setUsers}
          onLoggedIn={(u) => {
            if (u && typeof u === "object") {
              setActiveUser(u.id || "");
              setActiveUserLabel(u.label || u.id || "");
            } else {
              setActiveUser(u);
              setActiveUserLabel(u);
            }
            setScreen("home");
          }}
        />
      )}

      {!screen && (
        <div style={{ color: "white", textAlign: "center", marginTop: 100 }}>
          ⚠️ App loaded but no screen selected (state: {String(screen)})
        </div>
      )}
    </div>
  );
}

