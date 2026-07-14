// Sends a notification email via Gmail (through the connector gateway) to each
// resolved recipient. Called by a DB trigger on app_notifications insert, and
// by the notification-email-reminders function for 24h reminders.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const GATEWAY = 'https://connector-gateway.lovable.dev/google_mail/gmail/v1';
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
const GMAIL_KEY = Deno.env.get('GOOGLE_MAIL_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = Deno.env.get('APP_PUBLIC_URL') || 'https://costorderflow.lovable.app';
const FIXED_SENDER = 'pc.2@mrengineers.com';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

function b64url(s: string) {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function normalizeDept(s?: string | null) {
  return (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' ').replace(/\s+team$/, '');
}

function buildDeepLink(n: any): string {
  const base = APP_URL.replace(/\/$/, '');
  const params = new URLSearchParams({ unseen: '1' });
  if (n.related_boq_id) params.set('boq', n.related_boq_id);
  if (n.related_pi_id) params.set('pi', n.related_pi_id);
  if (n.related_po_id) params.set('po', n.related_po_id);
  if (n.related_order_root_id) params.set('order', n.related_order_root_id);
  if (n.related_requisition_id) params.set('req', n.related_requisition_id);
  if (n.related_annexure_id) params.set('annex', n.related_annexure_id);
  return `${base}/notifications?${params.toString()}`;
}

function esc(s: any) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function renderHtml(n: any, targetDept: string, kind: string, link: string, totalChanges: number): string {
  const module = (n.module || 'Notification').toString().toUpperCase();
  const docNo = n.record_ref || '—';
  const changedBy = `${n.actor_department || '—'}${n.actor_user_name ? ` / ${n.actor_user_name}` : ''}`;
  const dt = n.created_at ? new Date(n.created_at).toUTCString() : new Date().toUTCString();
  const banner = kind === 'reminder' ? 'Reminder — still pending' : 'Action Required';
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111;background:#f6f7f9;padding:24px">
    <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <div style="background:#0f172a;color:#fff;padding:16px 20px;font-size:14px">${esc(banner)} · <b>${esc(module)}</b></div>
      <div style="padding:20px;font-size:14px;line-height:1.55;color:#111">
        <p style="margin:0 0 14px">A change has been made in <b>${esc(module)}</b> for document <b>${esc(docNo)}</b>.</p>
        <table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:16px">
          <tr><td style="padding:6px 0;color:#64748b;width:170px">Document No.</td><td><b>${esc(docNo)}</b></td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Source Module/Page</td><td>${esc(module)}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Changed By</td><td>${esc(changedBy)}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Date/Time</td><td>${esc(dt)}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Total Changes</td><td>${esc(totalChanges)}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Target Department</td><td>${esc(targetDept)}</td></tr>
        </table>
        <p style="margin:0 0 18px">Please log in to GMS to review the notification and take the required action.</p>
        <div>
          <a href="${esc(link)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px">Open Notification</a>
        </div>
        <div style="margin-top:24px;color:#94a3b8;font-size:11px">You are receiving this because your department is a notification target. Mark it Seen/Acknowledge in the app to stop reminders.</div>
      </div>
    </div></body></html>`;
}

async function sendGmail(to: string, subject: string, html: string): Promise<{ id?: string; error?: string }>{
  const raw = [
    `From: ${FIXED_SENDER}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    '',
    html,
  ].join('\r\n');
  const res = await fetch(`${GATEWAY}/users/me/messages/send`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': GMAIL_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: b64url(raw) }),
  });
  const text = await res.text();
  if (!res.ok) return { error: `[${res.status}] ${text.slice(0, 500)}` };
  try { return { id: JSON.parse(text).id }; } catch { return { id: undefined }; }
}

