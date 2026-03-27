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

  // ── Verify caller is authenticated ─────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const jwt = authHeader.replace("Bearer ", "");

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: { user }, error: authError } = await adminClient.auth.getUser(jwt);
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  // ── Verify caller is staff ─────────────────────────────────────────────────
  const { data: callerProfile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (callerProfile?.role !== "staff") return json({ error: "Forbidden" }, 403);

  // ── Parse request body ─────────────────────────────────────────────────────
  const { userId } = await req.json();
  if (!userId) return json({ error: "userId is required" }, 400);

  // ── Delete auth user (profile is deleted via ON DELETE CASCADE) ────────────
  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) return json({ error: error.message });

  return json({ success: true });
});
