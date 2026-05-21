import autoTable from "jspdf-autotable";
import type jsPDF from "jspdf";
import { generateBoqPDF } from "@/lib/boq/pdf";
import { sortByItemNo, type BoqLineItem, type BoqRecord } from "@/lib/boq/types";
import { supabase } from "@/integrations/supabase/client";
import { parseColumnComments, type DesignReviewItemRow, type DesignReviewRow } from "@/lib/boq/designReview";

interface PrevRevision {
  revision_no: number;
  line_items: BoqLineItem[];
}

/** Diff helper: per-item field changes between the latest BOQ and the previous revision snapshot. */
function diffChanges(latest: BoqLineItem[], prev: BoqLineItem[] | null): Array<{
  item_no: string;
  field: string;
  before: string;
  after: string;
}> {
  if (!prev) return [];
  const prevById = new Map(prev.map((p) => [p.id, p]));
  const seenIds = new Set<string>();
  const out: Array<{ item_no: string; field: string; before: string; after: string }> = [];
  for (const it of latest) {
    seenIds.add(it.id);
    const p = prevById.get(it.id);
    if (!p) {
      out.push({ item_no: it.item_no || "?", field: "(added)", before: "—", after: `${it.model_number} · ${it.description}` });
      continue;
    }
    const checks: Array<[keyof BoqLineItem, string]> = [
      ["model_number", "Model"],
      ["description", "Description"],
      ["quantity", "Qty"],
      ["unit", "Unit"],
      ["remarks", "Remarks"],
    ];
    for (const [k, label] of checks) {
      const a = String(p[k] ?? "");
      const b = String(it[k] ?? "");
      if (a !== b) out.push({ item_no: it.item_no || "?", field: label, before: a || "—", after: b || "—" });
    }
  }
  for (const p of prev) {
    if (!seenIds.has(p.id)) {
      out.push({ item_no: p.item_no || "?", field: "(removed)", before: `${p.model_number} · ${p.description}`, after: "—" });
    }
  }
  return out;
}

async function fetchPreviousRevision(boqId: string, currentRevision: number): Promise<PrevRevision | null> {
  const { data } = await supabase
    .from("boq_revisions")
    .select("revision_no, line_items")
    .eq("boq_id", boqId)
    .lt("revision_no", currentRevision)
    .order("revision_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    revision_no: (data as { revision_no: number }).revision_no,
    line_items: ((data as { line_items: BoqLineItem[] }).line_items) || [],
  };
}

async function fetchLatestReview(boqId: string): Promise<{ round: DesignReviewRow | null; items: DesignReviewItemRow[] }> {
  const { data: rounds } = await supabase
    .from("boq_design_reviews")
    .select("*")
    .eq("boq_id", boqId)
    .eq("status", "submitted")
    .order("round_no", { ascending: false })
    .limit(1);
  const round = (rounds && rounds[0]) as DesignReviewRow | undefined;
  if (!round) return { round: null, items: [] };
  const { data: items } = await supabase
    .from("boq_design_review_items")
    .select("*")
    .eq("review_id", round.id);
  return { round, items: ((items as DesignReviewItemRow[]) || []) };
}

