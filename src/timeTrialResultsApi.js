// src/timeTrialResultsApi.js
import { supabase } from "./supabaseClient";

export async function submitTimeTrialResult(levelId, score) {
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) {
      console.error("Failed to fetch user for Time Trial submission", userError);
      return;
    }

    const userId = userData?.user?.id;
    if (!userId) return;

    const level = Number(levelId);
    const attemptScore = Number(score);

    if (!Number.isFinite(level) || !Number.isFinite(attemptScore)) {
      console.error("Invalid Time Trial payload", { levelId, score });
      return;
    }

    const { data: existingRow, error: fetchError } = await supabase
      .from("time_trial_level_scores")
      .select("best_score, plays_count")
      .eq("user_id", userId)
      .eq("level_id", level)
      .maybeSingle();

    if (fetchError) {
      console.error("Failed to fetch existing Time Trial result", fetchError);
      return;
    }

    const now = new Date().toISOString();
    const nextBestScore = Math.max(
      Number(existingRow?.best_score ?? 0),
      attemptScore
    );
    const nextPlaysCount = Number(existingRow?.plays_count ?? 0) + 1;

    const payload = {
      user_id: userId,
      level_id: level,
      best_score: nextBestScore,
      plays_count: nextPlaysCount,
      updated_at: now,
    };

    if (!existingRow) {
      payload.created_at = now;
    }

    const { error: upsertError } = await supabase
      .from("time_trial_level_scores")
      .upsert(payload, { onConflict: "user_id,level_id" });

    if (upsertError) {
      console.error("Failed to upsert Time Trial result", upsertError);
    }
  } catch (err) {
    console.error("Unexpected error submitting Time Trial result", err);
  }
}
