// src/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const missingSupabaseEnv = [];
if (!supabaseUrl) {
  missingSupabaseEnv.push("REACT_APP_SUPABASE_URL");
}
if (!supabaseAnonKey) {
  missingSupabaseEnv.push("REACT_APP_SUPABASE_ANON_KEY");
}

if (missingSupabaseEnv.length > 0) {
  console.warn(
    `Supabase env vars are missing: ${missingSupabaseEnv.join(", ")}`
  );
}

export const supabase =
  missingSupabaseEnv.length === 0
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;
