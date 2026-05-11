import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BUCKETS = ["cost-sheets", "oa-documents", "boq-documents", "pi-documents"];
const TABLES_IN_ORDER = [
  "client_copies",
  "proforma_invoice_documents",
  "proforma_invoices",
  "boqs",
  "orders",
  "cost_sheets",
] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.id) return json({ error: "Unauthorized" }, 401);
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: roleRows, error: roleErr } = await admin
      .from("user_roles").select("role").eq("user_id", callerId);
    if (roleErr) return json({ error: roleErr.message }, 500);
    const isAdmin = (roleRows ?? []).some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const counts: Record<string, number> = {};

    // Delete table rows (children first).
    for (const t of TABLES_IN_ORDER) {
      const { count: before } = await admin.from(t).select("*", { count: "exact", head: true });
      const { error: delErr } = await admin
        .from(t).delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (delErr) return json({ error: `Delete ${t} failed: ${delErr.message}` }, 500);
      counts[t] = before ?? 0;
    }

    // Purge storage buckets.
    let filesRemoved = 0;
    for (const bucket of BUCKETS) {
      filesRemoved += await purgeBucket(admin, bucket);
    }
    counts.filesRemoved = filesRemoved;

    return json({ ok: true, counts });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

async function purgeBucket(admin: SupabaseClient, bucket: string): Promise<number> {
  let removed = 0;
  // Recursively walk the bucket.
  const walk = async (prefix: string) => {
    let offset = 0;
    while (true) {
      const { data, error } = await admin.storage.from(bucket).list(prefix, {
        limit: 1000,
        offset,
      });
      if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
      if (!data || data.length === 0) break;
      const files: string[] = [];
      const folders: string[] = [];
      for (const entry of data) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        // Folders have null id/metadata in Supabase storage list output.
        if (entry.id === null || entry.metadata === null) folders.push(path);
        else files.push(path);
      }
      if (files.length) {
        const { error: rmErr } = await admin.storage.from(bucket).remove(files);
        if (rmErr) throw new Error(`remove ${bucket}: ${rmErr.message}`);
        removed += files.length;
      }
      for (const f of folders) await walk(f);
      if (data.length < 1000) break;
      offset += 1000;
    }
  };
  try {
    await walk("");
  } catch (e) {
    console.warn(`purgeBucket ${bucket} failed`, e);
  }
  return removed;
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}