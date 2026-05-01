import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "Missing Authorization" }, 401);

  // Verify caller
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
  const callerId = userData.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId)
    .eq("role", "admin")
    .maybeSingle();

  if (!roleRow) return json({ error: "Forbidden: admin only" }, 403);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const action = body.action as string;

  try {
    if (action === "list") {
      const { data: usersList, error } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      if (error) throw error;
      const ids = usersList.users.map((u) => u.id);
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      const { data: roles } = await admin
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", ids);
      const merged = usersList.users.map((u) => {
        const p = profiles?.find((pp) => pp.id === u.id);
        const r = roles?.filter((rr) => rr.user_id === u.id).map((rr) => rr.role) ?? [];
        return {
          id: u.id,
          email: u.email,
          full_name: p?.full_name ?? null,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          roles: r,
        };
      });
      return json({ users: merged });
    }

    if (action === "create") {
      const { email, password, full_name } = body;
      if (!email || !password) return json({ error: "email & password required" }, 400);
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name ?? email },
      });
      if (error) throw error;
      return json({ user: data.user });
    }

    if (action === "delete") {
      const { user_id } = body;
      if (!user_id) return json({ error: "user_id required" }, 400);
      if (user_id === callerId) return json({ error: "Cannot delete self" }, 400);
      const { error } = await admin.auth.admin.deleteUser(user_id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "set_role") {
      const { user_id, role } = body;
      if (!user_id || !role) return json({ error: "user_id & role required" }, 400);
      if (!["admin", "moderator", "user"].includes(role))
        return json({ error: "invalid role" }, 400);
      // Replace roles for this user with the single specified role
      await admin.from("user_roles").delete().eq("user_id", user_id);
      const { error } = await admin
        .from("user_roles")
        .insert({ user_id, role });
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e: any) {
    return json({ error: e.message ?? String(e) }, 500);
  }
});