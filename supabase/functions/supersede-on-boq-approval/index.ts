import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  boq_id: string;
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
    if (!body?.boq_id) {
      return new Response(JSON.stringify({ error: "boq_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. Validate BOQ + resolve family root.
    const { data: boq } = await admin
      .from("boqs")
      .select("id, order_id, revision, verification_status, user_id")
      .eq("id", body.boq_id)
      .maybeSingle();
    if (!boq || boq.verification_status !== "approved") {
      return new Response(JSON.stringify({ error: "BOQ not approved" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Ownership / admin check — prevent any authenticated user from probing
    // arbitrary BOQ families (which would leak requisition numbers via errors).
    const { data: adminRow } = await admin
      .from("user_roles").select("role")
      .eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    const isAdmin = !!adminRow;
    if (!isAdmin && boq.user_id && boq.user_id !== userData.user.id) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: order } = await admin
      .from("orders").select("id, parent_order_id").eq("id", boq.order_id).maybeSingle();
    const root = order?.parent_order_id || order?.id;
    if (!root) {
      return new Response(JSON.stringify({ error: "order family not found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Verify it is the highest approved revision in family.
    const { data: famOrders } = await admin
      .from("orders").select("id").or(`id.eq.${root},parent_order_id.eq.${root}`);
    const famOrderIds = (famOrders || []).map((o: { id: string }) => o.id);
    const { data: latestRow } = await admin
      .from("boqs").select("id, revision")
      .in("order_id", famOrderIds)
      .eq("verification_status", "approved")
      .order("revision", { ascending: false }).limit(1).maybeSingle();
    if (!latestRow || latestRow.id !== boq.id) {
      return new Response(JSON.stringify({ ok: true, skipped: "not_latest_revision" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Find open older requisitions in family.
    const { data: oldReqs } = await admin
      .from("requisitions")
      .select("id, requisition_number, boq_revision, status, notes")
      .eq("order_root_id", root)
      .in("status", ["draft", "issued", "in_purchase"])
      .lt("boq_revision", boq.revision ?? 0);

    const result = {
      requisitions_created: 0,
      requisitions_closed: 0,
      annexures_cancelled: 0,
      annexures_locked_for_review: 0,
      errors: [] as string[],
    };

    for (const old of (oldReqs || []) as Array<{ id: string; requisition_number: string; boq_revision: number; notes: string | null }>) {
      // Items the user originally selected
      const { data: items } = await admin
        .from("requisition_items").select("boq_item_id").eq("requisition_id", old.id);
      const selectedIds = ((items || []) as Array<{ boq_item_id: string }>).map((x) => x.boq_item_id).filter(Boolean);

      // Invoke create-requisition via internal HTTP using caller's auth.
      const invokeRes = await fetch(`${SUPABASE_URL}/functions/v1/create-requisition`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          boq_id: boq.id,
          notes: old.notes ?? null,
          selected_boq_item_ids: selectedIds.length ? selectedIds : undefined,
        }),
      });
      const invokeJson = await invokeRes.json().catch(() => ({}));
      if (!invokeRes.ok || !invokeJson?.requisition?.id) {
        result.errors.push(`Regenerate failed for ${old.requisition_number}: ${invokeJson?.error || invokeRes.statusText}`);
        continue;
      }
      const newReqId = invokeJson.requisition.id as string;
      result.requisitions_created++;

      // Close old + point superseded_by_id at the new requisition.
      await admin.from("requisitions").update({
        status: "closed",
        superseded_by_id: newReqId,
        updated_at: new Date().toISOString(),
      }).eq("id", old.id);
      result.requisitions_closed++;

      // Cancel old annexures that don't have a PO yet; lock those that do.
      const { data: annexures } = await admin
        .from("requisition_annexures")
        .select("id, status, requisition_ids, needs_refresh")
        .contains("requisition_ids", [old.id]);
      for (const a of (annexures || []) as Array<{ id: string; status: string | null; needs_refresh: boolean }>) {
        if ((a.status || "active") !== "active") continue;
        // Check PO link via source_rm_ids
        const { data: arows } = await admin
          .from("requisition_annexure_rows").select("source_rm_ids").eq("annexure_id", a.id);
        const rmIds: string[] = [];
        for (const r of (arows || []) as Array<{ source_rm_ids: string[] | null }>) {
          if (Array.isArray(r.source_rm_ids)) rmIds.push(...r.source_rm_ids);
        }
        let hasPo = false;
        if (rmIds.length) {
          const { data: poRows } = await admin
            .from("purchase_order_rows").select("id").in("raw_material_id", rmIds).limit(1);
          hasPo = (poRows || []).length > 0;
        }
        if (hasPo) {
          // Keep annexure active, keep needs_refresh flag so UI shows "locked - PO issued".
          await admin.from("requisition_annexures").update({
            needs_refresh: true,
            updated_at: new Date().toISOString(),
          }).eq("id", a.id);
          result.annexures_locked_for_review++;
        } else {
          await admin.from("requisition_annexures").update({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
            cancelled_by: userData.user.id,
            cancel_reason: `Superseded by BOQ R${boq.revision}`,
            needs_refresh: false,
            updated_at: new Date().toISOString(),
          }).eq("id", a.id);
          result.annexures_cancelled++;
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});