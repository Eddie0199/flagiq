// src/playerStateApi.js
import { supabase } from "./supabaseClient";

const MODE_KEYS = ["classic", "timeTrial"];

export async function ensurePlayerRows(userId) {
  if (!userId) return;

  // 1) Ensure the base row exists (coins etc)
  const { error: baseErr } = await supabase
    .from("player_state")
    .upsert(
      { user_id: userId, coins: 0 },
      { onConflict: "user_id" }
    );

  if (baseErr) throw baseErr;

  // 2) Ensure per-mode rows exist (stars/unlocks)
  // Adjust column names to match what YOU created in SQL.
  // Example assumes: player_mode_state(user_id, mode_key, stars_by_level, unlocked_until)
  const modeRows = MODE_KEYS.map((mode) => ({
    user_id: userId,
    mode_key: mode,
    stars_by_level: {},    // json/jsonb
    unlocked_until: 5      // first 5 levels unlocked
  }));

  const { error: modeErr } = await supabase
    .from("player_mode_state")
    .upsert(modeRows, { onConflict: "user_id,mode_key" });

  if (modeErr) throw modeErr;
}
