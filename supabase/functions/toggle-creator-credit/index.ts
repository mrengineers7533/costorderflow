// Admin-only endpoint to hide/show the "Built by Sanjeev Kumar" creator credit.
// PIN is verified server-side against the WATERMARK_REMOVAL_PIN secret.
// Every attempt (success or failure) is logged to credit_removal_attempts.
//
// Usage (out-of-band, not exposed in the app UI):
//   curl -X POST https://<project>.functions.supabase.co/toggle-creator-credit \
//     -H "Content-Type: application/json" \
//     -H "apikey: <anon key>" \
//     -d '{"pin":"123456","action":"hide"}'

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const requesterIp =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";

  let body: { pin?: unknown; action?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid request body." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const pin = typeof body.pin === "string" ? body.pin : "";
  const action = body.action === "show" ? "show" : body.action === "hide" ? "hide" : null;

  if (!action) {
    return new Response(
      JSON.stringify({ error: "Action must be 'hide' or 'show'." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const expected = Deno.env.get("WATERMARK_REMOVAL_PIN") || "";
  const validFormat = /^\d{6}$/.test(pin);
  const pinOk = validFormat && expected.length > 0 && timingSafeEqual(pin, expected);

  // Brute-force protection: lock out an IP after 10 failed attempts in the past hour.
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { data: recentFails } = await supabase
    .from("credit_removal_attempts")
    .select("id")
    .eq("user_identifier", requesterIp)
    .eq("success", false)
    .gte("attempted_at", oneHourAgo);
  if ((recentFails?.length ?? 0) >= 10) {
    await supabase.from("credit_removal_attempts").insert({
      success: false,
      action,
      user_identifier: requesterIp,
    });
    return new Response(
      JSON.stringify({ error: "Too many attempts. Try again later." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Log attempt regardless of outcome.
  await supabase.from("credit_removal_attempts").insert({
    success: pinOk,
    action,
    user_identifier: requesterIp,
  });

  if (!pinOk) {
    return new Response(
      JSON.stringify({
        error: "Invalid PIN. You are not authorized to remove creator credit.",
      }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { error } = await supabase
    .from("app_settings")
    .upsert({
      key: "creator_credit",
      value: { visible: action === "show" },
      updated_at: new Date().toISOString(),
    });

  if (error) {
    return new Response(
      JSON.stringify({ error: "Failed to update setting." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ ok: true, visible: action === "show" }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});