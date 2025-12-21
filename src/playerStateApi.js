// src/playerStateApi.js
import { supabase } from "./supabaseClient";

export async function ensurePlayerState(userId) {
  const { data, error } = await supabase
    .from("player_state")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (data) return true;

  const { error: insertError } = await supabase
    .from("player_state")
    .insert([{ user_id: userId }]);

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
  return data;
}

export async function updatePlayerState(userId, patch) {
  const { data, error } = await supabase
    .from("player_state")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data;
}
