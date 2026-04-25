import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are an expert at extracting structured data from Indian engineering company "cost sheets".
A cost sheet contains: a customer/company name, addresses, and one or more SECTIONS (e.g. "PRE-CLEANING SECTION 30TPH", "CLEANING SECTION", "MILLING SECTION", "PACKING SECTION", "GMS SECTION"). Each section has a summary line on a front/index page AND a DETAIL page later in the PDF that lists individual machines/items in a table with columns like S.No, Machine / Description, Qty, Make, Price.

CRITICAL EXTRACTION RULES:
1. SECTION TOTAL vs DETAIL ITEMS — apply per section:
   a. If the section HAS a detail page / sub-table listing individual machines (e.g. Pre-Cleaning, Cleaning, Milling, Packing, GMS Section, Bagging), DO NOT return the section total. Open the detail page and return ONE line item per machine row.
      Example: "PRE-CLEANING SECTION 30TPH ... Rs. 45,00,000" → return each machine separately:
        - "Pre-Cleaner Separator -MRSP- SD-15 (F)" qty 1 amount 1662114.22 make MR
        - "Drum Sieve MRDS-90" qty 1 amount 211003.36 make MR
        - …etc for every row in that section's table.
   b. If the section has NO detail page / sub-table — it is just a single named line on the cost-of-project / other-charges page (e.g. Consultancy Charge, Pulley, Erection, Installation, Freight, Commissioning, Civil Work, Electrical Work, any one-line direct charge) — return ONE line item using the section name as the description and the section total as the amount (qty 1, unit_rate = amount). Tag make per the same MR/GMS/OTHER rules.
   c. CLIENT SCOPE items must be EXCLUDED entirely. Do not return any line item that appears under a "Client Scope" / "Customer Scope" / "By Client" / "In Client Scope" heading or column. The user will add them manually if needed.
2. For the description, use the FIRST line of the "Machine / Description" cell (the model name like "Pre-Cleaner Separator -MRSP- SD-15 (F)"). Do NOT include the bullet-point characteristics that follow.
3. Append the Make (e.g. "M.R.Engg (Fowler Westrup)") to the description in parentheses if present, e.g. "Pre-Cleaner Separator -MRSP- SD-15 (F) (M.R.Engg / Fowler Westrup)".
4. Quantity = the Qty column. Amount = the Price column (strip "Rs.", commas). If unit_rate is not printed, set unit_rate = amount / quantity.
5. If a row's price is blank/missing, still include the item with quantity from the table and amount = 0 (the user will fill it in manually).
6. Process EVERY section (Pre-Cleaning, Cleaning, Milling/Grinding, Packing, GMS, Bagging, Other Charges, Cost of Project, etc.) and EVERY machine in each section that has a detail table; for sections without a detail table, follow rule 1b. Do not skip pages. Do not return Client Scope items (rule 1c).
7. Charges (P&F, insurance, freight, GST, discount) come from the summary/totals page — extract those into the charges object, NOT as line items.
   EXCEPTION: if "Freight", "Insurance" or "P&F" appears as a NAMED line under Cost of Project / Other (not as a percentage charge on the totals page), prefer putting it in the charges object; only return it as a line item if it cannot reasonably be mapped to one of those charge fields.
8. MAKE CLASSIFICATION (very important — drives which OA template is used):
   - For EVERY line item, set "make" to one of: "MR", "GMS", or "OTHER".
   - "MR"  → Make column contains MR / M.R. / M.R.Engg / MR Engineers / Fowler Westrup, OR description / model code starts with "MR" (e.g. MRSP, MRDS, MROA).
   - "GMS" → Make column contains GMS, OR the section heading is a GMS section, OR the description / model code contains "GMS".
   - "OTHER" → anything else (third-party bought-out items). Default unknowns to "OTHER".
   The user will generate a separate OA per make (one MR OA, one GMS OA), so accuracy here matters more than the description text.

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
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
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

    // Mark as parsing — stage: downloading
    await admin.from("cost_sheets").update({
      status: "parsing",
      parse_error: null,
      extracted: { _progress: { stage: "downloading", percent: 10, message: "Fetching PDF…" } },
    }).eq("id", costSheetId);

    // Download the file
    const dl = await admin.storage.from("cost-sheets").download(sheet.file_path);
    if (dl.error || !dl.data) {
      await admin.from("cost_sheets").update({ status: "failed", parse_error: `File not found: ${dl.error?.message}` }).eq("id", costSheetId);
      return new Response(JSON.stringify({ error: `File not found: ${dl.error?.message}` }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const ab = await dl.data.arrayBuffer();
    const base64 = arrayBufferToBase64(ab);

    // Stage: sending to AI
    await admin.from("cost_sheets").update({
      extracted: { _progress: { stage: "uploading_ai", percent: 35, message: "Sending PDF to AI…" } },
    }).eq("id", costSheetId);

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
                  make: { type: "string", enum: ["MR", "GMS", "OTHER"], description: "Which company makes this item: MR (M.R. Engineers / Fowler Westrup), GMS, or OTHER (third-party)." },
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
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract structured data from this cost sheet PDF. Remember: return individual machines from each section's detail page, NOT section totals." },
              { type: "file", file: { filename: sheet.original_filename, file_data: `data:application/pdf;base64,${base64}` } },
            ],
          },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "extract_cost_sheet" } },
      }),
    });

    // Stage: AI is processing / response received
    await admin.from("cost_sheets").update({
      extracted: { _progress: { stage: "extracting", percent: 75, message: "AI is extracting fields…" } },
    }).eq("id", costSheetId);

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