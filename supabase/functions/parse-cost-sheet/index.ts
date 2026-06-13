import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are an expert at extracting structured data from Indian engineering company "cost sheets".
A cost sheet contains: a customer/company name, addresses, and one or more SECTIONS (e.g. "PRE-CLEANING SECTION 30TPH", "CLEANING SECTION", "MILLING SECTION", "PACKING SECTION", "GMS SECTION"). Each section has a summary line on a front/index page AND a DETAIL page later in the PDF that lists individual machines/items in a table with columns like S.No, Machine / Description, Qty, Make, Price.

CUSTOMER / ADDRESS EXTRACTION (do this every time):
- ALWAYS populate bill_to.name, bill_to.address, bill_to.gstin, bill_to.state, AND ship_to.name, ship_to.address, ship_to.gstin, ship_to.state whenever those values appear anywhere in the PDF (cover page, header block, "Buyer", "Bill To", "Ship To", "Consignee", "Customer Details", footer, etc.).
- GSTIN is a 15-character alphanumeric code (2 digits + 5 letters + 4 digits + 1 letter + 1 digit + Z + 1 alphanumeric). It may be labelled GSTIN, GST No., GST No, GST Number, GST IN, GST #, GST Reg. No., or simply "GST". Strip all whitespace and return the raw 15-char code in the gstin field.
- State may be labelled "State", "State Name", "State :", or appear as "State Name : Uttar Pradesh, Code : 09". Return the full state name (e.g. "Uttar Pradesh"), NOT the 2-digit code.
- If only ONE address block is printed on the cost sheet, copy the same name, address, gstin and state into BOTH bill_to and ship_to.
- If a GSTIN is present but the state name is missing, INFER the state from the first 2 digits of the GSTIN using the standard Indian GST state-code map: 01 Jammu and Kashmir, 02 Himachal Pradesh, 03 Punjab, 04 Chandigarh, 05 Uttarakhand, 06 Haryana, 07 Delhi, 08 Rajasthan, 09 Uttar Pradesh, 10 Bihar, 11 Sikkim, 12 Arunachal Pradesh, 13 Nagaland, 14 Manipur, 15 Mizoram, 16 Tripura, 17 Meghalaya, 18 Assam, 19 West Bengal, 20 Jharkhand, 21 Odisha, 22 Chhattisgarh, 23 Madhya Pradesh, 24 Gujarat, 25 Daman and Diu, 26 Dadra and Nagar Haveli, 27 Maharashtra, 28 Andhra Pradesh (Old), 29 Karnataka, 30 Goa, 31 Lakshadweep, 32 Kerala, 33 Tamil Nadu, 34 Puducherry, 35 Andaman and Nicobar, 36 Telangana, 37 Andhra Pradesh, 38 Ladakh.
- Never leave gstin or state blank if the information is anywhere on the PDF or can be inferred from the GSTIN prefix.

EXTRACTION BOUNDARY (read this first):
The authoritative source of line items is the DETAIL PAGES of the PDF — i.e. everything that appears AFTER the "Terms & Conditions" page and BEFORE the "Client Scope" / "Customer Scope" page. Every machine / equipment row in that range (across Pre-Cleaning, Cleaning, Milling/Grinding, Refraction, Packing, GMS, Bagging, Material Handling, Magnets, Centrifugal Fans, Spouting / Aspiration Ducting, etc.) MUST be returned as its own line item. Do NOT stop at the "Cost of Project" summary table on the front pages — that table is only an index, never the source of items for sections that have detail pages.
The "Client Scope" / "Customer Scope" section and anything after it is OUT OF SCOPE — never return those rows.

