// App.js — FlagIQ v4.25.2 (per-user persistence + store screen)
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import FLAGS from "./flags";
import { LANGS, t } from "./i18n";

import Header from "./components/Header";
import HomeScreen from "./components/HomeScreen";
import LevelScreen from "./components/LevelScreen";
import GameScreen from "./components/GameScreen";
import LocalPackLevelsScreen from "./components/LocalPackLevelsScreen";
import LocalPacksGrid from "./components/LocalPacksGrid";
import AuthModal from "./components/AuthModal";
import SettingsModal from "./components/SettingsModal";
import { LockedModal, NoLivesModal } from "./components/Modals";
import StoreScreen from "./components/StoreScreen";
import ResetPasswordPage from "./components/ResetPasswordPage";
import { registerPurchaseRewardHandler } from "./purchases";
import {
  LOCAL_PACKS,
  buildLocalPackLevels,
  getLocalLevelStars,
} from "./localPacks";

// 🔹 NEW: Supabase client import
import { supabase } from "./supabaseClient";
import {
  ensurePlayerState,
  getPlayerState,
  updatePlayerState,
} from "./playerStateApi";


const VERSION = "v1.1";

const LANGUAGE_STORAGE_KEY = "flagLang";
const LEGACY_LANGUAGE_KEYS = ["flagiq:lang"];
const SUPPORTED_LANGUAGE_CODES = new Set(LANGS.map((l) => l.code));

function normalizeLanguageCode(code) {
  const raw = String(code || "").toLowerCase();
  return SUPPORTED_LANGUAGE_CODES.has(raw) ? raw : "en";
}

function persistLanguageToStorage(langCode) {
  const normalized = normalizeLanguageCode(langCode);
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
    LEGACY_LANGUAGE_KEYS.forEach((legacyKey) => {
      localStorage.removeItem(legacyKey);
    });
  } catch (e) {}
  return normalized;
}

function readLanguageFromStorage() {
  const keys = [LANGUAGE_STORAGE_KEY, ...LEGACY_LANGUAGE_KEYS];
  for (const key of keys) {
    try {
      const value = localStorage.getItem(key);
      if (value) {
        return persistLanguageToStorage(value);
      }
    } catch (e) {}
  }
  return "en";
}

// ----- constants -----
export const TOTAL_LEVELS = 30;
export const STARS_PER_LEVEL_MAX = 3;
export const BATCH = 5;
export const UNLOCK_THRESHOLD = 0.8;
export const BLOCK_REQUIRE = { 5: 0, 10: 12, 15: 24, 20: 36, 25: 48, 30: 60 };

export const MAX_HEARTS = 5;
export const REGEN_MS = 10 * 60 * 1000;
export const DEFAULT_HEARTS_STATE = {
  current: MAX_HEARTS,
  max: MAX_HEARTS,
  lastRegenAt: null,
};
const DAILY_SPIN_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// ----- helpers -----
export const shuffle = (arr) =>
  arr
    .map((v) => [Math.random(), v])
    .sort((a, b) => a[0] - b[0])
    .map((x) => x[1]);
export const pickN = (arr, n) => shuffle([...arr]).slice(0, n);
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const remainingDailySpinMs = (lastClaimedAt) => {
  if (!lastClaimedAt) return 0;
  const parsed = Date.parse(lastClaimedAt);
  if (!Number.isFinite(parsed)) return 0;
  const elapsed = Date.now() - parsed;
  if (elapsed < 0) return DAILY_SPIN_COOLDOWN_MS;
  return Math.max(DAILY_SPIN_COOLDOWN_MS - elapsed, 0);
};

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

function normalizeModeKey(rawMode) {
  const m = String(rawMode || "").toLowerCase();
  if (m === "timetrial" || m === "time trial") return "timetrial";
  if (m === "localflags" || m === "local flags" || m === "local") {
    return "localFlags";
  }
  return m || "classic";
}

function normalizeProgress(raw) {
  const base = {
    classic: { starsByLevel: {}, unlockedUntil: 5 },
    timetrial: { starsByLevel: {}, unlockedUntil: 5 },
    localFlags: { packs: {} },
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

    if (normalisedMode === "localFlags") {
      if (value.packs && typeof value.packs === "object") {
        target.packs = { ...value.packs };
      }
      return;
    }

    if (value.starsByLevel && typeof value.starsByLevel === "object") {
      target.starsByLevel = { ...value.starsByLevel };
    }

    if (Number.isFinite(value.unlockedUntil)) {
      target.unlockedUntil = value.unlockedUntil;
    }
  });

  return base;
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

function normalizeHeartsState(raw) {
  const base = raw && typeof raw === "object" ? raw : {};

  const maxRaw =
    base.max ?? base.hearts_max ?? base.maxHearts ?? base.countMax ?? MAX_HEARTS;
  const max = Number.isFinite(Number(maxRaw)) && Number(maxRaw) > 0
    ? Number(maxRaw)
    : MAX_HEARTS;

  const currentRaw =
    base.current ?? base.hearts_current ?? base.count ?? base.hearts ?? max;
  const current = clamp(
    Number.isFinite(Number(currentRaw)) ? Number(currentRaw) : max,
    0,
    max
  );

  let last = base.lastRegenAt ?? base.hearts_last_regen_at ?? base.lastTick;
  if (last === undefined) last = null;
  let lastRegenAt = null;
  if (last !== null) {
    const numeric = Number(last);
    if (Number.isFinite(numeric)) {
      lastRegenAt = numeric;
    } else {
      const parsed = Date.parse(last);
      lastRegenAt = Number.isFinite(parsed) ? parsed : null;
    }
  }

  return { current, max, lastRegenAt };
}

