import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  boq_id: string;
  notes?: string;
  selected_boq_item_ids?: string[];
  mode?: "auto" | "manual";
  edited_items?: Array<{
    boq_item_id: string;
    is_direct_purchase?: boolean;
    raw_materials: Array<{
      make?: string | null;
      material: string;
      size_model?: string | null;
      qty_per_unit: number | null;
      unit?: string | null;
      notes?: string | null;
    }>;
  }>;
}

function firstLine(raw: unknown): string {
  if (raw == null) return "";
  let s = String(raw).replace(/\r/g, "\n");
  const line = s.split("\n").map((p) => p.trim()).find((p) => p.length > 0) ?? "";
  s = line;
  for (const m of ["•", " :- ", ":- ", " - ", " – ", " — "]) {
    const i = s.indexOf(m);
    if (i > 0) s = s.slice(0, i);
  }
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > 120) s = s.slice(0, 120).trim();
  return s;
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
    const { data: boq, error: bErr } = await admin
      .from("boqs")
      .select("id, order_id, revision, verification_status, line_items, reference_oa_number, client_name, boq_number, user_id")
      .eq("id", body.boq_id)
      .maybeSingle();
    if (bErr || !boq) {
      return new Response(JSON.stringify({ error: "BOQ not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Ownership / admin check
    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    const isAdmin = !!roleRow;
    if (!isAdmin && boq.user_id && boq.user_id !== userData.user.id) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Module gate: service-role inserts bypass RLS, so enforce the same
    // `requisitions` module check that `can_edit_module` would apply.
    if (!isAdmin) {
      const { data: modAccess } = await admin
        .from("user_module_access")
        .select("permission")
        .eq("user_id", userData.user.id)
        .eq("module", "requisitions")
        .maybeSingle();
      const canEdit = !!modAccess && (modAccess.permission ?? "edit") === "edit";
      if (!canEdit) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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

    // Determine selected items (default: all)
    const selectedSet = body.selected_boq_item_ids && body.selected_boq_item_ids.length
      ? new Set(body.selected_boq_item_ids)
      : null;
    // deno-lint-ignore no-explicit-any
    const selectedItems = lineItems.filter((it: any) =>
      selectedSet ? selectedSet.has(it.id) : true,
    );

    // Load full FG → RM master so we can fuzzy-match Column A entries
    const { data: allMaps } = await admin
      .from("fg_raw_material_map")
      .select("model_number, is_direct_purchase, raw_materials")
      .order("model_number");
    type FgMap = { model_number: string; is_direct_purchase: boolean; raw_materials: Array<{ make?: string; material: string; size_model?: string; qty_per_unit: number; unit?: string; notes?: string }> };
    const fgMaps: FgMap[] = ((allMaps as unknown as FgMap[]) || []);
    // Normalize Column A to first line defensively, in case legacy rows still
    // contain multi-line text. All matching keys below operate on this cleaned name.
    const cleanedFgMaps = fgMaps.map((m) => ({ ...m, model_number: firstLine(m.model_number) || m.model_number }));
    const fgByLower = new Map(cleanedFgMaps.map((m) => [m.model_number.toLowerCase(), m]));
    function matchFg(modelNumber?: string | null, description?: string | null): FgMap | null {
      const mn = (modelNumber || "").trim().toLowerCase();
      if (mn) {
        const exact = fgByLower.get(mn);
        if (exact) return exact;
        const contains = cleanedFgMaps.find((m) => m.model_number.toLowerCase().includes(mn));
        if (contains) return contains;
      }
      const desc = (description || "").trim().slice(0, 40).toLowerCase();
      if (desc) {
        const contains = cleanedFgMaps.find((m) => m.model_number.toLowerCase().includes(desc));
        if (contains) return contains;
      }
      return null;
    }

    let raw_material_count = 0;
    let unmapped_count = 0;

    if (selectedItems.length) {
      // deno-lint-ignore no-explicit-any
      const rows = selectedItems.map((it: any) => ({
        requisition_id: created.id,
        boq_item_id: it.id,
        item_no: it.item_no ?? null,
        model_number: it.model_number ?? null,
        description: it.description ?? null,
        quantity: it.quantity ?? null,
        unit: it.unit ?? null,
        remarks: it.remarks ?? null,
        fg_snapshot: it,
        included_in_requisition: true,
      }));
      const { data: insertedItems, error: itErr } = await admin
        .from("requisition_items").insert(rows).select("id, boq_item_id, model_number, description, quantity");
      if (itErr) throw itErr;

      // Build a lookup of edited payloads by boq_item_id (string keys)
      const editedByBoqItem = new Map<string, NonNullable<Body["edited_items"]>[number]>();
      for (const e of (body.edited_items || [])) {
        editedByBoqItem.set(String(e.boq_item_id), e);
      }

      // Generate raw material rows per inserted item
      const rmRows: Array<Record<string, unknown>> = [];
      // deno-lint-ignore no-explicit-any
      for (const ri of (insertedItems as any[]) || []) {
        const fgQty = Number(ri.quantity) || 0;
        const edited = editedByBoqItem.get(String(ri.boq_item_id));
        if (edited) {
          if (edited.is_direct_purchase) continue;
          for (const rm of (edited.raw_materials || [])) {
            if (!rm || !rm.material) continue;
            const per = Number(rm.qty_per_unit) || 0;
            rmRows.push({
              requisition_id: created.id,
              requisition_item_id: ri.id,
              model_number: ri.model_number,
              make: rm.make ?? null,
              material: rm.material,
              size_model: rm.size_model ?? null,
              qty_per_unit: per,
              fg_quantity: fgQty,
              required_qty: per * fgQty,
              unit: rm.unit ?? null,
              source: "manual",
              purchase_status: "pending",
              notes: rm.notes ?? null,
            });
            raw_material_count++;
          }
          continue;
        }
        const mapping = matchFg(ri.model_number, ri.description);
        if (mapping && !mapping.is_direct_purchase && mapping.raw_materials.length) {
          for (const rm of mapping.raw_materials) {
            const per = Number(rm.qty_per_unit) || 0;
            rmRows.push({
              requisition_id: created.id,
              requisition_item_id: ri.id,
              model_number: ri.model_number,
              make: rm.make ?? null,
              material: rm.material,
              size_model: rm.size_model ?? null,
              qty_per_unit: per,
              fg_quantity: fgQty,
              required_qty: per * fgQty,
              unit: rm.unit ?? null,
              source: "mapped",
              purchase_status: "pending",
              notes: rm.notes ?? null,
            });
          }
          raw_material_count += mapping.raw_materials.length;
        } else if (mapping && mapping.is_direct_purchase) {
          // Direct purchase FG: no RM generated
          continue;
        } else {
          // Unmapped — placeholder so Purchase sees the gap
          rmRows.push({
            requisition_id: created.id,
            requisition_item_id: ri.id,
            model_number: ri.model_number,
            make: null,
            material: "Raw Material Mapping Not Found",
            size_model: null,
            qty_per_unit: null,
            fg_quantity: fgQty,
            required_qty: null,
            unit: null,
            source: "unmapped_placeholder",
            purchase_status: "pending",
            notes: `No mapping found in Raw Material Master for "${ri.model_number || ri.description || "FG"}". Please review the mapping.`,
          });
          unmapped_count++;
        }
      }

      if (rmRows.length) {
        const { error: rmErr } = await admin.from("requisition_raw_materials").insert(rmRows);
        if (rmErr) throw rmErr;
      }
    }

    return new Response(JSON.stringify({ requisition: created, raw_material_count, unmapped_count }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});