CRITICAL EXTRACTION RULES:
1. SECTION TOTAL vs DETAIL ITEMS — apply per section:
   a. If the section HAS a detail page / sub-table listing individual machines (e.g. Pre-Cleaning, Cleaning, Milling, Refraction, Packing, GMS Section, Bagging, Material Handling, Magnets, Centrifugal Fans, Spouting / Aspiration Ducting), DO NOT return the section total. You MUST open the detail page later in the PDF and return ONE line item per machine / equipment row in that section's detail table.
      Example: "PRE-CLEANING SECTION (CAP-30TPH) ... Rs. 20,03,914.99" appears on the Cost of Project summary page. The Pre-Cleaning detail page later in the PDF lists ~4 individual machines — you must return those 4 machines (each as its own line item with its own price), NOT the Rs. 20,03,914.99 summary row.
      The same rule applies to every other summary row that has a corresponding detail page. Do this even when the description ends with words like "approx" or "approx*".
      Other example:
        - "Pre-Cleaner Separator -MRSP- SD-15 (F)" qty 1 amount 1662114.22 make MR
        - "Drum Sieve MRDS-90" qty 1 amount 211003.36 make MR
        - …etc for every row in that section's table.
      WARNING: Returning a Cost-of-Project summary row as a single line item (e.g. "PRE-CLEANING SECTION (CAP-30TPH)" with one big amount) is INCORRECT and forbidden whenever a detail table exists for that section. Always drill down.
   b. If the section has NO detail page / sub-table — it is just a single named line on the cost-of-project / other-charges page (e.g. Consultancy Charge, Pulley, Erection, Installation, Freight, Commissioning, Civil Work, Electrical Work, any one-line direct charge) — return ONE line item using the section name as the description and the section total as the amount (qty 1, unit_rate = amount). Tag make per the same MR/GMS/OTHER rules.
   c. CLIENT SCOPE items must be EXCLUDED entirely. Do not return any line item that appears under a "Client Scope" / "Customer Scope" / "By Client" / "In Client Scope" heading or column. The user will add them manually if needed.
2. For the description, use the FIRST line of the "Machine / Description" cell (the model name like "Pre-Cleaner Separator -MRSP- SD-15 (F)"). Do NOT include the bullet-point characteristics that follow.
3. MAKE_LABEL — REQUIRED FOR EVERY ROW WHEN A "MAKE" COLUMN IS PRESENT.
   For every line item, capture the verbatim text of the "Make" cell from the detail table into the make_label field, exactly as printed (preserve punctuation, spaces, brackets; collapse line breaks into a single space). Examples that MUST be returned exactly: "M.R. Engineers", "GMS (Ugur)", "M.R. Engg. (Halmark)", "M.R. Engg", "M.R.Engg / Fowler Westrup". Do NOT abbreviate to just "MR" or "GMS" — that is what the separate make enum is for. Do NOT append the make to the description; keep the description clean (model name only).
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

9. SUMMARY TOTALS (mandatory when present on the Cost of Project / summary page):
   a. total_a — the sub-total printed against "Total (A)" / "Total A" / "Sub Total A" on the Cost of Project page (machinery / equipment sections sub-total).
   b. total_other_b — the sub-total printed against "Total (Other B)" / "Total Other B" / "Total B" / "Other Charges Total" on the Cost of Project / Other Charges page.
   c. cost_of_project — the printed "Cost of Project" / "Total Cost of Project" / "Total (A + B)" amount, if shown. If only A and B are shown, leave cost_of_project blank — the app will compute A+B itself.
   d. client_scope_amount — the total amount printed against "Client Scope" / "Customer Scope" / "By Client" section (if a total is shown). If the Client Scope page lists individual items with prices but no total, sum those prices and return the sum.
   e. cost_sheet_date — the date printed on the cost sheet (any standard format; return as-is).
   All five fields must be plain numbers (no commas, no currency symbols); date is a string. Omit a field only if it is genuinely not printed anywhere on the PDF.

