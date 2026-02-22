// src/leaderboardApi.js
import { supabase } from "./supabaseClient";

export async function fetchTimeTrialLeaderboard(limit = 100) {
  if (!supabase) {
    return { entries: [], error: new Error("Supabase client unavailable") };
  }

  const { data, error } = await supabase
    .from("time_trial_overall_leaderboard_view")
    .select("user_id, username, points, plays")
    .order("points", { ascending: false })
    .limit(limit);

  if (error) {
    return { entries: [], error };
  }

  const userIds = Array.from(
    new Set((data || []).map((row) => row?.user_id).filter(Boolean))
  );

  let usernameByUserId = {};
  if (userIds.length > 0) {
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, username")
      .in("id", userIds);

    usernameByUserId = (profilesData || []).reduce((acc, row) => {
      if (row?.id) {
        acc[row.id] = row?.username || "";
      }
      return acc;
    }, {});
  }

  const entries = (data || []).map((row, index) => {
    const userId = row?.user_id || null;
    const fallbackName = "Unknown player";
    return {
      rank: index + 1,
      name: usernameByUserId[userId] || row?.username || fallbackName,
      score: Number(row?.points ?? 0),
      attempts: Number(row?.plays ?? 0),
      userId,
    };
  });

  return { entries, error: null };
}
