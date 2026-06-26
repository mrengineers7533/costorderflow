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
    if (!verification_url || !boq_id) {
      return new Response(JSON.stringify({ error: "boq_id and verification_url required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate verification_url: must be a well-formed https URL whose origin
    // matches an allow-listed app origin. Prevents attackers from sending a
    // phishing link to the configured BOQ verifier.
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(verification_url);
    } catch {
      return new Response(JSON.stringify({ error: "invalid verification_url" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (parsedUrl.protocol !== "https:") {
      return new Response(JSON.stringify({ error: "verification_url must be https" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const allowed = (Deno.env.get("APP_URL_ALLOWLIST") || "")
      .split(",").map((s) => s.trim()).filter(Boolean);
    // Fail closed: if the allowlist is unconfigured, reject all URLs so an
    // authenticated caller can't smuggle arbitrary links into the verifier email.
    if (allowed.length === 0 || !allowed.includes(parsedUrl.origin)) {
      return new Response(JSON.stringify({ error: "verification_url origin not allowed" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Ownership / doc-access check: caller must own the BOQ, be admin, or have
    // edit access via document_access. Prevents arbitrary users from spamming
    // the configured verifier for BOQs they don't control.
    const { data: boqRow, error: boqErr } = await supabase
      .from("boqs").select("id, user_id").eq("id", boq_id).maybeSingle();
    if (boqErr || !boqRow) {
      return new Response(JSON.stringify({ error: "boq not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: adminRow } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    const isAdmin = !!adminRow;
    let canTrigger = isAdmin || boqRow.user_id === userData.user.id;
    if (!canTrigger) {
      const { data: rpc } = await supabase.rpc("has_doc_access", {
        _user: userData.user.id, _kind: "boq", _doc_id: boq_id, _need: "edit",
      });
      canTrigger = !!rpc;
    }
    if (!canTrigger) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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