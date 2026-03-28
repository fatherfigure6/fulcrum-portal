import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // ── Read and validate Authorization header ──────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }
  const token = authHeader.replace("Bearer ", "");

  // ── Admin client for privileged operations ──────────────────────────────────
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // ── Validate caller token ───────────────────────────────────────────────────
  const { data: userData, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !userData?.user) {
    console.error("[auth] getUser failed:", authError);
    return json({ error: "Unauthorized" }, 401);
  }
  const userId = userData.user.id;

  // ── Verify caller is staff ─────────────────────────────────────────────────
  const { data: callerProfile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (callerProfile?.role !== "staff") return json({ error: "Forbidden" }, 403);

  // ── Parse request body ─────────────────────────────────────────────────────
  const { userId: targetUserId } = await req.json();
  if (!targetUserId) return json({ error: "userId is required" }, 400);

  // ── Delete auth user (profile is deleted via ON DELETE CASCADE) ────────────
  const { error } = await adminClient.auth.admin.deleteUser(targetUserId);
  if (error) return json({ error: error.message });

  return json({ success: true });
});
