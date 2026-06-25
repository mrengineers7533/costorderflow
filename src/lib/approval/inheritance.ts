/**
 * Pure helpers for OA / BOQ approval inheritance and the manufacturing
 * "Approved" derivation rule. Kept dependency-free so they can be unit
 * tested without touching Supabase.
 */

export type OaStatus = "draft" | "finalized" | string;
export type BoqVerificationStatus =
  | "approved"
  | "pending_verification"
  | "rejected"
  | string;

/** When an OA is revised, the new revision inherits Approved/Finalized
 *  status only if the source OA was already Finalized. Otherwise the
 *  revised OA starts as Draft. */
export function inheritedOaStatus(sourceStatus: OaStatus | null | undefined):
  "finalized" | "draft" {
  return sourceStatus === "finalized" ? "finalized" : "draft";
}

/** When a BOQ is cascaded from an OA revision, the new BOQ revision
 *  inherits Approved only if the previous BOQ revision was Approved.
 *  verified_at / verified_by_email carry forward when approved. */
export function inheritedBoqApproval(prevBoq: {
  verification_status?: BoqVerificationStatus | null;
  verified_at?: string | null;
  verified_by_email?: string | null;
} | null | undefined): {
  verification_status: "approved" | "pending_verification";
  verified_at: string | null;
  verified_by_email: string | null;
} {
  const prevApproved = (prevBoq?.verification_status ?? "approved") === "approved";
  if (!prevApproved) {
    return { verification_status: "pending_verification", verified_at: null, verified_by_email: null };
  }
  return {
    verification_status: "approved",
    verified_at: prevBoq?.verified_at ?? new Date().toISOString(),
    verified_by_email: prevBoq?.verified_by_email ?? null,
  };
}

/** Manufacturing shows "Approved" only when BOTH:
 *   - the latest BOQ revision is approved, AND
 *   - the latest OA revision in the family is finalized.
 *  This mirrors the rule applied across Manufacturing, Requisition,
 *  Annexure, Planning, Purchase, Tracking and Dispatch downstream views. */
export function isManufacturingApproved(input: {
  boqVerificationStatus?: BoqVerificationStatus | null;
  latestOaStatus?: OaStatus | null;
}): boolean {
  const boqApproved = (input.boqVerificationStatus ?? "approved") === "approved";
  const oaApproved = input.latestOaStatus === "finalized";
  return boqApproved && oaApproved;
}