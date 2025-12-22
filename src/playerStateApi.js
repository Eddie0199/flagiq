// src/playerStateApi.js
import { supabase } from "./supabaseClient";

async function requireUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const userId = data?.user?.id;
  if (!userId) throw new Error("Not authenticated.");
  return userId;
}

export async function ensurePlayerState() {
  const userId = await requireUserId();

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

export async function getPlayerState() {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from("player_state")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updatePlayerState(patch) {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from("player_state")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data;
}
