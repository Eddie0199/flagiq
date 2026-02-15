import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type LogPayload = {
  user_id?: string;
  product_id?: string;
  transaction_id?: string | null;
  purchased_at?: string;
  environment?: string | null;
  raw_payload?: Record<string, unknown> | null;
};

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return new Response(JSON.stringify({ error: "Missing function env vars" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as LogPayload;
    if (!body?.product_id) {
      return new Response(JSON.stringify({ error: "Missing product_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userId = body.user_id || user.id;
    if (userId !== user.id) {
      return new Response(JSON.stringify({ error: "user_id mismatch" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const purchasePayload = {
      user_id: userId,
      product_id: body.product_id,
      platform: "ios",
      transaction_id: body.transaction_id || null,
      purchased_at: body.purchased_at || new Date().toISOString(),
      environment: body.environment || null,
      raw_payload: body.raw_payload || null,
    };

    const { data, error } = await adminClient
      .from("iap_purchases")
      .upsert(purchasePayload, {
        onConflict: "transaction_id",
        ignoreDuplicates: true,
      })
      .select("id");

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const duplicate = Array.isArray(data) && data.length === 0;
    return new Response(
      JSON.stringify({ success: true, duplicate, status: duplicate ? "duplicate" : "inserted" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
