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
  const { email, password, name, role, company, phone, mustChangePassword } = await req.json();

  if (!email || !password || !name || !role) {
    return json({ error: "Missing required fields: email, password, name, role" }, 400);
  }

  // ── Check for duplicate email ──────────────────────────────────────────────
  const { data: existing } = await adminClient
    .from("profiles")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (existing) return json({ error: "Email already registered." });

  // ── Create auth user ───────────────────────────────────────────────────────
  const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
    email: email.toLowerCase(),
    password,
    email_confirm: true,
  });

  if (createError) return json({ error: createError.message });

  // ── Insert profile row ─────────────────────────────────────────────────────
  const { error: profileError } = await adminClient.from("profiles").insert({
    id: newUser.user.id,
    email: email.toLowerCase(),
    name,
    role,
    status: role === "broker" ? "approved" : null,
    company: company || null,
    phone: phone || null,
    must_change_password: mustChangePassword ?? false,
  });

  if (profileError) {
    // Rollback: delete the created auth user so no orphan exists
    await adminClient.auth.admin.deleteUser(newUser.user.id);
    return json({ error: "Failed to create user profile. Please try again." });
  }

  return json({ id: newUser.user.id });
});
