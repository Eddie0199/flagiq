import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type CleanupResult = {
  table: string;
  status: "deleted" | "skipped";
  affectedRows?: number;
  reason?: string;
};

const JSON_HEADERS = { "Content-Type": "application/json" };

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function groupObjectPathsByBucket(objects: Array<{ bucket_id: string; name: string }>) {
  return objects.reduce<Record<string, string[]>>((acc, object) => {
    if (!acc[object.bucket_id]) {
      acc[object.bucket_id] = [];
    }
    acc[object.bucket_id].push(object.name);
    return acc;
  }, {});
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { success: false, error: "Method not allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse(500, {
      success: false,
      error: "Missing function environment variables",
    });
  }

  let deletionSource = "self_service";
  try {
    const body = await req.json();
    deletionSource = typeof body?.deletion_source === "string" && body.deletion_source.trim()
      ? body.deletion_source.trim()
      : "self_service";
  } catch (_error) {
    // Body is optional.
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
    return jsonResponse(401, { success: false, error: "Unauthorized" });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: auditRow, error: auditInsertError } = await adminClient
    .from("account_deletions")
    .insert({
      user_id: user.id,
      email: user.email ?? null,
      deletion_source: deletionSource,
      auth_delete_succeeded: false,
    })
    .select("id")
    .single();

  if (auditInsertError || !auditRow?.id) {
    return jsonResponse(500, {
      success: false,
      error: "Failed to write account deletion audit log",
      details: auditInsertError?.message,
    });
  }

  const cleanupResults: CleanupResult[] = [];

  const deleteByUserId = async (table: string) => {
    const { error, count } = await adminClient
      .from(table)
      .delete({ count: "exact" })
      .eq("user_id", user.id);

    if (error) {
      if (error.code === "42P01") {
        cleanupResults.push({ table, status: "skipped", reason: "table_missing" });
        return;
      }
      throw new Error(`Failed cleanup for ${table}: ${error.message}`);
    }

    cleanupResults.push({ table, status: "deleted", affectedRows: count ?? 0 });
  };

  const deleteProfiles = async () => {
    const { error, count } = await adminClient
      .from("profiles")
      .delete({ count: "exact" })
      .eq("id", user.id);

    if (error) {
      if (error.code === "42P01") {
        cleanupResults.push({ table: "profiles", status: "skipped", reason: "table_missing" });
        return;
      }
      throw new Error(`Failed cleanup for profiles: ${error.message}`);
    }

    cleanupResults.push({ table: "profiles", status: "deleted", affectedRows: count ?? 0 });
  };

  let storageObjectsDeleted = 0;

  try {
    await deleteByUserId("player_state");
    await deleteByUserId("purchases");
    await deleteByUserId("iap_purchases");
    await deleteByUserId("time_trial_level_scores");
    await deleteProfiles();

    const { data: objects, error: objectsError } = await adminClient
      .schema("storage")
      .from("objects")
      .select("bucket_id,name")
      .eq("owner", user.id);

    if (objectsError) {
      throw new Error(`Failed listing user-owned storage objects: ${objectsError.message}`);
    }

    const groupedObjects = groupObjectPathsByBucket(objects ?? []);
    for (const [bucketId, paths] of Object.entries(groupedObjects)) {
      if (!paths.length) continue;
      const { error: removeError } = await adminClient.storage.from(bucketId).remove(paths);
      if (removeError) {
        throw new Error(`Failed deleting storage objects from ${bucketId}: ${removeError.message}`);
      }
      storageObjectsDeleted += paths.length;
    }

    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(user.id);
    if (authDeleteError) {
      await adminClient
        .from("account_deletions")
        .update({
          auth_delete_succeeded: false,
          auth_delete_error: authDeleteError.message,
          cleanup_summary: {
            cleanup_results: cleanupResults,
            storage_objects_deleted: storageObjectsDeleted,
          },
          deleted_at: new Date().toISOString(),
        })
        .eq("id", auditRow.id);

      return jsonResponse(500, {
        success: false,
        error: "Auth user deletion failed",
        details: authDeleteError.message,
      });
    }

    const { error: auditUpdateError } = await adminClient
      .from("account_deletions")
      .update({
        auth_delete_succeeded: true,
        auth_delete_error: null,
        cleanup_summary: {
          cleanup_results: cleanupResults,
          storage_objects_deleted: storageObjectsDeleted,
        },
        deleted_at: new Date().toISOString(),
      })
      .eq("id", auditRow.id);

    if (auditUpdateError) {
      return jsonResponse(500, {
        success: false,
        error: "Account deleted, but failed to update audit row",
        details: auditUpdateError.message,
      });
    }

    return jsonResponse(200, {
      success: true,
      audit_id: auditRow.id,
      cleanup_results: cleanupResults,
      storage_objects_deleted: storageObjectsDeleted,
    });
  } catch (error) {
    await adminClient
      .from("account_deletions")
      .update({
        auth_delete_succeeded: false,
        auth_delete_error: error instanceof Error ? error.message : "Unknown error",
        cleanup_summary: {
          cleanup_results: cleanupResults,
          storage_objects_deleted: storageObjectsDeleted,
        },
        deleted_at: new Date().toISOString(),
      })
      .eq("id", auditRow.id);

    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : "Account deletion failed",
    });
  }
});
