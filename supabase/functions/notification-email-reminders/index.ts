// Sends one-time reminder email for notifications older than 24h that are
// still unseen/unacknowledged and haven't received a reminder yet.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    // Notifications older than 24h
    const { data: notifs, error } = await admin
      .from('app_notifications')
      .select('id')
      .lt('created_at', cutoff)
      .gt('created_at', new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString())
      .limit(200);
    if (error) throw error;

    let queued = 0;
    for (const n of notifs || []) {
      // Skip if a reminder was already logged
      const { data: existing } = await admin
        .from('email_notification_log')
        .select('id')
        .eq('notification_id', n.id)
        .eq('kind', 'reminder')
        .limit(1);
      if (existing && existing.length > 0) continue;

      // Skip if all recipients already acknowledged
      const { data: reads } = await admin
        .from('app_notification_reads')
        .select('acknowledged_at, department')
        .eq('notification_id', n.id);
      const anyUnacked = !reads || reads.length === 0 || reads.some((r: any) => !r.acknowledged_at);
      if (!anyUnacked) continue;

      // Invoke send fn as reminder
      const { data: cfg } = await admin.from('email_notification_config').select('send_fn_url').eq('id', true).maybeSingle();
      if (!cfg?.send_fn_url) break;
      await fetch(cfg.send_fn_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_id: n.id, kind: 'reminder' }),
      }).catch(() => {});
      queued++;
    }
    return new Response(JSON.stringify({ ok: true, queued }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});