function getHeartsStorageKey(username) {
  return username ? `flagiq:u:${username}:hearts` : null;
}

const REVIEW_PROMPT_DEFAULT = {
  lastReviewMilestonePrompted: 0,
  lastReviewPromptAt: 0,
  sessionsSinceLastPrompt: 0,
  totalReviewPromptAttempts: 0,
};

function normalizeReviewPromptState(raw) {
  if (!raw) return { ...REVIEW_PROMPT_DEFAULT };
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return { ...REVIEW_PROMPT_DEFAULT };
    }
  }
  if (!parsed || typeof parsed !== "object") {
    return { ...REVIEW_PROMPT_DEFAULT };
  }
  return {
    lastReviewMilestonePrompted: Number(parsed.lastReviewMilestonePrompted) || 0,
    lastReviewPromptAt: Number(parsed.lastReviewPromptAt) || 0,
    sessionsSinceLastPrompt: Number(parsed.sessionsSinceLastPrompt) || 0,
    totalReviewPromptAttempts: Number(parsed.totalReviewPromptAttempts) || 0,
  };
}

function mergeReviewPromptState(base, next) {
  return {
    lastReviewMilestonePrompted: Math.max(
      base.lastReviewMilestonePrompted || 0,
      next.lastReviewMilestonePrompted || 0
    ),
    lastReviewPromptAt: Math.max(
      base.lastReviewPromptAt || 0,
      next.lastReviewPromptAt || 0
    ),
    sessionsSinceLastPrompt: Math.max(
      base.sessionsSinceLastPrompt || 0,
      next.sessionsSinceLastPrompt || 0
    ),
    totalReviewPromptAttempts: Math.max(
      base.totalReviewPromptAttempts || 0,
      next.totalReviewPromptAttempts || 0
    ),
  };
}

function getReviewPromptStorageKey(username) {
  return username ? `flagiq:u:${username}:reviewPrompt` : null;
}

async function readCapacitorStorage(key) {
  if (!key || !Capacitor?.Plugins) return null;
  const plugin = Capacitor.Plugins.Preferences || Capacitor.Plugins.Storage;
  if (!plugin?.get) return null;
  try {
    const result = await plugin.get({ key });
    if (!result?.value) return null;
    return normalizeReviewPromptState(result.value);
  } catch (e) {
    return null;
  }
}

async function writeCapacitorStorage(key, value) {
  if (!key || !Capacitor?.Plugins) return;
  const plugin = Capacitor.Plugins.Preferences || Capacitor.Plugins.Storage;
  if (!plugin?.set) return;
  try {
    await plugin.set({ key, value: JSON.stringify(value) });
  } catch (e) {}
}

