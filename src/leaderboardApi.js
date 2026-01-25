// src/leaderboardApi.js
import { supabase } from "./supabaseClient";

export async function fetchTimeTrialLeaderboard(limit = 100) {
  if (!supabase) {
    return { entries: [], error: new Error("Supabase client unavailable") };
  }

  const { data, error } = await supabase
    .from("time_trial_overall_leaderboard")
    .select("user_id, username, total_best_points, total_plays")
    .order("total_best_points", { ascending: false })
    .order("total_plays", { ascending: false })
    .limit(limit);

  if (error) {
    return { entries: [], error };
  }

  const entries = (data || []).map((row, index) => ({
    rank: index + 1,
    name: row?.username || "Anonymous",
    score: Number(row?.total_best_points ?? 0),
    attempts: Number(row?.total_plays ?? 0),
    userId: row?.user_id || null,
  }));

  return { entries, error: null };
}
