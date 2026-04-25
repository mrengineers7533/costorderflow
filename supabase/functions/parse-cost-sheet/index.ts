import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are an expert at extracting structured data from Indian engineering company "cost sheets".
A cost sheet typically contains: a customer/company name, line items (description, HSN code, quantity, unit rate, amount), and charges such as P&F (packing & forwarding), insurance, freight, GST, and discounts.
Return your output by calling the extract_cost_sheet function. If a field is not present, omit it. Numbers must be plain numbers (no currency symbols, no commas).`;

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as never);
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Validate user
    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const costSheetId = body.cost_sheet_id;
    if (!costSheetId || typeof costSheetId !== "string") {
      return new Response(JSON.stringify({ error: "cost_sheet_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Load cost sheet (and verify ownership)
    const { data: sheet, error: sheetErr } = await admin
      .from("cost_sheets").select("*").eq("id", costSheetId).maybeSingle();
    if (sheetErr || !sheet) {
      return new Response(JSON.stringify({ error: "Cost sheet not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (sheet.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download the file
    const dl = await admin.storage.from("cost-sheets").download(sheet.file_path);
    if (dl.error || !dl.data) {
      return new Response(JSON.stringify({ error: `File not found: ${dl.error?.message}` }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const ab = await dl.data.arrayBuffer();
    const base64 = arrayBufferToBase64(ab);

    // Call Lovable AI Gateway with PDF + tool-calling schema
    const tool = {
      type: "function",
      function: {
        name: "extract_cost_sheet",
        description: "Extract structured order data from the cost sheet PDF.",
        parameters: {
          type: "object",
          properties: {
            company_name: { type: "string", description: "Customer / company name" },
            bill_to: {
              type: "object",
              properties: {
                name: { type: "string" },
                address: { type: "string" },
                gstin: { type: "string" },
                state: { type: "string" },
              },
            },
            ship_to: {
              type: "object",
              properties: {
                name: { type: "string" },
                address: { type: "string" },
                gstin: { type: "string" },
                state: { type: "string" },
              },
            },
            cost_sheet_number: { type: "string" },
            reference: { type: "string" },
            line_items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  hsn_code: { type: "string" },
                  quantity: { type: "number" },
                  unit_rate: { type: "number" },
                  amount: { type: "number" },
                },
                required: ["description", "quantity", "unit_rate"],
              },
            },
            charges: {
              type: "object",
              properties: {
                pf_percent: { type: "number" },
                pf_amount: { type: "number" },
                insurance: { type: "number" },
                freight: { type: "number" },
                gst_percent: { type: "number" },
                discount: { type: "number" },
              },
            },
            notes: { type: "string" },
          },
          required: ["line_items"],
        },
      },
    };

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract structured data from this cost sheet PDF." },
              { type: "file", file: { filename: sheet.original_filename, file_data: `data:application/pdf;base64,${base64}` } },
            ],
          },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "extract_cost_sheet" } },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, errText);
      await admin.from("cost_sheets").update({ status: "failed", parse_error: `AI ${aiRes.status}: ${errText.slice(0, 500)}` }).eq("id", costSheetId);
      const status = aiRes.status === 429 ? 429 : aiRes.status === 402 ? 402 : 500;
      const message =
        aiRes.status === 429 ? "Rate limit exceeded. Please try again in a moment." :
        aiRes.status === 402 ? "AI credits exhausted. Add credits in Settings → Workspace → Usage." :
        "AI parsing failed.";
      return new Response(JSON.stringify({ error: message }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const call = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) {
      await admin.from("cost_sheets").update({ status: "failed", parse_error: "No structured output returned" }).eq("id", costSheetId);
      return new Response(JSON.stringify({ error: "Could not extract structured data from this PDF." }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let extracted: Record<string, unknown> = {};
    try { extracted = JSON.parse(call.function.arguments); } catch (e) {
      console.error("JSON parse error:", e, call.function.arguments);
      await admin.from("cost_sheets").update({ status: "failed", parse_error: "Malformed AI response" }).eq("id", costSheetId);
      return new Response(JSON.stringify({ error: "Malformed AI response." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Compute amounts where missing
    const items = Array.isArray((extracted as { line_items?: unknown[] }).line_items)
      ? (extracted as { line_items: Array<Record<string, number>> }).line_items.map((it) => ({
          ...it,
          amount: typeof it.amount === "number" && it.amount > 0 ? it.amount : (Number(it.quantity) || 0) * (Number(it.unit_rate) || 0),
        }))
      : [];
    extracted.line_items = items;

    await admin.from("cost_sheets").update({
      status: "parsed", extracted, parse_error: null,
    }).eq("id", costSheetId);

    return new Response(JSON.stringify({ extracted }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-cost-sheet error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});