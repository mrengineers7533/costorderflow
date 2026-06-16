import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  boq_id: string;
  family_link: string;
  purchase_emails: string[];
  factory_emails: string[];
  message?: string;
  pdf_path?: string;
}

function isEmail(s: string) {
  return typeof s === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Body;
    if (!body?.boq_id || !body?.family_link) {
      return new Response(JSON.stringify({ error: "boq_id and family_link required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const purchase = (body.purchase_emails || []).filter(isEmail);
    const factory = (body.factory_emails || []).filter(isEmail);
    if (purchase.length === 0 && factory.length === 0) {
      return new Response(JSON.stringify({ error: "at least one recipient required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Verify BOQ exists and is approved
    const { data: boq, error: bErr } = await admin
      .from("boqs")
      .select("id, verification_status")
      .eq("id", body.boq_id)
      .maybeSingle();
    if (bErr || !boq) {
      return new Response(JSON.stringify({ error: "boq not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (boq.verification_status !== "approved") {
      return new Response(JSON.stringify({ error: "BOQ is not approved" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 7-day signed URL for the distribution PDF so recipients can download it.
    let signedPdfUrl: string | null = null;
    if (body.pdf_path) {
      // Only allow signing paths that live under the caller's own folder.
      const userPrefix = `${userData.user.id}/`;
      if (!body.pdf_path.startsWith(userPrefix) || body.pdf_path.includes("..")) {
        return new Response(JSON.stringify({ error: "forbidden pdf_path" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: signed } = await admin
        .storage.from("boq-documents")
        .createSignedUrl(body.pdf_path, 60 * 60 * 24 * 7);
      signedPdfUrl = signed?.signedUrl || null;
    }

    // NOTE: Email delivery requires the project's email infrastructure to be configured.
    // If/when it's set up, swap this stub for a call to the email queue.
    // For now, the distribution has already been logged client-side; we return the
    // signed PDF URL + share link so the user can forward them manually.
    return new Response(
      JSON.stringify({
        status: "logged",
        email_status: "not_configured",
        signed_pdf_url: signedPdfUrl,
        family_link: body.family_link,
        recipients: { purchase, factory },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
