// src/playerState.js
import { supabase } from "./supabaseClient";

/**
 * We store:
 * - coins
 * - last_spin_at (cooldown)
 * - preferred_lang
 * - progress JSON with per-mode:
 *    { starsByLevel: { "1": 3, "2": 2, ... }, unlockedUntil: 5 }
 *
 * Mode keys are confirmed: "classic" and "timetrial"
 */

// NOTE: UI uses "timetrial" (lowercase). Normalise legacy "timeTrial" too.
export const MODE_KEYS = ["classic", "timetrial"];

const DEFAULT_PROGRESS = {
  classic: { starsByLevel: {}, unlockedUntil: 5 },
  timetrial: { starsByLevel: {}, unlockedUntil: 5 },
};

// --- helpers ---

function normaliseProgress(progress) {
  const base = JSON.parse(JSON.stringify(DEFAULT_PROGRESS));

  if (!progress || typeof progress !== "object") return base;

  // support legacy "timeTrial" by aliasing to "timetrial"
  const maybeLegacy = progress.timeTrial || progress.timetrial;
  const mergedProgress = {
    ...progress,
    ...(maybeLegacy ? { timetrial: maybeLegacy } : {}),
  };

  for (const mode of MODE_KEYS) {
    const m = mergedProgress[mode];
    if (!m || typeof m !== "object") continue;

    // starsByLevel
    if (m.starsByLevel && typeof m.starsByLevel === "object") {
      base[mode].starsByLevel = { ...m.starsByLevel };
    }

    // unlockedUntil
    if (Number.isFinite(m.unlockedUntil)) {
      base[mode].unlockedUntil = m.unlockedUntil;
    }
  }

  return base;
}

function mapModeText(modeText) {
  if (!modeText) return null;
  const key = String(modeText);
  if (MODE_KEYS.includes(key)) return key;

  const lower = key.toLowerCase();
  if (lower === "timetrial") return "timetrial";
  if (lower === "classic") return "classic";

  return null;
}

function buildProgressFromModeRows(rows, fallbackProgress) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return normaliseProgress(fallbackProgress);
  }

  const fromRows = {};

  rows.forEach((row) => {
    const modeKey = mapModeText(row.mode_text);
    if (!modeKey) return;

    fromRows[modeKey] = {
      starsByLevel:
        row.stars_by_level && typeof row.stars_by_level === "object"
          ? row.stars_by_level
          : {},
      unlockedUntil: Number.isFinite(row.unlocked_until)
        ? row.unlocked_until
        : undefined,
    };
  });

  const fallback = normaliseProgress(fallbackProgress);
  const merged = normaliseProgress(fromRows);

  for (const mode of MODE_KEYS) {
    if (!Object.keys(merged[mode].starsByLevel || {}).length) {
      merged[mode].starsByLevel = fallback[mode].starsByLevel;
    }
    if (!Number.isFinite(merged[mode].unlockedUntil)) {
      merged[mode].unlockedUntil = fallback[mode].unlockedUntil;
    }
  }

  return merged;
}

async function upsertModeStates(userId, progress) {
  const nowIso = new Date().toISOString();
  const rows = MODE_KEYS.map((mode) => ({
    user_id: userId,
    mode_text: mode,
    stars_by_level: progress?.[mode]?.starsByLevel || {},
    unlocked_until: progress?.[mode]?.unlockedUntil ?? DEFAULT_PROGRESS[mode].unlockedUntil,
    updated_at: nowIso,
  }));

  const { error } = await supabase
    .from("player_mode_state")
    .upsert(rows, { onConflict: "user_id,mode_text" });

  if (error) throw error;
}

async function requireUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const userId = data?.user?.id;
  if (!userId) throw new Error("Not authenticated.");
  return userId;
}

// --- public API ---

/**
 * Ensures player_state row exists.
 * Safe to call on every app start / after login.
 */
