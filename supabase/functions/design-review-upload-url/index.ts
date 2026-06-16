import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "design-review-docs";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = await req.json().catch(() => null) as
      | { token?: string; boq_item_id?: string; ext?: string; file_name?: string }
      | null;
    if (!body || typeof body.token !== "string" || typeof body.boq_item_id !== "string") {
      return new Response(JSON.stringify({ error: "token and boq_item_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = body.token.trim();
    const boqItemId = body.boq_item_id.trim();
    const ext = (body.ext || "bin").toString().replace(/[^a-zA-Z0-9]+/g, "").slice(0, 10) || "bin";
    if (!/^[0-9a-f-]{36}$/i.test(token)) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (boqItemId.length === 0 || boqItemId.length > 256 || /[\/\\..]/.test(boqItemId)) {
      return new Response(JSON.stringify({ error: "Invalid boq_item_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Validate the review token is open and not expired.
    const { data: review, error: reviewErr } = await admin
      .from("boq_design_reviews")
      .select("id, status, expires_at")
      .eq("token", token)
      .maybeSingle();
    if (reviewErr || !review) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (review.status !== "sent" || (review.expires_at && new Date(review.expires_at).getTime() < Date.now())) {
      return new Response(JSON.stringify({ error: "Review is not open" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const path = `${review.id}/${boqItemId}/${crypto.randomUUID()}.${ext}`;
    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (signErr || !signed) {
      return new Response(JSON.stringify({ error: signErr?.message || "Failed to sign upload URL" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        bucket: BUCKET,
        path,
        token: signed.token,
        signed_url: signed.signedUrl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});