/** Build the enriched distribution PDF: existing BOQ PDF + remarks + design comments + change log + family link. */
export async function generateBoqDistributionPDF(
  boq: BoqRecord,
  familyLink: string,
): Promise<jsPDF> {
  const doc = await generateBoqPDF(boq);
  const W = doc.internal.pageSize.getWidth();
  const M = 12;

  // ---------- Page 2+: Remarks summary ----------
  doc.addPage();
  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.text("Distribution Annex", W / 2, 14, { align: "center" });
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text(`BOQ: ${boq.boq_number}   Revision: R${boq.revision ?? 0}   Status: ${(boq.verification_status || "approved").toUpperCase()}`, M, 22);
  doc.text(`Always-latest link: ${familyLink}`, M, 27);

  const items = sortByItemNo(boq.line_items || []);
  const remarkRows = items
    .filter((it) => (it.remarks || "").trim())
    .map((it) => [it.item_no || "", it.model_number || "", it.description || "", it.remarks || ""]);

  autoTable(doc, {
    startY: 33,
    head: [["Remarks Summary", "", "", ""]],
    body: [],
    theme: "plain",
    styles: { fontStyle: "bold", fontSize: 11 },
    margin: { left: M, right: M },
  });

  if (remarkRows.length) {
    autoTable(doc, {
      head: [["#", "Model", "Description", "Remarks"]],
      body: remarkRows,
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 2, valign: "top" },
      headStyles: { fillColor: [55, 65, 81], textColor: 255 },
      columnStyles: { 0: { cellWidth: 14, halign: "center" }, 1: { cellWidth: 30 }, 2: { cellWidth: "auto" }, 3: { cellWidth: 60 } },
      margin: { left: M, right: M },
    });
  } else {
    doc.setFont("helvetica", "italic").setFontSize(9);
    // @ts-expect-error lastAutoTable runtime
    doc.text("No item remarks recorded.", M, doc.lastAutoTable.finalY + 8);
  }

  // ---------- Design comments ----------
  const { round, items: reviewItems } = await fetchLatestReview(boq.id);
  // @ts-expect-error lastAutoTable runtime
  let y = (doc.lastAutoTable?.finalY ?? 33) + 10;

  doc.setFont("helvetica", "bold").setFontSize(11);
  doc.text("Design Comments", M, y);
  y += 4;

  if (!round || reviewItems.length === 0) {
    doc.setFont("helvetica", "italic").setFontSize(9);
    doc.text("No design review comments on this revision.", M, y + 4);
  } else {
    const itemsById = new Map(items.map((it) => [it.id, it]));
    const commentRows = reviewItems
      .map((ri) => {
        const cols = parseColumnComments(ri);
        const parts: string[] = [];
        (["model", "description", "quantity", "unit", "remarks"] as const).forEach((k) => {
          if (cols[k] && cols[k]!.trim()) parts.push(`${k}: ${cols[k]}`);
        });
        if (ri.comment && !parts.length) parts.push(ri.comment);
        if (ri.design_change_note) parts.push(`change: ${ri.design_change_note}`);
        const ref = itemsById.get(ri.boq_item_id);
        return {
          item_no: ref?.item_no || ri.item_no || "",
          model: ref?.model_number || ri.model_number || "",
          decision: ri.decision || "pending",
          comment: parts.join("\n"),
        };
      })
      .filter((r) => r.comment.trim() || r.decision !== "pending");

    if (commentRows.length === 0) {
      doc.setFont("helvetica", "italic").setFontSize(9);
      doc.text("No per-item comments recorded.", M, y + 4);
    } else {
      autoTable(doc, {
        startY: y + 2,
        head: [["#", "Model", "Decision", "Comment"]],
        body: commentRows.map((r) => [r.item_no, r.model, r.decision, r.comment]),
        theme: "grid",
        styles: { fontSize: 8.5, cellPadding: 2, valign: "top" },
        headStyles: { fillColor: [55, 65, 81], textColor: 255 },
        columnStyles: { 0: { cellWidth: 14, halign: "center" }, 1: { cellWidth: 30 }, 2: { cellWidth: 24 }, 3: { cellWidth: "auto" } },
        margin: { left: M, right: M },
      });
    }
  }

  // ---------- Change log vs previous revision ----------
  const prev = await fetchPreviousRevision(boq.id, boq.revision ?? 0);
  // @ts-expect-error lastAutoTable runtime
  y = (doc.lastAutoTable?.finalY ?? y) + 10;

  doc.setFont("helvetica", "bold").setFontSize(11);
  doc.text(prev ? `Changes vs R${prev.revision_no}` : "Change Log", M, y);
  y += 4;

  const changes = diffChanges(items, prev?.line_items || null);
  if (changes.length === 0) {
    doc.setFont("helvetica", "italic").setFontSize(9);
    doc.text(prev ? "No item changes from the previous revision." : "First revision — no prior revision to compare.", M, y + 4);
  } else {
    autoTable(doc, {
      startY: y + 2,
      head: [["#", "Field", "Before", "After"]],
      body: changes.map((c) => [c.item_no, c.field, c.before, c.after]),
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 2, valign: "top" },
      headStyles: { fillColor: [200, 30, 30], textColor: 255 },
      columnStyles: { 0: { cellWidth: 14, halign: "center" }, 1: { cellWidth: 26 }, 2: { cellWidth: "auto" }, 3: { cellWidth: "auto" } },
      margin: { left: M, right: M },
    });
  }

  return doc;
}
