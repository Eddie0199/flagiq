import { supabase } from "./supabaseClient";

export async function fetchDailyUserEntry(dailyKey) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return { entry: null, userId: null, error: null };

  const { data, error } = await supabase
    .from("daily_scores")
    .select("id, user_id, daily_key, score, correct_count, total_time_ms, created_at")
    .eq("user_id", userId)
    .eq("daily_key", dailyKey)
    .maybeSingle();

  return { entry: data || null, userId, error };
}

export async function submitDailyScore(payload) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) {
    return { data: null, error: new Error("Not authenticated") };
  }

  const insertPayload = {
    user_id: userId,
    daily_key: payload.dailyKey,
    score: payload.score,
    correct_count: payload.correctCount,
    total_time_ms: payload.totalTimeMs,
  };

  const { data, error } = await supabase
    .from("daily_scores")
    .insert(insertPayload)
    .select("id, user_id, daily_key, score, correct_count, total_time_ms, created_at")
    .single();

  return { data, error };
}

export async function fetchDailyLeaderboard(dailyKey, limit = 100) {
  const { data, error } = await supabase
    .from("daily_scores")
    .select("user_id, score, total_time_ms, created_at")
    .eq("daily_key", dailyKey)
    .order("score", { ascending: false })
    .order("total_time_ms", { ascending: true })
    .limit(limit);

  if (error) return { entries: [], error };

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

  const entries = (data || []).map((row, idx) => ({
    rank: idx + 1,
    userId: row.user_id,
    name: usernameByUserId[row.user_id] || "Unknown player",
    score: Number(row.score || 0),
    totalTimeMs: Number(row.total_time_ms || 0),
  }));

  return { entries, error: null };
}

export async function fetchDailyRank(dailyKey, score, totalTimeMs) {
  const { count, error } = await supabase
    .from("daily_scores")
    .select("id", { count: "exact", head: true })
    .eq("daily_key", dailyKey)
    .or(`score.gt.${score},and(score.eq.${score},total_time_ms.lt.${totalTimeMs})`);

  return { rank: (count || 0) + 1, error };
}
