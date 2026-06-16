import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';

interface PoRow {
  material: string;
  size_model: string | null;
  make: string | null;
  unit: string | null;
  qty: number | null;
  rate: number | null;
  discount_pct: number | null;
  gst_pct: number | null;
  gst_amount: number | null;
  line_amount: number | null;
  lot_no: string | null;
}

async function buildPdf(po: Record<string, unknown>, rows: PoRow[], vendor: Record<string, unknown> | null): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595, 842]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const { width } = page.getSize();
  let y = 800;
  const M = 30;
  const drawText = (txt: string, x: number, yy: number, opts: { bold?: boolean; size?: number; color?: [number, number, number] } = {}) => {
    page.drawText(txt, { x, y: yy, font: opts.bold ? fontB : font, size: opts.size ?? 9, color: rgb(...(opts.color ?? [0, 0, 0])) });
  };
  const ensureSpace = (need: number) => {
    if (y - need < 40) {
      page = pdfDoc.addPage([595, 842]);
      y = 800;
    }
  };

  drawText('PURCHASE ORDER', width / 2 - 50, y, { bold: true, size: 14 });
  y -= 18;
  drawText(`PO No : ${po.po_number}`, M, y);
  const _poDate = po.po_date ? new Date(String(po.po_date)) : new Date(String(po.created_at));
  drawText(`Date : ${_poDate.toLocaleDateString('en-IN')}`, width - 150, y);
  y -= 12;
  if (po.due_on) {
    drawText(`Due On : ${new Date(String(po.due_on)).toLocaleDateString('en-IN')}`, width - 150, y);
    y -= 12;
  }
  y -= 4;

  const buyer = (po.buyer_block as Record<string, Record<string, string>>) || {};
  const inv = buyer.invoice_to || {};
  const ship = buyer.ship_to || inv;
  drawText('Invoice To :', M, y, { bold: true });
  drawText('Ship To :', M + 280, y, { bold: true });
  y -= 11;
  const invLines = [inv.name, inv.address, inv.gstin ? `GSTIN ${inv.gstin}` : '', inv.email].filter(Boolean) as string[];
  const shipLines = [ship.name, ship.address, ship.gstin ? `GSTIN ${ship.gstin}` : '', ship.email].filter(Boolean) as string[];
  const maxN = Math.max(invLines.length, shipLines.length);
  for (let i = 0; i < maxN; i++) {
    if (invLines[i]) drawText(invLines[i].slice(0, 65), M, y);
    if (shipLines[i]) drawText(shipLines[i].slice(0, 65), M + 280, y);
    y -= 10;
  }
  y -= 4;

  drawText('Vendor :', M, y, { bold: true });
  y -= 11;
  const v = vendor || {};
  const vLines = [
    `M/s ${po.vendor_name}`,
    v.address ? `Address: ${v.address}` : '',
    v.gstin ? `GSTIN: ${v.gstin}` : '',
    v.contact_person ? `Contact: ${v.contact_person}` : '',
    v.phone ? `Phone: ${v.phone}` : '',
    v.email ? `Email: ${v.email}` : '',
  ].filter(Boolean) as string[];
  vLines.forEach((l) => { drawText(l.slice(0, 80), M, y); y -= 10; });
  y -= 6;

  // Items table
  const cols = [
    { label: '#', w: 20 },
    { label: 'Description', w: 200 },
    { label: 'Qty', w: 40 },
    { label: 'Rate', w: 50 },
    { label: 'Disc%', w: 40 },
    { label: 'GST%', w: 40 },
    { label: 'GST Amt', w: 60 },
    { label: 'Amount', w: 65 },
  ];
  let x = M;
  cols.forEach((c) => { drawText(c.label, x, y, { bold: true }); x += c.w; });
  y -= 4;
  page.drawLine({ start: { x: M, y }, end: { x: width - M, y }, color: rgb(0.5, 0.5, 0.5), thickness: 0.5 });
  y -= 10;

  rows.forEach((r, i) => {
    ensureSpace(14);
    let xx = M;
    const cells = [
      String(i + 1),
      `${r.material}${r.size_model ? ` (${r.size_model})` : ''}`.slice(0, 50),
      String(r.qty ?? 0),
      r.rate != null ? r.rate.toFixed(2) : '',
      r.discount_pct != null ? `${r.discount_pct}%` : '',
      r.gst_pct != null ? `${r.gst_pct}%` : '',
      r.gst_amount != null ? r.gst_amount.toFixed(2) : '',
      r.line_amount != null ? r.line_amount.toFixed(2) : '',
    ];
    cells.forEach((c, ci) => { drawText(c, xx, y); xx += cols[ci].w; });
    y -= 12;
  });

  y -= 4;
  page.drawLine({ start: { x: M, y }, end: { x: width - M, y }, color: rgb(0.5, 0.5, 0.5), thickness: 0.5 });
  y -= 14;
  drawText(`Basic: ${Number(po.subtotal ?? 0).toFixed(2)}`, width - 170, y); y -= 11;
  drawText(`Tax  : ${Number(po.tax_total ?? 0).toFixed(2)}`, width - 170, y); y -= 11;
  drawText(`Grand: ${Number(po.grand_total ?? 0).toFixed(2)}`, width - 170, y, { bold: true });
  y -= 18;

  if (po.terms) {
    drawText('Terms of Delivery:', M, y, { bold: true });
    y -= 11;
    String(po.terms).split('\n').forEach((line) => { drawText(line.slice(0, 110), M, y); y -= 10; });
  }

  return await pdfDoc.save();
}

