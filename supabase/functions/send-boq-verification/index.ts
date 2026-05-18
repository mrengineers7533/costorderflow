import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    // Require an authenticated caller. Prevents anonymous abuse / phishing
    // by reflecting the configured verifier email or by triggering future
    // email sends with attacker-controlled URLs.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { boq_id, boq_number, oa_number, revision, verification_url } = body || {};
    if (!verification_url) {
      return new Response(JSON.stringify({ error: "verification_url required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Recipient is configurable via app_settings → 'boq_verifier' → { email }.
    const { data: setting } = await supabase
      .from("app_settings").select("value").eq("key", "boq_verifier").maybeSingle();
    const recipient = (setting?.value as { email?: string } | null)?.email || null;

    if (!recipient) {
      console.log("[send-boq-verification] skipped — no recipient configured", {
        boq_id, boq_number, oa_number, revision, verification_url,
      });
      return new Response(JSON.stringify({ skipped: true, reason: "no_recipient" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // TODO: wire actual email provider. For now, log payload so admins can
    // verify the workflow end-to-end without an email backend.
    console.log("[send-boq-verification] would send", {
      to: recipient,
      subject: `BOQ ${boq_number} R${revision} pending your verification`,
      verification_url,
      oa_number,
      boq_id,
    });

    // Do not echo recipient back — caller does not need it.
    return new Response(JSON.stringify({ queued: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-boq-verification error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});