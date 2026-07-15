// Admin-only: sends a test email using the currently configured notification
// sender. Records the attempt in email_notification_log with kind = 'test_email'.
// Does NOT create any in-app notification.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const GATEWAY = 'https://connector-gateway.lovable.dev/google_mail/gmail/v1';
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
const GMAIL_KEY = Deno.env.get('GOOGLE_MAIL_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function b64url(s: string) {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sendGmail(from: string, to: string, subject: string, html: string) {
  const raw = [
    `From: ${from}`,
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: isAdmin } = await admin.rpc('has_role', { _user_id: uid, _role: 'admin' });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const to = String(body?.to || '').trim();
    if (!EMAIL_RE.test(to)) {
      return new Response(JSON.stringify({ error: 'Invalid recipient email' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: cfg } = await admin.from('email_notification_config').select('sender_email').eq('id', true).maybeSingle();
    const sender = (cfg?.sender_email || '').toString().trim();
    if (!sender || !EMAIL_RE.test(sender)) {
      return new Response(JSON.stringify({ error: 'Sender email is not configured or invalid.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const subject = `GMS Test Email — from ${sender}`;
    const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;padding:24px">
      <h2>GMS Notification Test</h2>
      <p>This is a test message sent by the GMS notification system.</p>
      <p><b>Configured sender:</b> ${sender}<br/><b>Sent at:</b> ${new Date().toUTCString()}</p>
      <p>If you received this, the sender configuration and provider connectivity are working.</p>
    </body></html>`;

    const { data: logRow } = await admin.from('email_notification_log').insert({
      notification_id: null,
      recipient_email: to,
      kind: 'test_email',
      status: 'pending',
      email_from: sender,
      sender_email: sender,
      subject,
    }).select('id').maybeSingle();

    const { id: gmailId, error: sendErr } = await sendGmail(sender, to, subject, html);
    if (sendErr) {
      if (logRow?.id) await admin.from('email_notification_log').update({ status: 'failed', error: sendErr }).eq('id', logRow.id);
      return new Response(JSON.stringify({ ok: false, error: sendErr }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (logRow?.id) await admin.from('email_notification_log').update({ status: 'sent', gmail_message_id: gmailId, sent_at: new Date().toISOString() }).eq('id', logRow.id);
    return new Response(JSON.stringify({ ok: true, gmailId, sender }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});