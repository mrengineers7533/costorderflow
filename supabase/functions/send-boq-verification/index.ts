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

    return new Response(JSON.stringify({ queued: true, recipient }), {
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