function u8ToBase64(u: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < u.length; i += chunk) {
    s += String.fromCharCode(...u.subarray(i, i + chunk));
  }
  return btoa(s);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = userData.user.id;

    const body = await req.json();
    const { po_id, to, cc, message } = body as { po_id: string; to: string; cc?: string | null; message?: string | null };
    if (!po_id || !to) {
      return new Response(JSON.stringify({ ok: false, error: 'po_id and to required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const service = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: po, error: poErr } = await service.from('purchase_orders').select('*').eq('id', po_id).maybeSingle();
    if (poErr || !po) throw new Error(poErr?.message || 'PO not found');
    // Ownership check: only PO creator or admin can send it.
    const { data: adminRow } = await service
      .from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle();
    const isAdmin = !!adminRow;
    if (!isAdmin && po.created_by && po.created_by !== userId) {
      return new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: rows } = await service.from('purchase_order_rows').select('*').eq('po_id', po_id);
    let vendor: Record<string, unknown> | null = null;
    if (po.vendor_id) {
      const { data: v } = await service.from('vendors').select('*').eq('id', po.vendor_id).maybeSingle();
      vendor = v;
    }

    const pdfBytes = await buildPdf(po as Record<string, unknown>, (rows || []) as PoRow[], vendor);
    const base64 = u8ToBase64(pdfBytes);

    const LOVABLE_KEY = Deno.env.get('LOVABLE_API_KEY');
    const RESEND_KEY = Deno.env.get('RESEND_API_KEY');
    if (!LOVABLE_KEY || !RESEND_KEY) {
      throw new Error('Email service not configured. Please connect the Resend connector.');
    }

    const buyerName = ((po.buyer_block as Record<string, Record<string, string>>)?.invoice_to?.name) || 'Buyer';
    const subject = `Purchase Order ${po.po_number} – ${buyerName}`;
    const html = `<p>Dear ${vendor?.contact_person || 'Sir/Madam'},</p>
      <p>Please find attached our Purchase Order <b>${po.po_number}</b>.</p>
      ${message ? `<p>${String(message).replace(/</g, '&lt;')}</p>` : ''}
      <p>Regards,<br/>${po.prepared_by_name || ''}<br/>${buyerName}</p>`;

    const resendBody: Record<string, unknown> = {
      from: `${buyerName} <onboarding@resend.dev>`,
      to: [to],
      subject,
      html,
      attachments: [{ filename: `${po.po_number.replace(/\//g, '_')}.pdf`, content: base64 }],
    };
    if (cc) resendBody.cc = [cc];

    const resp = await fetch(`${GATEWAY_URL}/emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_KEY}`,
        'X-Connection-Api-Key': RESEND_KEY,
      },
      body: JSON.stringify(resendBody),
    });
    const sendResult = await resp.json();
    if (!resp.ok) {
      await service.from('purchase_order_sends').insert({
        po_id, to_email: to, cc, subject, message, status: 'failed', error: JSON.stringify(sendResult), sent_by: userId,
      });
      throw new Error(sendResult?.message || sendResult?.error || `Send failed (${resp.status})`);
    }

    await service.from('purchase_order_sends').insert({
      po_id, to_email: to, cc, subject, message, status: 'sent', sent_by: userId,
    });
    await service.from('purchase_order_audit').insert({
      po_id, action: 'sent', actor: userId, notes: `to: ${to}${cc ? `, cc: ${cc}` : ''}`,
    });

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});