import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return json({ error: "Unauthorized" }, 401);
    }
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Confirm caller is admin
    const { data: roleRows, error: roleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    if (roleErr) return json({ error: roleErr.message }, 500);
    const isAdmin = (roleRows ?? []).some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    // Parse body
    const body = await req.json().catch(() => ({}));
    const user_id = typeof body?.user_id === "string" ? body.user_id : "";
    const new_password = typeof body?.new_password === "string" ? body.new_password : "";
    if (!user_id) return json({ error: "user_id required" }, 400);
    if (!new_password || new_password.length < 8) {
      return json({ error: "Password must be at least 8 characters" }, 400);
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(user_id, {
      password: new_password,
    });
    if (updErr) {
      const msg = updErr.message || "Failed to update password";
      const weak = /weak|easy to guess|pwned|compromis|password/i.test(msg) &&
        !/permission|not found|invalid user/i.test(msg);
      return json(
        {
          error: weak
            ? "That password is too weak or has appeared in a known data breach. Use a longer passphrase with mixed characters."
            : msg,
        },
        weak ? 400 : 500,
      );
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}