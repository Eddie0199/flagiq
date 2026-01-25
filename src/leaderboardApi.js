// src/leaderboardApi.js
import { supabase } from "./supabaseClient";

export async function fetchTimeTrialLeaderboard(limit = 100) {
  if (!supabase) {
    return { entries: [], error: new Error("Supabase client unavailable") };
  }

  const { data, error } = await supabase
    .from("time_trial_overall_leaderboard")
    .select("user_id, username, points, plays")
    .order("points", { ascending: false })
    .order("plays", { ascending: false })
    .limit(limit);

  if (error) {
    return { entries: [], error };
  }

  const entries = (data || []).map((row, index) => {
    const userId = row?.user_id || null;
    const suffix = userId ? String(userId).slice(-4) : "";
    const fallbackName = suffix ? `Player ${suffix}` : "Player";
    return {
      rank: index + 1,
      name: row?.username || fallbackName,
      score: Number(row?.points ?? 0),
      attempts: Number(row?.plays ?? 0),
      userId,
    };
  });

  return { entries, error: null };
}
