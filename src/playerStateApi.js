// src/playerStateApi.js
import { supabase } from "./supabaseClient";

// Default booster inventory for new users (and to backfill missing data)
const DEFAULT_INVENTORY = {
  hints: {
    "Remove Two": 3,
    InstantCorrect: 1,
    "Extra Time": 2,
  },
  boosters: {},
};

function normaliseInventory(inventory) {
  const base = JSON.parse(JSON.stringify(DEFAULT_INVENTORY));

  if (!inventory || typeof inventory !== "object") return base;

  if (inventory.hints && typeof inventory.hints === "object") {
    base.hints = { ...base.hints, ...inventory.hints };
  }

  if (inventory.boosters && typeof inventory.boosters === "object") {
    base.boosters = { ...inventory.boosters };
  }

  return base;
}

export async function ensurePlayerState(userId) {
  const { data, error } = await supabase
    .from("player_state")
    .select("user_id, inventory")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  if (data) {
    const normalised = normaliseInventory(data.inventory);

    // Backfill defaults if missing
    const needsUpdate = JSON.stringify(normalised) !== JSON.stringify(data.inventory);
    if (needsUpdate) {
      const { error: updateError } = await supabase
        .from("player_state")
        .update({ inventory: normalised })
        .eq("user_id", userId);

      if (updateError) throw updateError;
    }

    return true;
  }

  const { error: insertError } = await supabase
    .from("player_state")
    .insert([{ user_id: userId, inventory: DEFAULT_INVENTORY }]);

  if (insertError) throw insertError;
  return true;
}

export async function getPlayerState(userId) {
  const { data, error } = await supabase
    .from("player_state")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return { ...data, inventory: normaliseInventory(data?.inventory) };
}

export async function updatePlayerState(userId, patch) {
  const safePatch = { ...patch };

  if (Object.prototype.hasOwnProperty.call(safePatch, "inventory")) {
    safePatch.inventory = normaliseInventory(safePatch.inventory);
  }

  const { data, error } = await supabase
    .from("player_state")
    .update({ ...safePatch, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return { ...data, inventory: normaliseInventory(data?.inventory) };
}
