// src/leaderboardApi.js
import { supabase } from "./supabaseClient";

const usernameCache = new Map();

function normalizeUsername(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

async function fetchProfilesForUserIds(userIds) {
  if (!userIds.length) return { profileMap: new Map(), error: null };

  const attempts = [
    "id, username, display_name",
    "id, username",
    "id, display_name",
  ];

  for (const selectFields of attempts) {
    const { data, error } = await supabase
      .from("profiles")
      .select(selectFields)
      .in("id", userIds);

    if (error) {
      continue;
    }

    const profileMap = new Map();
    for (const profile of data || []) {
      const username =
        normalizeUsername(profile?.username) ||
        normalizeUsername(profile?.display_name);
      if (profile?.id && username) {
        profileMap.set(profile.id, username);
      }
    }
    return { profileMap, error: null };
  }

  return {
    profileMap: new Map(),
    error: new Error("Unable to resolve profile usernames"),
  };
}

export async function fetchTimeTrialLeaderboard(limit = 100) {
  if (!supabase) {
    return { entries: [], error: new Error("Supabase client unavailable") };
  }

  const { data, error } = await supabase
    .from("time_trial_overall_leaderboard_view")
    .select("user_id, points, plays")
    .order("points", { ascending: false })
    .limit(limit);

  if (error) {
    return { entries: [], error };
  }

  const rows = data || [];
  const userIds = Array.from(
    new Set(rows.map((row) => row?.user_id).filter(Boolean))
  );

  const unresolvedUserIds = userIds.filter((id) => !usernameCache.has(id));
  let profileLookupError = null;

  if (unresolvedUserIds.length) {
    const { profileMap, error: profilesError } = await fetchProfilesForUserIds(
      unresolvedUserIds
    );
    if (profilesError) {
      profileLookupError = profilesError;
      console.warn("[leaderboard] username lookup failed, using fallback names", {
        unresolvedUserIds: unresolvedUserIds.length,
        error: profilesError,
      });
    }
    for (const [id, username] of profileMap.entries()) {
      usernameCache.set(id, username);
    }
  }

  let resolvedUsernames = 0;
  const entries = rows.map((row, index) => {
    const userId = row?.user_id || null;
    const username = userId ? normalizeUsername(usernameCache.get(userId)) : "";
    const suffix = userId ? String(userId).slice(-4) : "";
    const fallbackName = suffix ? `Player ${suffix}` : "Player";
    if (username) {
      resolvedUsernames += 1;
    }

    return {
      rank: index + 1,
      name: username || fallbackName,
      score: Number(row?.points ?? 0),
      attempts: Number(row?.plays ?? 0),
      userId,
    };
  });

  console.info("[leaderboard] loaded", {
    rows: rows.length,
    resolvedUsernames,
    fallbackNames: rows.length - resolvedUsernames,
    cachedUsernames: usernameCache.size,
  });

  return { entries, error: null, profileLookupError };
}