export async function ensurePlayerState() {
  const userId = await requireUserId();

  // Upsert minimal row (DB defaults fill the rest)
  const { error } = await supabase.from("player_state").upsert(
    {
      user_id: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) throw error;

  // Also ensure per-mode rows exist
  const nowIso = new Date().toISOString();
  const seedRows = MODE_KEYS.map((mode) => ({
    user_id: userId,
    mode_text: mode,
    stars_by_level: {},
    unlocked_until: DEFAULT_PROGRESS[mode].unlockedUntil,
    updated_at: nowIso,
  }));

  const { error: modeError } = await supabase
    .from("player_mode_state")
    .upsert(seedRows, { onConflict: "user_id,mode_text" });

  if (modeError) throw modeError;
  return true;
}

/**
 * Fetch current state row and return a normalised object.
 */
export async function getPlayerState() {
  const userId = await requireUserId();

  const [{ data, error }, { data: modeRows, error: modeError }] = await Promise.all([
    supabase
    .from("player_state")
    .select("*")
    .eq("user_id", userId)
    .single(),
    supabase
      .from("player_mode_state")
      .select("mode_text, stars_by_level, unlocked_until")
      .eq("user_id", userId),
  ]);

  if (error) throw error;
  if (modeError) throw modeError;

  const progress = buildProgressFromModeRows(modeRows, data.progress);

  return {
    ...data,
    progress,
  };
}

/**
 * Patch top-level columns: coins, preferred_lang, last_spin_at
 * NOTE: for progress edits, use setModeProgress / setLevelStars etc.
 */
export async function updatePlayerState(patch) {
  const userId = await requireUserId();

  const safePatch = { ...patch };
  delete safePatch.user_id; // never allow overriding
  delete safePatch.progress; // use dedicated methods

  safePatch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("player_state")
    .update(safePatch)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw error;

  return {
    ...data,
    progress: normaliseProgress(data.progress),
  };
}

/**
 * Replace entire progress JSON (normalised).
 */
export async function setProgress(nextProgress) {
  const userId = await requireUserId();

  const normalised = normaliseProgress(nextProgress);

  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("player_state")
    .update({
      progress: normalised,
      updated_at: nowIso,
    })
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw error;

  await upsertModeStates(userId, normalised);

  return {
    ...data,
    progress: normaliseProgress(data.progress),
  };
}

/**
 * Set unlockedUntil for a mode.
 */
export async function setUnlockedUntil(mode, unlockedUntil) {
  if (!MODE_KEYS.includes(mode)) {
    throw new Error(`Invalid mode: ${mode}`);
  }
  if (!Number.isFinite(unlockedUntil) || unlockedUntil < 0) {
    throw new Error("unlockedUntil must be a non-negative number.");
  }

  const state = await getPlayerState();
  const next = { ...state.progress };

  next[mode] = {
    ...next[mode],
    unlockedUntil,
  };

  return setProgress(next);
}

/**
 * Set stars for a specific level in a mode.
 * Level is stored as string key in starsByLevel.
 */
export async function setLevelStars(mode, levelNumber, stars) {
  if (!MODE_KEYS.includes(mode)) {
    throw new Error(`Invalid mode: ${mode}`);
  }

  const lvl = Number(levelNumber);
  const st = Number(stars);

  if (!Number.isFinite(lvl) || lvl <= 0) {
    throw new Error("levelNumber must be a positive number.");
  }
  if (!Number.isFinite(st) || st < 0) {
    throw new Error("stars must be a number >= 0.");
  }

  const levelKey = String(lvl);

  const state = await getPlayerState();
  const next = { ...state.progress };

  const modeObj = next[mode] || { starsByLevel: {}, unlockedUntil: 5 };
  const starsByLevel = { ...(modeObj.starsByLevel || {}) };

  // Keep best stars achieved (never downgrade)
  const prev = Number(starsByLevel[levelKey] || 0);
  starsByLevel[levelKey] = Math.max(prev, st);

  next[mode] = { ...modeObj, starsByLevel };

  return setProgress(next);
}

/**
 * Utility: sum stars for a mode.
 */
export function sumModeStars(progress, mode) {
  const m = progress?.[mode];
  const obj = m?.starsByLevel || {};
  return Object.values(obj).reduce((acc, v) => acc + (Number(v) || 0), 0);
}