async function getSenderEmail(): Promise<string | null> {
  try {
    const r = await fetch(`${GATEWAY}/users/me/profile`, {
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'X-Connection-Api-Key': GMAIL_KEY },
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.emailAddress || null;
  } catch { return null; }
}

async function handle(notification_id: string, kind: 'initial' | 'reminder') {
  const { data: n, error: nerr } = await admin.from('app_notifications').select('*').eq('id', notification_id).maybeSingle();
  if (nerr || !n) return { ok: false, error: nerr?.message || 'notification not found' };

  const targets: string[] = Array.isArray(n.target_departments) ? n.target_departments : [];
  if (targets.length === 0) return { ok: true, skipped: 'no target departments' };

  const normalizedTargets = targets.map(normalizeDept).filter(Boolean);

  // Resolve recipients from notification_recipients
  const { data: recips } = await admin
    .from('notification_recipients')
    .select('id,user_id,email,name,department,module,is_active')
    .eq('is_active', true);

  const moduleKey = (n.module || '').toString().toLowerCase();
  const matched = (recips || []).filter((r: any) => {
    if (!r.email) return false;
    if (!normalizedTargets.includes(normalizeDept(r.department))) return false;
    if (r.module && r.module !== moduleKey) return false;
    return true;
  });

  // Dedupe by email; exclude actor
  const actorEmail = (n.actor_user_id
    ? (await admin.from('profiles').select('email').eq('id', n.actor_user_id).maybeSingle()).data?.email
    : null);
  const byEmail = new Map<string, any>();
  for (const r of matched) {
    const em = String(r.email).trim().toLowerCase();
    if (!em) continue;
    if (actorEmail && em === String(actorEmail).toLowerCase()) continue;
    if (r.user_id && n.actor_user_id && r.user_id === n.actor_user_id) continue;
    if (!byEmail.has(em)) byEmail.set(em, r);
  }

  if (byEmail.size === 0) return { ok: true, skipped: 'no recipients after actor exclusion' };

  await getSenderEmail().catch(() => null);
  const sender = FIXED_SENDER;
  const link = buildDeepLink(n);
  const docNo = n.record_ref || '';
  const subject = `Action Required: Update in ${docNo}${kind === 'reminder' ? ' (Reminder)' : ''}`.trim();
  const totalChanges = Math.max(
    Number(n.total_changed_cells) || 0,
    Number(n.total_changed_rows) || 0,
    1,
  );

  // Group recipients by normalized department -> one email per department
  const byDept = new Map<string, { deptLabel: string; recipients: Array<{ email: string; user_id?: string | null }> }>();
  for (const [email, r] of byEmail) {
    const key = normalizeDept(r.department) || 'other';
    if (!byDept.has(key)) byDept.set(key, { deptLabel: r.department || key, recipients: [] });
    byDept.get(key)!.recipients.push({ email, user_id: r.user_id });
  }

  const results: any[] = [];
  for (const [, group] of byDept) {
    const emails = group.recipients.map((r) => r.email);
    if (emails.length === 0) continue;
    const primary = emails[0];
    const toHeader = emails.join(', ');

    // One log row per department email (unique by notification_id + recipient_email + kind)
    const { data: logRow, error: insErr } = await admin
      .from('email_notification_log')
      .insert({
        notification_id,
        recipient_email: primary,
        recipient_department: group.deptLabel,
        recipient_user_id: null,
        kind,
        status: 'pending',
        email_from: sender,
        subject,
        source_module: n.module,
        source_page: n.module,
        source_doc_no: n.record_ref,
        notification_type: n.event_type,
        created_by_user: n.actor_user_name,
        created_by_department: n.actor_department,
        target_department: group.deptLabel,
        cc_emails: emails.slice(1),
      })
      .select('id')
      .maybeSingle();
    if (insErr) { results.push({ dept: group.deptLabel, skipped: 'already logged' }); continue; }

    try {
      const html = renderHtml(n, group.deptLabel, kind, link, totalChanges);
      const { id: gmailId, error: sendErr } = await sendGmail(toHeader, subject, html);
      if (sendErr) {
        await admin.from('email_notification_log').update({ status: 'failed', error: sendErr }).eq('id', logRow!.id);
        results.push({ dept: group.deptLabel, ok: false, error: sendErr });
      } else {
        await admin.from('email_notification_log').update({ status: 'sent', gmail_message_id: gmailId, sent_at: new Date().toISOString() }).eq('id', logRow!.id);
        if (kind === 'reminder') {
          const { data: initial } = await admin
            .from('email_notification_log')
            .select('id, reminder_count')
            .eq('notification_id', notification_id)
            .eq('recipient_email', primary)
            .eq('kind', 'initial')
            .maybeSingle();
          if (initial?.id) {
            await admin
              .from('email_notification_log')
              .update({
                reminder_sent: true,
                reminder_sent_at: new Date().toISOString(),
                reminder_count: (initial.reminder_count || 0) + 1,
              })
              .eq('id', initial.id);
          }
        }
        results.push({ dept: group.deptLabel, ok: true, gmailId, recipients: emails.length });
      }
    } catch (e) {
      const msg = (e as Error).message || 'send failed';
      await admin.from('email_notification_log').update({ status: 'failed', error: msg }).eq('id', logRow!.id);
      results.push({ dept: group.deptLabel, ok: false, error: msg });
    }
  }
  return { ok: true, count: results.length, results };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // Require shared cron secret from the DB config — this endpoint is only
    // meant to be called by the DB trigger or the reminders cron job.
    const provided = req.headers.get('x-cron-secret') || '';
    const { data: cfgSecret } = await admin
      .from('email_notification_config')
      .select('cron_secret')
      .eq('id', true)
      .maybeSingle();
    const expected = cfgSecret?.cron_secret || '';
    if (!expected || provided !== expected) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const body = await req.json().catch(() => ({}));
    const { notification_id, kind } = body || {};
    if (!notification_id) {
      return new Response(JSON.stringify({ error: 'notification_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const out = await handle(notification_id, kind === 'reminder' ? 'reminder' : 'initial');
    return new Response(JSON.stringify(out), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});