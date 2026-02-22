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

  const rows = data || [];
  const missingUsernameIds = rows
    .filter((row) => {
      const username = String(row?.username || "").trim();
      return !username && row?.user_id;
    })
    .map((row) => row.user_id);

  const profileNameById = new Map();
  if (missingUsernameIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username")
      .in("id", missingUsernameIds);

    (profiles || []).forEach((profile) => {
      const id = profile?.id;
      const username = String(profile?.username || "").trim();
      if (id && username) {
        profileNameById.set(id, username);
      }
    });
  }

  const entries = rows.map((row, index) => {
    const userId = row?.user_id || null;
    const username =
      String(row?.username || "").trim() ||
      profileNameById.get(userId) ||
      "";
    const suffix = userId ? String(userId).slice(-4) : "";
    const fallbackName = suffix ? `Player ${suffix}` : "Player";
    return {
      rank: index + 1,
      name: username || fallbackName,
      score: Number(row?.points ?? 0),
      attempts: Number(row?.plays ?? 0),
      userId,
    };
  });

  return { entries, error: null };
}
