// src/leaderboardApi.js
import { supabase } from "./supabaseClient";

export async function fetchTimeTrialLeaderboard(limit = 100) {
  if (!supabase) {
    return { entries: [], error: new Error("Supabase client unavailable") };
  }

  const { data, error } = await supabase
    .from("time_trial_leaderboard")
    .select("user_id, display_name, username, total_score, rank")
    .order("total_score", { ascending: false })
    .limit(limit);

  if (error) {
    return { entries: [], error };
  }

  const entries = (data || []).map((row, index) => ({
    rank: Number(row?.rank ?? index + 1),
    name: row?.display_name || row?.username || "Anonymous",
    score: Number(row?.total_score ?? 0),
    userId: row?.user_id || null,
  }));

  return { entries, error: null };
}
