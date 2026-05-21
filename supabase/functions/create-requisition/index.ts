import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body { boq_id: string; notes?: string }

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
    if (!body?.boq_id) {
      return new Response(JSON.stringify({ error: "boq_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: boq, error: bErr } = await admin
      .from("boqs")
      .select("id, order_id, revision, verification_status, line_items, reference_oa_number, client_name, boq_number")
      .eq("id", body.boq_id)
      .maybeSingle();
    if (bErr || !boq) {
      return new Response(JSON.stringify({ error: "BOQ not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (boq.verification_status !== "approved") {
      return new Response(JSON.stringify({ error: "BOQ is not approved" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: order } = await admin
      .from("orders").select("id, parent_order_id, oa_number")
      .eq("id", boq.order_id).maybeSingle();
    const orderRootId = order?.parent_order_id || order?.id || boq.order_id;
    const oaNumber = order?.oa_number || boq.reference_oa_number || "";

    // Ensure a family share token exists so Purchase can subscribe to "always latest".
    let familyToken: string | null = null;
    const { data: existingToken } = await admin
      .from("boq_family_share_tokens").select("token")
      .eq("order_root_id", orderRootId).maybeSingle();
    if (existingToken?.token) {
      familyToken = existingToken.token as string;
    } else {
      const { data: ins } = await admin
        .from("boq_family_share_tokens")
        .insert({ order_root_id: orderRootId, created_by: userData.user.id })
        .select("token").single();
      familyToken = ins?.token as string;
    }

    const { data: reqNum, error: rnErr } = await admin.rpc("next_requisition_number", {
      _root: orderRootId, _oa_number: oaNumber, _revision: boq.revision ?? 0,
    });
    if (rnErr) throw rnErr;

    const { data: created, error: cErr } = await admin.from("requisitions").insert({
      requisition_number: reqNum,
      order_root_id: orderRootId,
      boq_id: boq.id,
      boq_revision: boq.revision ?? 0,
      family_token: familyToken,
      notes: body.notes ?? null,
      user_id: userData.user.id,
      status: "issued",
    }).select("*").single();
    if (cErr) throw cErr;

    const lineItems = Array.isArray(boq.line_items) ? boq.line_items : [];
    if (lineItems.length) {
      // deno-lint-ignore no-explicit-any
      const rows = lineItems.map((it: any) => ({
        requisition_id: created.id,
        boq_item_id: it.id,
        item_no: it.item_no ?? null,
        model_number: it.model_number ?? null,
        description: it.description ?? null,
        quantity: it.quantity ?? null,
        unit: it.unit ?? null,
        remarks: it.remarks ?? null,
        fg_snapshot: it,
      }));
      const { error: itErr } = await admin.from("requisition_items").insert(rows);
      if (itErr) throw itErr;
    }

    return new Response(JSON.stringify({ requisition: created }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});