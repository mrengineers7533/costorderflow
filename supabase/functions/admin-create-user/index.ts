import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_MODULES = new Set([
  "dashboard", "orders", "boqs", "pi", "workflow",
  "purchase", "manufacturing", "requisitions", "raw_materials", "reports",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.id) return json({ error: "Unauthorized" }, 401);
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: roleRows, error: roleErr } = await admin
      .from("user_roles").select("role").eq("user_id", callerId);
    if (roleErr) return json({ error: roleErr.message }, 500);
    const isAdmin = (roleRows ?? []).some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const full_name = body?.full_name ? String(body.full_name).trim() : null;
    const password = body?.password ? String(body.password) : null;
    const send_invite = body?.send_invite === true;
    const make_admin = body?.is_admin === true;
    const modules: string[] = Array.isArray(body?.modules)
      ? body.modules.filter((m: unknown) => typeof m === "string" && ALLOWED_MODULES.has(m))
      : [];

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ error: "Valid email is required" }, 400);
    }
    if (!password && !send_invite) {
      return json({ error: "Provide a password or choose to send invite" }, 400);
    }
    if (password && password.length < 8) {
      return json({ error: "Password must be at least 8 characters" }, 400);
    }

    // Domain check (allowed_domains is the source of truth used elsewhere)
    const domain = email.split("@")[1];
    const { data: domData } = await admin
      .from("allowed_domains").select("domain").eq("domain", domain).maybeSingle();
    if (!domData) return json({ error: `Email domain "${domain}" is not allowed` }, 400);

    // Create or invite the user
    let newUserId: string | null = null;
    if (password) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: full_name ? { full_name } : {},
      });
      if (error) return json({ error: error.message }, 400);
      newUserId = data.user?.id ?? null;
    } else {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: full_name ? { full_name } : {},
      });
      if (error) return json({ error: error.message }, 400);
      newUserId = data.user?.id ?? null;
    }
    if (!newUserId) return json({ error: "Failed to create user" }, 500);

    // handle_new_user trigger creates profile + base role.
    // If admin requested, ensure admin role exists.
    if (make_admin) {
      await admin.from("user_roles").upsert(
        { user_id: newUserId, role: "admin" },
        { onConflict: "user_id,role" },
      );
    }

    // Insert module access rows (ignored if user is admin; harmless either way)
    if (modules.length > 0) {
      const rows = modules.map((m) => ({
        user_id: newUserId!, module: m, granted_by: callerId,
      }));
      const { error: maErr } = await admin
        .from("user_module_access")
        .upsert(rows, { onConflict: "user_id,module" });
      if (maErr) return json({ error: maErr.message }, 500);
    }

    return json({ ok: true, user_id: newUserId });
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