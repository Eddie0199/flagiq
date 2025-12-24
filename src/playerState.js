// src/playerState.js
import { supabase } from "./supabaseClient";

/**
 * We store:
 * - coins
 * - last_spin_at (cooldown)
 * - preferred_language
 * - progress JSON with per-mode:
 *    { starsByLevel: { "1": 3, "2": 2, ... }, unlockedUntil: 5 }
 *
 * Mode keys are confirmed: "classic" and "timeTrial"
 */

export const MODE_KEYS = ["classic", "timeTrial"];

const DEFAULT_PROGRESS = {
  classic: { starsByLevel: {}, unlockedUntil: 5 },
  timeTrial: { starsByLevel: {}, unlockedUntil: 5 },
};

// --- helpers ---

function normaliseProgress(progress) {
  const base = JSON.parse(JSON.stringify(DEFAULT_PROGRESS));

  if (!progress || typeof progress !== "object") return base;

  for (const mode of MODE_KEYS) {
    const m = progress[mode];
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
  return true;
}

/**
 * Fetch current state row and return a normalised object.
 */
export async function getPlayerState() {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from("player_state")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error) throw error;

  const progress = normaliseProgress(data.progress);

  return {
    ...data,
    progress,
  };
}

/**
 * Patch top-level columns: coins, preferred_language, last_spin_at
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

  const { data, error } = await supabase
    .from("player_state")
    .update({
      progress: normalised,
      updated_at: new Date().toISOString(),
    })
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