function useReviewPromptState(username) {
  const key = getReviewPromptStorageKey(username);
  const [state, setState] = useState(() => {
    if (!key) return { ...REVIEW_PROMPT_DEFAULT };
    try {
      const raw = localStorage.getItem(key);
      return normalizeReviewPromptState(raw);
    } catch (e) {
      return { ...REVIEW_PROMPT_DEFAULT };
    }
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!key) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const fromCapacitor = await readCapacitorStorage(key);
      if (!cancelled && fromCapacitor) {
        setState((prev) => mergeReviewPromptState(prev, fromCapacitor));
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(() => {
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {}
    writeCapacitorStorage(key, state);
  }, [key, state]);

  return { state, setState, loaded };
}

function countUniqueCompletedLevels(progress) {
  const base = normalizeProgress(progress);
  const completed = new Set();
  Object.values(base).forEach((modeProgress) => {
    const starsByLevel = modeProgress?.starsByLevel || {};
    Object.entries(starsByLevel).forEach(([levelKey, stars]) => {
      if (Number(stars) > 0) {
        const parsed = Number(levelKey);
        if (Number.isFinite(parsed)) {
          completed.add(parsed);
        }
      }
    });
  });
  return completed.size;
}

async function requestInAppReview() {
  if (!Capacitor?.Plugins) return false;
  const plugin = Capacitor.Plugins.InAppReview || Capacitor.Plugins.AppReview;
  if (!plugin?.requestReview) return false;
  try {
    await plugin.requestReview();
    return true;
  } catch (e) {
    return false;
  }
}

export function applyHeartsRegen(state, now = Date.now()) {
  const base = normalizeHeartsState(state);
  const ts = Number.isFinite(Number(now)) ? Number(now) : Date.now();

  if (base.current >= base.max) {
    return { ...base, lastRegenAt: null, nextRefreshAt: null, added: 0 };
  }

  if (base.lastRegenAt === null) {
    return { ...base, nextRefreshAt: null, added: 0 };
  }

  const elapsedMs = Math.max(0, ts - base.lastRegenAt);
  const elapsedMins = Math.floor(elapsedMs / 60000);
  const add = Math.floor(elapsedMins / 10);

  if (add <= 0) {
    const remainder = REGEN_MS - (elapsedMs % REGEN_MS || 0) || REGEN_MS;
    return {
      ...base,
      nextRefreshAt: ts + remainder,
      added: 0,
    };
  }

  const newCurrent = Math.min(base.max, base.current + add);
  const filled = newCurrent >= base.max;
  const nextLast = filled ? null : base.lastRegenAt + add * REGEN_MS;
  const nextRefreshAt = filled ? null : nextLast + REGEN_MS;

  return {
    current: newCurrent,
    max: base.max,
    lastRegenAt: nextLast,
    nextRefreshAt,
    added: newCurrent - base.current,
  };
}

function loadHeartsForUser(username) {
  const key = getHeartsStorageKey(username);
  if (!key) return DEFAULT_HEARTS_STATE;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return DEFAULT_HEARTS_STATE;
    const parsed = JSON.parse(raw);
    return normalizeHeartsState(parsed);
  } catch (e) {
    return DEFAULT_HEARTS_STATE;
  }
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

function deriveModeStatsFromProgress(progress, mode) {
  const starsMap = progress?.[mode]?.starsByLevel || {};
  const totalStars = sumStars(starsMap);
  if (totalStars === 0) {
    return { level: 0, stars: 0 };
  }
  return {
    level: lastCompletedLevel(starsMap),
    stars: totalStars,
  };
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
  const [lang, setLang] = useState(() => readLanguageFromStorage());
  const [backendPreferredLanguage, setBackendPreferredLanguage] = useState(null);
  const [pendingPreferredLanguagePush, setPendingPreferredLanguagePush] =
    useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine !== false
  );
  const [soundOn, setSoundOn] = useLocalStorage("flagiq:soundOn", true);
  const [volume, setVolume] = useLocalStorage("flagiq:volume", 0.5);

  const [screen, setScreen] = useLocalStorage("flagiq:screen", "home");
  const [mode, setMode] = useLocalStorage("flagiq:mode", "classic");
  const defaultLocalPackId = LOCAL_PACKS[0]?.packId || "";

  // Always reset scroll so headers stay visible when switching screens (mobile fix)
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo(0, 0);
  }, [screen]);

  const [users, setUsers] = useLocalStorage("flagiq:users", {});
  const [activeUser, setActiveUser] = useLocalStorage("flagiq:activeUser", "");
  const [activeUserLabel, setActiveUserLabel] = useLocalStorage(
    "flagiq:activeUserLabel",
    ""
  );
  const [lastCreds, setLastCreds] = useLocalStorage("flagiq:lastCreds", {});
  const loggedIn = !!activeUser;
  const [backendLoaded, setBackendLoaded] = useState(false);

  const handleLanguageChange = useCallback(
    (next) => {
      const normalized = normalizeLanguageCode(next);
      setLang(normalized);
      if (activeUser) {
        setPendingPreferredLanguagePush(true);
      }
    },
    [activeUser]
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    persistLanguageToStorage(lang);
  }, [lang]);


  useEffect(() => {
    if (activeUser && !activeUserLabel) {
      setActiveUserLabel(activeUser);
    }
  }, [activeUser, activeUserLabel, setActiveUserLabel]);


  // remember where to go back to when leaving the store
  const [lastNonStoreScreen, setLastNonStoreScreen] = useState("home");

  // per-user data
  const [levelId, setLevelId] = useUserStorage(activeUser, `${mode}:level`, 1);
  const [activeLocalPackId, setActiveLocalPackId] = useUserStorage(
    activeUser,
    "localFlags:pack",
    defaultLocalPackId
  );
  const [progress, setProgress] = useState(() => normalizeProgress());
  const progressStorageKey = activeUser
    ? `flagiq:progress:${activeUser}`
    : null;
  const {
    state: reviewPromptState,
    setState: setReviewPromptState,
    loaded: reviewPromptLoaded,
  } = useReviewPromptState(activeUser);
  const reviewSessionIncrementedRef = useRef(false);

  useEffect(() => {
    if (!activeUser) {
      setProgress(normalizeProgress());
      return;
    }
    try {
      const raw = localStorage.getItem(progressStorageKey);
      setProgress(normalizeProgress(raw));
    } catch (e) {
      setProgress(normalizeProgress());
    }
  }, [activeUser, progressStorageKey]);

  useEffect(() => {
    if (!progressStorageKey) return;
    try {
      localStorage.setItem(progressStorageKey, JSON.stringify(progress));
    } catch (e) {}
  }, [progress, progressStorageKey]);

  useEffect(() => {
    reviewSessionIncrementedRef.current = false;
  }, [activeUser]);

  useEffect(() => {
    if (!activeUser || !reviewPromptLoaded) return;
    if (reviewSessionIncrementedRef.current) return;
    setReviewPromptState((prev) => ({
      ...prev,
      sessionsSinceLastPrompt: (prev.sessionsSinceLastPrompt || 0) + 1,
    }));
    reviewSessionIncrementedRef.current = true;
  }, [activeUser, reviewPromptLoaded, setReviewPromptState]);

  const maybePromptForReview = useCallback(
    (nextProgress) => {
      if (!activeUser || !reviewPromptLoaded) return;
      const uniqueCompleted = countUniqueCompletedLevels(nextProgress);
      const milestone = Math.floor(uniqueCompleted / 5) * 5;
      const eligible =
        milestone >= 5 &&
        milestone > (reviewPromptState.lastReviewMilestonePrompted || 0);
      if (!eligible) return;
      if ((reviewPromptState.totalReviewPromptAttempts || 0) >= 3) return;
      const lastPromptAt = reviewPromptState.lastReviewPromptAt || 0;
      const daysSincePrompt =
        lastPromptAt > 0
          ? (Date.now() - lastPromptAt) / (1000 * 60 * 60 * 24)
          : Infinity;
      if (daysSincePrompt < 7) return;
      if ((reviewPromptState.sessionsSinceLastPrompt || 0) < 3) return;

      (async () => {
        await requestInAppReview();
        setReviewPromptState((prev) => ({
          ...prev,
          lastReviewMilestonePrompted: milestone,
          lastReviewPromptAt: Date.now(),
          sessionsSinceLastPrompt: 0,
          totalReviewPromptAttempts: (prev.totalReviewPromptAttempts || 0) + 1,
        }));
      })();
    },
    [activeUser, reviewPromptLoaded, reviewPromptState, setReviewPromptState]
  );

  const persistProgress = useCallback(
    (nextProgress) => {
      if (!progressStorageKey) return;
      try {
        localStorage.setItem(progressStorageKey, JSON.stringify(nextProgress));
      } catch (e) {}
    },
    [progressStorageKey]
  );

  const updateProgressAfterLevel = useCallback(
    (modeKey, level, stars) => {
      setProgress((prev) => {
        const base = normalizeProgress(prev);
        const normalizedMode = normalizeModeKey(modeKey);
        let next = base;

        if (normalizedMode === "localFlags") {
          const packId = activeLocalPackId || LOCAL_PACKS[0]?.packId;
          if (!packId) return base;
          const packs = { ...(base.localFlags?.packs || {}) };
          const pack = packs[packId] || { levels: {} };
          const prevStars = Number(pack.levels?.[level]?.stars || 0);
          const best = Math.max(prevStars, Number(stars || 0));
          packs[packId] = {
            ...pack,
            levels: {
              ...(pack.levels || {}),
              [level]: {
                stars: best,
                completedAt: best > 0 ? new Date().toISOString() : null,
              },
            },
          };
          next = {
            ...base,
            localFlags: {
              ...base.localFlags,
              packs,
            },
          };
        } else {
          const modeProgress = base[normalizedMode] || {
            starsByLevel: {},
            unlockedUntil: BATCH,
          };
          const prevStars = Number(modeProgress.starsByLevel?.[level] || 0);
          const best = Math.max(prevStars, Number(stars || 0));
          const updatedStars = { ...modeProgress.starsByLevel, [level]: best };
          const unlocked =
            normalizedMode === "classic" || normalizedMode === "timetrial"
              ? computeUnlockedLevels(updatedStars)
              : Number.isFinite(Number(modeProgress.unlockedUntil))
              ? Number(modeProgress.unlockedUntil)
              : 0;
          next = {
            ...base,
            [normalizedMode]: {
              starsByLevel: updatedStars,
              unlockedUntil: unlocked,
            },
          };
        }
        persistProgress(next);
        if (activeUser) {
          updatePlayerState(activeUser, { progress: next });
        }
        maybePromptForReview(next);
        return next;
      });
    },
    [activeLocalPackId, activeUser, maybePromptForReview, persistProgress]
  );



  // 🔁 HINTS: now use dedicated per-user hook (with legacy migration)
  const [hints, setHints] = usePerUserHints(activeUser);

  // Backend inventory (includes hints). We keep a copy so we can merge
  // additional keys the backend might have without losing them when we
  // update hints.
  const [inventory, setInventory] = useState(null);
  const [cooldowns, setCooldowns] = useState({});

  // 🔑 COINS: single source of truth synced with localStorage
  const [coins, setCoins] = useState(0);
  const [heartsState, setHeartsState] = useState(DEFAULT_HEARTS_STATE);
  const backendHeartsRef = useRef(null);
  const pendingHeartsUpdateRef = useRef(null);
  const heartsPushTimeoutRef = useRef(null);
  const [nextHeartsRefreshAt, setNextHeartsRefreshAt] = useState(null);

  useEffect(() => {
    backendHeartsRef.current = null;
    pendingHeartsUpdateRef.current = null;
    setNextHeartsRefreshAt(null);
  }, [activeUser]);

  useEffect(() => {
    if (!activeUser) {
      setBackendPreferredLanguage(null);
      setPendingPreferredLanguagePush(false);
      setCoins(0);
      setHeartsState(DEFAULT_HEARTS_STATE);
      setBackendLoaded(false);
      setInventory(null);
      setCooldowns({});
      return;
    }
    setBackendLoaded(false);
    setCooldowns({});
    setHeartsState(loadHeartsForUser(activeUser));

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

          const backendProgress = normalizeProgress(state.progress);
          setProgress(backendProgress);
          persistProgress(backendProgress);

          const backendLang =
            state.preferred_language ||
            state.preferred_lang ||
            state.lang ||
            state.language ||
            "";
          const normalizedBackendLang = backendLang
            ? normalizeLanguageCode(backendLang)
            : "";
          if (normalizedBackendLang) {
            setBackendPreferredLanguage(normalizedBackendLang);
            setPendingPreferredLanguagePush(false);
            if (normalizedBackendLang !== lang) {
              setLang(normalizedBackendLang);
            } else {
              persistLanguageToStorage(normalizedBackendLang);
            }
          } else {
            setBackendPreferredLanguage(null);
            const storedLang = normalizeLanguageCode(
              readLanguageFromStorage() || lang
            );
            if (storedLang !== lang) {
              setLang(storedLang);
            }
            setPendingPreferredLanguagePush(true);
          }

          const backendHearts = normalizeHeartsState({
            hearts_current: state.hearts_current,
            hearts_max: state.hearts_max,
            hearts_last_regen_at: state.hearts_last_regen_at,
          });
          const regenerated = applyHeartsRegen(backendHearts, Date.now());
          backendHeartsRef.current = backendHearts;
          setHeartsState(regenerated);
          if (regenerated.added > 0) {
            pendingHeartsUpdateRef.current = regenerated;
          }
          try {
            localStorage.setItem(
              getHeartsStorageKey(activeUser),
              JSON.stringify({
                hearts_current: regenerated.current,
                hearts_max: regenerated.max,
                hearts_last_regen_at: regenerated.lastRegenAt,
              })
            );
          } catch (e) {}

          const backendCooldowns = state.cooldowns || {};
          setCooldowns(backendCooldowns);
        }

        setBackendLoaded(true);
      } catch (e) {
        // fallback to local only
        try {
          const raw = localStorage.getItem(`flagiq:u:${activeUser}:coins`);
          setCoins(raw ? Number(raw) : 0);
        } catch (e) {}
        setHeartsState(loadHeartsForUser(activeUser));
        setCooldowns({});
        setBackendPreferredLanguage((prev) => prev);
        setPendingPreferredLanguagePush((prev) => prev || !!activeUser);

        // ✅ allow later sync back to backend
        setBackendLoaded(true);
      }
    })();
  }, [activeUser, persistProgress]);


  // helper to update coins AND persist to localStorage
  const applyCoinsUpdate = useCallback(
    (valueOrUpdater) => {
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
    },
    [activeUser]
  );

  const flushHeartsUpdate = useCallback(async () => {
    if (
      !activeUser ||
      !backendLoaded ||
      !pendingHeartsUpdateRef.current ||
      !isOnline
    ) {
      return;
    }

    const payloadState = normalizeHeartsState(pendingHeartsUpdateRef.current);
    pendingHeartsUpdateRef.current = null;
    try {
      const updated = await updatePlayerState(activeUser, {
        hearts_current: payloadState.current,
        hearts_max: payloadState.max,
        hearts_last_regen_at: payloadState.lastRegenAt
          ? new Date(payloadState.lastRegenAt).toISOString()
          : null,
      });
      const normalizedUpdated = normalizeHeartsState({
        hearts_current: updated?.hearts_current ?? payloadState.current,
        hearts_max: updated?.hearts_max ?? payloadState.max,
        hearts_last_regen_at:
          updated?.hearts_last_regen_at ?? payloadState.lastRegenAt,
      });
      backendHeartsRef.current = normalizedUpdated;
      const recomputed = applyHeartsRegen(normalizedUpdated, Date.now());
      setHeartsState((prev) => ({
        ...normalizeHeartsState(prev),
        ...recomputed,
      }));
      setNextHeartsRefreshAt(recomputed.nextRefreshAt ?? null);
    } catch (e) {
      pendingHeartsUpdateRef.current = payloadState;
    }
  }, [activeUser, backendLoaded, isOnline]);

  const queueHeartsUpdate = useCallback(
    (state) => {
      if (!activeUser || !backendLoaded) return;
      pendingHeartsUpdateRef.current = normalizeHeartsState(state);
      if (heartsPushTimeoutRef.current) return;
      heartsPushTimeoutRef.current = setTimeout(() => {
        heartsPushTimeoutRef.current = null;
        flushHeartsUpdate();
      }, 200);
    },
    [activeUser, backendLoaded, flushHeartsUpdate]
  );

  useEffect(() => {
    registerPurchaseRewardHandler(async (product) => {
      const reward = product?.reward || {};
      let coinsGranted = 0;
      let heartsRefilled = false;

      if (Number.isFinite(Number(reward.coins))) {
        coinsGranted = Number(reward.coins);
        if (coinsGranted > 0) {
          applyCoinsUpdate((prev) => Math.max(0, prev + coinsGranted));
        }
      }

      if (reward.heartsRefill) {
        heartsRefilled = true;
        setHeartsState((prev) => {
          const normalized = normalizeHeartsState(prev);
          const nextState = {
            ...normalized,
            current: normalized.max,
            max: normalized.max,
            lastRegenAt: null,
          };
          queueHeartsUpdate(nextState);
          return nextState;
        });
      }

      return { success: true, coinsGranted, heartsRefilled };
    });
  }, [applyCoinsUpdate, queueHeartsUpdate]);

  const handleDailySpinClaim = useCallback(async () => {
    if (!activeUser || !backendLoaded) {
      return { success: false, reason: "not_ready" };
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { success: false, reason: "offline" };
    }

    try {
      const latestState = await getPlayerState(activeUser);
      const latestCooldowns = latestState?.cooldowns || {};
      setCooldowns(latestCooldowns);

      const lastClaimedAt =
        latestCooldowns?.dailySpin?.last_claimed_at || null;
      const remainingMs = remainingDailySpinMs(lastClaimedAt);
      if (remainingMs > 0) {
        return { success: false, remainingMs, lastClaimedAt };
      }

      const nextIso = new Date().toISOString();
      const mergedCooldowns = {
        ...latestCooldowns,
        dailySpin: {
          ...(latestCooldowns.dailySpin || {}),
          last_claimed_at: nextIso,
        },
      };

      const updated = await updatePlayerState(activeUser, {
        cooldowns: mergedCooldowns,
      });
      const savedCooldowns = updated?.cooldowns || mergedCooldowns;
      setCooldowns(savedCooldowns);

      const savedLast =
        savedCooldowns?.dailySpin?.last_claimed_at || nextIso;

      return { success: true, lastClaimedAt: savedLast };
    } catch (error) {
      console.error("Failed to update daily spin cooldown", error);
      return { success: false, reason: "error" };
    }
  }, [activeUser, backendLoaded]);

  useEffect(() => {
    flushHeartsUpdate();
  }, [flushHeartsUpdate]);

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

    const normalized = normalizeLanguageCode(lang);
    if (
      backendPreferredLanguage === normalized &&
      !pendingPreferredLanguagePush
    ) {
      return;
    }

    if (!isOnline) {
      setPendingPreferredLanguagePush(true);
      return;
    }

    (async () => {
      try {
        await updatePlayerState(activeUser, {
          preferred_language: normalized,
        });
        setBackendPreferredLanguage(normalized);
        setPendingPreferredLanguagePush(false);
      } catch (e) {
        setPendingPreferredLanguagePush(true);
      }
    })();
  }, [
    activeUser,
    backendLoaded,
    backendPreferredLanguage,
    isOnline,
    lang,
    pendingPreferredLanguagePush,
  ]);

  useEffect(() => {
    if (!activeUser) return;
    try {
      const key = getHeartsStorageKey(activeUser);
      if (!key) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          hearts_current: heartsState.current,
          hearts_max: heartsState.max,
          hearts_last_regen_at: heartsState.lastRegenAt,
        })
      );
    } catch (e) {}
  }, [activeUser, heartsState]);

  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState("login");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lockInfo, setLockInfo] = useState(null);
  const [noLivesOpen, setNoLivesOpen] = useState(false);

  const [levels] = useState(() => buildLevels(FLAGS));
  const activeLocalPack = useMemo(() => {
    return (
      LOCAL_PACKS.find((pack) => pack.packId === activeLocalPackId) ||
      LOCAL_PACKS[0] ||
      null
    );
  }, [activeLocalPackId]);
  const localPackLevels = useMemo(
    () => (activeLocalPack ? buildLocalPackLevels(activeLocalPack) : []),
    [activeLocalPack]
  );
  const localLevelLabel = useMemo(() => {
    if (mode !== "localFlags") return null;
    return localPackLevels.find((level) => level.id === levelId)?.label || null;
  }, [mode, localPackLevels, levelId]);
  const heartsCurrent = heartsState?.current ?? MAX_HEARTS;
  const heartsMax = heartsState?.max ?? MAX_HEARTS;
  const lastRegenAt = heartsState?.lastRegenAt ?? null;

  const refreshHeartsFromBackend = useCallback(async () => {
    if (!activeUser || !backendLoaded || !isOnline) return;
    try {
      const latest = await getPlayerState(activeUser);
      const backendHearts = normalizeHeartsState({
        hearts_current: latest?.hearts_current,
        hearts_max: latest?.hearts_max,
        hearts_last_regen_at: latest?.hearts_last_regen_at,
      });
      backendHeartsRef.current = backendHearts;
      const regenerated = applyHeartsRegen(backendHearts, Date.now());
      setHeartsState((prev) => ({
        ...normalizeHeartsState(prev),
        ...regenerated,
      }));
      setNextHeartsRefreshAt(regenerated.nextRefreshAt ?? null);
      if (regenerated.added > 0) {
        queueHeartsUpdate(regenerated);
      }
    } catch (e) {
      // ignore fetch errors
    }
  }, [activeUser, backendLoaded, isOnline, queueHeartsUpdate]);

  const applyHeartsTick = useCallback(
    (forcedNow) => {
      if (!loggedIn) return;
      const nowTs = Number.isFinite(Number(forcedNow))
        ? Number(forcedNow)
        : Date.now();

      setHeartsState((prev) => {
        const normalized = normalizeHeartsState(prev);
        const regen = applyHeartsRegen(normalized, nowTs);
        const capSource =
          !isOnline && backendHeartsRef.current
            ? applyHeartsRegen(backendHeartsRef.current, nowTs)
            : null;

        const cappedCurrent =
          capSource && regen.current > capSource.current
            ? capSource.current
            : regen.current;
        const cappedLast =
          capSource && regen.current > capSource.current
            ? capSource.lastRegenAt
            : regen.lastRegenAt;
        const nextRefresh =
          regen.nextRefreshAt ?? capSource?.nextRefreshAt ?? null;

        const nextState = {
          ...normalized,
          ...regen,
          current: cappedCurrent,
          lastRegenAt: cappedLast,
          nextRefreshAt: nextRefresh || null,
        };

        const actualAdded = Math.max(0, cappedCurrent - normalized.current);
        if (actualAdded > 0) {
          queueHeartsUpdate(nextState);
        }
        setNextHeartsRefreshAt(nextRefresh || null);
        return nextState;
      });
    },
    [isOnline, loggedIn, queueHeartsUpdate]
  );

  useEffect(() => {
    if (!loggedIn) return;
    applyHeartsTick();
    const id = setInterval(() => applyHeartsTick(), 1500);
    let timeoutId = null;
    if (nextHeartsRefreshAt) {
      const delay = Math.max(500, nextHeartsRefreshAt - Date.now());
      timeoutId = setTimeout(() => applyHeartsTick(), delay);
    }
    return () => {
      clearInterval(id);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [applyHeartsTick, loggedIn, nextHeartsRefreshAt]);

  useEffect(() => {
    if (!activeUser || !backendLoaded) return;
    if (isOnline) {
      refreshHeartsFromBackend();
    }
  }, [activeUser, backendLoaded, isOnline, refreshHeartsFromBackend]);

  useEffect(() => {
    if (!activeUser) return;
    const handleFocus = () => refreshHeartsFromBackend();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshHeartsFromBackend();
      }
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [activeUser, refreshHeartsFromBackend]);

  // home guard
  useEffect(() => {
    if (!loggedIn && screen !== "home") setScreen("home");
  }, [loggedIn, screen, setScreen]);

  const goHome = () => setScreen("home");
  const goLevels = () => setScreen("levels");
  const goGame = () => setScreen("game");

  // ★ IMPORTANT: rely on LevelScreen for lock logic; just check hearts here
  function onLevelClick(id) {
    if (heartsCurrent <= 0) {
      setNoLivesOpen(true);
      return;
    }
    setLevelId(id);
    goGame();
  }

  function onRunLost() {
    setHeartsState((prev) => {
      const current = normalizeHeartsState(prev);
      const nextCurrent = Math.max(0, current.current - 1);
      const needsRegenStart =
        nextCurrent < current.max && current.lastRegenAt === null;
      const nextState = {
        ...current,
        current: nextCurrent,
        lastRegenAt: needsRegenStart ? Date.now() : current.lastRegenAt,
        nextRefreshAt: needsRegenStart
          ? Date.now() + REGEN_MS
          : current.nextRefreshAt ?? null,
      };
      queueHeartsUpdate(nextState);
      return nextState;
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

  // NEW: per-mode stats for homepage cards, based on in-memory progress
  const classicStats = deriveModeStatsFromProgress(progress, "classic");
  const timetrialStats = deriveModeStatsFromProgress(progress, "timetrial");

  const handleHomeStart = (nextMode, pack) => {
    if (!loggedIn) {
      openAuth();
      return;
    }
    if (nextMode === "localFlags") {
      if (pack?.packId) {
        setActiveLocalPackId(pack.packId);
      }
      setMode("localFlags");
      setScreen(pack ? "local-pack-levels" : "local-packs");
      return;
    }
    setMode(nextMode || "classic");
    setScreen("levels");
  };

  const handleLocalPackSelect = useCallback(
    (pack) => {
      if (!loggedIn) {
        openAuth();
        return;
      }
      if (pack?.packId) {
        setActiveLocalPackId(pack.packId);
      }
      setMode("localFlags");
      setScreen("local-pack-levels");
    },
    [loggedIn, openAuth, setActiveLocalPackId, setMode, setScreen]
  );

  // navigation helper for opening the store from header
  const openStoreFromScreen = () => {
    setLastNonStoreScreen(screen || "levels");
    setScreen("shop");
  };

  // Buy a single extra heart using coins (prototype only)
  const handleBuyHeartWithCoins = () => {
    const HEART_COST = 50;
    if (heartsCurrent >= heartsMax) return;
    if (coins < HEART_COST) return;

    // deduct coins
    applyCoinsUpdate((prev) => {
      const next = Math.max(0, (Number(prev) || 0) - HEART_COST);
      return next;
    });

    // add +1 heart, capped at max
    setHeartsState((prev) => {
      const current = normalizeHeartsState(prev);
      const nextCurrent = Math.min(current.max, current.current + 1);
      const nextState = {
        ...current,
        current: nextCurrent,
        lastRegenAt: nextCurrent >= current.max ? null : current.lastRegenAt,
      };
      queueHeartsUpdate(nextState);
      return nextState;
    });
  };

  const modeProgress = mode === "localFlags"
    ? { starsByLevel: {}, unlockedUntil: 0 }
    : progress[mode] || {
        starsByLevel: {},
        unlockedUntil: BATCH,
      };
  const starsByLevel = modeProgress.starsByLevel || {};
  const unlockedFromProgress =
    mode === "localFlags"
      ? 0
      : Number.isFinite(Number(modeProgress.unlockedUntil))
      ? Number(modeProgress.unlockedUntil)
      : computeUnlockedLevels(starsByLevel || {});
  const localFlagsLabelRaw = t && lang ? t(lang, "localFlags") : "Local Flags";
  const localFlagsLabel =
    localFlagsLabelRaw === "localFlags" ? "Local Flags" : localFlagsLabelRaw;
  const activeLevels = mode === "localFlags" ? localPackLevels : levels;
  const storedStars =
    mode === "localFlags"
      ? getLocalLevelStars(progress, activeLocalPackId, levelId)
      : Number(starsByLevel[levelId]) || 0;

  const handleGameBack = () => {
    if (mode === "localFlags") {
      setScreen("local-pack-levels");
      return;
    }
    setScreen("levels");
  };

  const handleNextLevel = () => {
    if (mode === "localFlags") {
      const idx = localPackLevels.findIndex((lvl) => lvl.id === levelId);
      const next = idx >= 0 ? localPackLevels[idx + 1] : null;
      if (next) {
        setLevelId(next.id);
        setScreen("game");
      } else {
        setScreen("local-pack-levels");
      }
      return;
    }

    const next = levelId + 1;
    const unlocked = Math.max(
      unlockedFromProgress,
      computeUnlockedLevels(starsByLevel || {})
    );
    if (next <= unlocked) {
      setLevelId(next);
      setScreen("game");
    } else {
      setScreen("levels");
    }
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
          progress={progress}
          dailySpinLastClaimedAt={
            cooldowns?.dailySpin?.last_claimed_at || null
          }
          onDailySpinClaim={handleDailySpinClaim}
        />
      )}

      {/* LOCAL PACKS */}
      {loggedIn && screen === "local-packs" && (
        <>
          <Header
            showBack
            onBack={goHome}
            hearts={{
              current: heartsCurrent,
              max: heartsMax,
              lastRegenAt,
              nextRefreshAt: nextHeartsRefreshAt,
            }}
            username={activeUser}
            onSettings={() => setSettingsOpen(true)}
            showHearts
            t={t}
            lang={lang}
            coins={coins}
            onCoinsClick={openStoreFromScreen}
          />
          <div style={{ padding: "12px 16px", maxWidth: 980, margin: "0 auto" }}>
            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                marginBottom: 12,
                color: "#0f172a",
              }}
            >
              {localFlagsLabel}
            </div>
            <LocalPacksGrid
              packs={LOCAL_PACKS}
              progress={progress}
              t={t}
              lang={lang}
              onPackClick={handleLocalPackSelect}
            />
          </div>
        </>
      )}

      {/* LOCAL PACK LEVELS */}
      {loggedIn && screen === "local-pack-levels" && (
        <>
          <Header
            showBack
            onBack={goHome}
            hearts={{
              current: heartsCurrent,
              max: heartsMax,
              lastRegenAt,
              nextRefreshAt: nextHeartsRefreshAt,
            }}
            username={activeUser}
            onSettings={() => setSettingsOpen(true)}
            showHearts
            t={t}
            lang={lang}
            coins={coins}
            onCoinsClick={openStoreFromScreen}
          />
          <LocalPackLevelsScreen
            t={t}
            lang={lang}
            pack={activeLocalPack}
            levels={localPackLevels}
            progress={progress}
            onLevelClick={(level) => {
              setMode("localFlags");
              setLevelId(level.id);
              setScreen("game");
            }}
          />
        </>
      )}

      {/* LEVELS */}
      {loggedIn && screen === "levels" && (
        <>
          <Header
            showBack
            onBack={goHome}
            hearts={{
              current: heartsCurrent,
              max: heartsMax,
              lastRegenAt,
              nextRefreshAt: nextHeartsRefreshAt,
            }}
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
            progress={progress}
          />
        </>
      )}

      {/* GAME */}
      {loggedIn && screen === "game" && (
        <>
          <Header
            showBack
            onBack={handleGameBack}
            hearts={{
              current: heartsCurrent,
              max: heartsMax,
              lastRegenAt,
              nextRefreshAt: nextHeartsRefreshAt,
            }}
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
            levelLabel={localLevelLabel}
            levels={activeLevels}
            currentStars={storedStars}
            storedStars={storedStars}
            onProgressUpdate={updateProgressAfterLevel}
            onRunLost={onRunLost}
            soundCorrect={soundCorrect}
            soundWrong={soundWrong}
            onBack={handleGameBack}
            onNextLevel={handleNextLevel}
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
            hearts={{
              current: heartsCurrent,
              max: heartsMax,
              lastRegenAt,
              nextRefreshAt: nextHeartsRefreshAt,
            }}
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
            hearts={heartsCurrent}
            maxHearts={heartsMax}
            onBuyHeartWithCoins={handleBuyHeartWithCoins}
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
          setLang={handleLanguageChange}
          activeUser={activeUser}
          setActiveUser={(u) => {
            setActiveUser(u);
            if (!u) {
              setActiveUserLabel("");
              setScreen("home");
            }
          }}
          activeUserLabel={activeUserLabel}
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
          lastRegenAt={lastRegenAt}
          maxHearts={heartsMax}
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
