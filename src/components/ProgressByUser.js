// ProgressByUser.js
// Per-username persistence for progress (modes, levels, stars) and coins.

const KEY = (username) =>
  `flag_progress_${String(username || "guest").trim().toLowerCase()}`;

// ---- Safe localStorage helpers ----
function safeRead(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function safeWrite(key, obj) {
  try {
    localStorage.setItem(key, JSON.stringify(obj));
  } catch {
    // ignore quota/serialization errors
  }
}

// Data shape (per username):
// {
//   coins: number,
//   modes: {
//     classic:   { level:number, stars:number, completed:number },
//     timetrial: { level:number, stars:number, completed:number }
//   },
//   levels: {
//     "classic:1":   { stars:0|1|2|3, completed:boolean, bestTimeMs?:number },
//     "timetrial:5": { stars:0|1|2|3, completed:boolean, bestTimeMs?:number }
//   }
// }

// ---------- Modes (aggregate per game mode) ----------
export function getModeStatsByUser(username, mode) {
  const store = safeRead(KEY(username));
  return store?.modes?.[mode] ?? { level: 0, stars: 0, completed: 0 };
}

/**
 * Record a finished level result and update aggregates.
 * @param {string} username
 * @param {"classic"|"timetrial"} mode
 * @param {string|number} levelId
 * @param {{stars?:number, timeMs?:number}} result
 * @returns {{level:number, stars:number, completed:number}} Updated mode aggregate
 */
export function recordLevelResultByUser(
  username,
  mode,
  levelId,
  { stars = 0, timeMs } = {}
) {
  const key = KEY(username);
  const store = safeRead(key);

  store.levels = store.levels || {};
  const k = `${mode}:${levelId}`;
  const prev = store.levels[k] || { stars: 0, completed: false };

  const nextStars = Math.max(Number(prev.stars || 0), Number(stars || 0));
  const nextBestTime =
    typeof timeMs === "number"
      ? Math.min(prev.bestTimeMs ?? Infinity, timeMs)
      : prev.bestTimeMs;

  store.levels[k] = {
    stars: nextStars,
    completed: true,
    bestTimeMs: Number.isFinite(nextBestTime) ? nextBestTime : prev.bestTimeMs,
  };

  // Recompute aggregates for this mode
  store.modes = store.modes || {};
  const levelKeys = Object.keys(store.levels).filter((s) =>
    s.startsWith(`${mode}:`)
  );

  const completed = levelKeys.reduce(
    (n, id) => n + (store.levels[id].completed ? 1 : 0),
    0
  );
  const totalStars = levelKeys.reduce(
    (sum, id) => sum + Number(store.levels[id].stars || 0),
    0
  );

  store.modes[mode] = {
    level: completed, // treat "level" as #completed levels
    stars: totalStars,
    completed,
  };

  safeWrite(key, store);
  return store.modes[mode];
}

// ---------- Levels (best-ever for a specific level) ----------
export function getLevelStatsByUser(username, mode, levelId) {
  const store = safeRead(KEY(username));
  const k = `${mode}:${levelId}`;
  return store?.levels?.[k] ?? {
    stars: 0,
    completed: false,
    bestTimeMs: undefined,
  };
}

// ---------- Coins ----------
export function getCoinsByUser(username) {
  const store = safeRead(KEY(username));
  const n = Number(store.coins || 0);
  return Number.isFinite(n) ? n : 0;
}

export function addCoinsByUser(username, delta) {
  const key = KEY(username);
  const store = safeRead(key);
  const prev = getCoinsByUser(username);
  const next = Math.max(0, prev + Number(delta || 0));
  store.coins = next;
  safeWrite(key, store);
  return next;
}

export function setCoinsByUser(username, value) {
  const key = KEY(username);
  const store = safeRead(key);
  store.coins = Math.max(0, Number(value || 0));
  safeWrite(key, store);
  return store.coins;
}

// ---------- Optional utilities (not required, but handy) ----------

/**
 * Clear a user's **level/stars** progress but keep coins.
 * Used for dev/test reset from the Settings modal.
 */
export function clearLevelProgressByUser(username) {
  const key = KEY(username);
  const store = safeRead(key);

  const preservedCoins = Number(store.coins || 0);
  const newStore = {
    coins: Number.isFinite(preservedCoins) ? preservedCoins : 0,
    // drop modes + levels → they will be recomputed as the user plays again
  };

  safeWrite(key, newStore);
}

/** Read the entire persisted blob for debugging (avoid in prod UI). */
export function _debugReadStore(username) {
  return safeRead(KEY(username));
}

/** Clear a user's progress (useful for tests/reset buttons). */
export function clearProgressByUser(username) {
  try {
    localStorage.removeItem(KEY(username));
  } catch {
    // ignore
  }
}