10. NEW LANDSCAPE COST-SHEET COLUMNS (additive — do not break old portrait sheets):
    The newer landscape-format cost sheet may include, after the Price / Amount column on the detail tables, the following columns:
      - "Motor" (motor model / spec text, sometimes split across lines — collapse to one line)
      - "Motor Qty" / "Motor Quantity"
      - "Motor Price" (numeric, ₹; strip "Rs." and commas)
      - "Remarks" (free text)
    For every line item, when ANY of these columns appears anywhere in the detail table, return ALL four fields for EVERY row in that table — even if some cells are blank — using the exact JSON keys: motor (string), motor_quantity (number), motor_price (number), remarks (string).
    Rules:
      - motor: copy verbatim text; if the cell spans multiple lines, join with a single space; if blank → omit field.
      - motor_quantity: parse as a number; "2", "2 Nos", "2.0" → 2. If blank → omit.
      - motor_price: parse the numeric Rupee value; "Rs. 12,345.50", "₹12345", "12,345" → 12345.5. If blank → omit.
      - remarks: verbatim free text; blank → omit.
    Do NOT invent values, do NOT copy the description into motor, and do NOT abbreviate. Old portrait cost sheets without these columns must still parse exactly as before (just omit all four fields).
    Example landscape row → JSON:
      Row: "Pre-Cleaner -MRSP- SD-15 | Qty 1 | ₹16,62,114 | Motor: 5.5 kW ABB | Qty 1 | ₹45,000 | Remarks: Includes coupling"
      JSON: { "description": "Pre-Cleaner -MRSP- SD-15", "quantity": 1, "unit_rate": 1662114, "amount": 1662114, "motor": "5.5 kW ABB", "motor_quantity": 1, "motor_price": 45000, "remarks": "Includes coupling" }

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

    // Optional auth — app currently runs without sign-in, so allow anonymous calls.
    const auth = req.headers.get("Authorization") || "";
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    let userId: string | null = null;
    if (auth && auth !== `Bearer ${ANON_KEY}`) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: auth } },
      });
      const { data: userData } = await userClient.auth.getUser();
      userId = userData.user?.id ?? null;
    }

    const body = await req.json().catch(() => ({}));
    const costSheetId = body.cost_sheet_id;
    if (!costSheetId || typeof costSheetId !== "string") {
      return new Response(JSON.stringify({ error: "cost_sheet_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Rate limiting: cap total AI parses across the project to protect LOVABLE_API_KEY credits.
    // Counts cost sheets that were marked "parsing" or "parsed" in the past hour.
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { count: recentParses } = await admin
      .from("cost_sheets")
      .select("id", { count: "exact", head: true })
      .in("status", ["parsing", "parsed"])
      .gte("updated_at", oneHourAgo);
    const HOURLY_LIMIT = 30;
    if ((recentParses ?? 0) >= HOURLY_LIMIT) {
      return new Response(
        JSON.stringify({ error: "Parsing rate limit reached. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Load cost sheet (and verify ownership)
    const { data: sheet, error: sheetErr } = await admin
      .from("cost_sheets").select("*").eq("id", costSheetId).maybeSingle();
    if (sheetErr || !sheet) {
      return new Response(JSON.stringify({ error: "Cost sheet not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // If the sheet is owned by a user, only that user may parse it.
    // Anonymous-uploaded sheets (user_id null) are open.
    if (sheet.user_id && sheet.user_id !== userId) {
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

    // Heavy work (download + AI call) runs in the background so the HTTP
    // request returns immediately. Edge Functions enforce a 150s idle timeout
    // on the response — Gemini parsing of large PDFs can exceed that. The
    // client listens to realtime updates on `cost_sheets` to pick up progress
    // and the final `parsed` row.
    const runParse = async () => {
      try {
    const dl = await admin.storage.from("cost-sheets").download(sheet.file_path);
    if (dl.error || !dl.data) {
      await admin.from("cost_sheets").update({ status: "failed", parse_error: `File not found: ${dl.error?.message}` }).eq("id", costSheetId);
        return;
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
            cost_sheet_date: { type: "string", description: "Date printed on the cost sheet, as-is." },
            total_a: { type: "number", description: "Sub-total against 'Total (A)' on the Cost of Project page (machinery sections)." },
            total_other_b: { type: "number", description: "Sub-total against 'Total (Other B)' / 'Other Charges Total' on the Cost of Project page." },
            cost_of_project: { type: "number", description: "Printed 'Cost of Project' / 'Total (A+B)' amount, if shown." },
            client_scope_amount: { type: "number", description: "Total amount of the Client Scope / Customer Scope section, if shown (or sum of its items)." },
            line_items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  hsn_code: { type: "string" },
                  make_label: { type: "string", description: "Verbatim 'Make' value from the cost sheet detail table, e.g. 'M.R. Engineers', 'GMS (Ugur)', 'M.R. Engg. (Halmark)'." },
                  quantity: { type: "number" },
                  unit_rate: { type: "number" },
                  amount: { type: "number" },
                  make: { type: "string", enum: ["MR", "GMS", "OTHER"], description: "Which company makes this item: MR (M.R. Engineers / Fowler Westrup), GMS, or OTHER (third-party)." },
                  motor: { type: "string", description: "Motor model / spec text from the new landscape cost-sheet 'Motor' column. Omit if blank." },
                  motor_quantity: { type: "number", description: "Motor quantity from the new 'Motor Qty' column. Omit if blank." },
                  motor_price: { type: "number", description: "Motor price (₹) from the new 'Motor Price' column. Omit if blank." },
                  remarks: { type: "string", description: "Free-text remarks from the 'Remarks' column. Omit if blank." },
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
              { type: "text", text: "Extract structured data from this cost sheet PDF. Always fill bill_to and ship_to including GSTIN and State (infer state from the first 2 digits of GSTIN if needed). Return individual machines from each section's detail page, NOT section totals." },
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
        return;
    }

    const aiJson = await aiRes.json();
    const call = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) {
      await admin.from("cost_sheets").update({ status: "failed", parse_error: "No structured output returned" }).eq("id", costSheetId);
        return;
    }

    let extracted: Record<string, unknown> = {};
    try { extracted = JSON.parse(call.function.arguments); } catch (e) {
      console.error("JSON parse error:", e, call.function.arguments);
      await admin.from("cost_sheets").update({ status: "failed", parse_error: "Malformed AI response" }).eq("id", costSheetId);
        return;
    }

    // Compute amounts where missing
    function toNum(v: unknown): number | undefined {
      if (v == null) return undefined;
      if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
      const s = String(v).replace(/[₹$,\s]/g, "").replace(/[^\d.\-]/g, "");
      if (!s) return undefined;
      const n = Number(s);
      return Number.isFinite(n) ? n : undefined;
    }
    const items = Array.isArray((extracted as { line_items?: unknown[] }).line_items)
      ? (extracted as { line_items: Array<Record<string, unknown>> }).line_items.map((it) => {
          const out: Record<string, unknown> = { ...it };
          // Accept alternate AI key spellings for motor fields.
          const mq = out.motor_quantity ?? (it as Record<string, unknown>).motor_qty ?? (it as Record<string, unknown>).motorQty;
          const mp = out.motor_price ?? (it as Record<string, unknown>).motorPrice;
          const mqN = toNum(mq);
          const mpN = toNum(mp);
          if (mqN !== undefined && mqN > 0) out.motor_quantity = mqN; else delete out.motor_quantity;
          if (mpN !== undefined && mpN > 0) out.motor_price = mpN; else delete out.motor_price;
          if (typeof out.motor === "string" && !out.motor.trim()) delete out.motor;
          if (typeof out.remarks === "string" && !out.remarks.trim()) delete out.remarks;
          const amt = typeof out.amount === "number" && out.amount > 0
            ? out.amount
            : (Number(out.quantity) || 0) * (Number(out.unit_rate) || 0);
          out.amount = amt;
          return out;
        })
      : [];
    extracted.line_items = items;
    // Diagnostic: surface how many rows carried motor data so users can tell
    // whether the PDF actually had landscape motor columns vs. an extraction miss.
    const motorCount = items.filter((it) => {
      const x = it as Record<string, unknown>;
      return (typeof x.motor === "string" && (x.motor as string).trim()) ||
        (typeof x.motor_price === "number" && (x.motor_price as number) > 0) ||
        (typeof x.motor_quantity === "number" && (x.motor_quantity as number) > 0);
    }).length;
    console.log(`[parse-cost-sheet] ${sheet.original_filename}: ${items.length} items, ${motorCount} with motor data`);

    await admin.from("cost_sheets").update({
      status: "parsed", extracted, parse_error: null,
    }).eq("id", costSheetId);
      } catch (e) {
        console.error("parse-cost-sheet background error:", e);
        await admin.from("cost_sheets").update({
          status: "failed",
          parse_error: e instanceof Error ? e.message : "Unknown error",
        }).eq("id", costSheetId);
      }
    };

    // Fire-and-forget; keep the worker alive until parsing completes.
    const ER = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
    if (ER?.waitUntil) ER.waitUntil(runParse()); else runParse();

    return new Response(JSON.stringify({ status: "processing", cost_sheet_id: costSheetId }), {
      status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-cost-sheet error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});