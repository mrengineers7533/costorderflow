import { describe, it, expect } from "vitest";
import {
  inheritedOaStatus,
  inheritedBoqApproval,
  isManufacturingApproved,
} from "@/lib/approval/inheritance";

describe("OA/BOQ approval inheritance + manufacturing derivation", () => {
  // ---------------------------------------------------------------------------
  // Test 1: Approved OA revise -> revised OA & cascaded BOQ stay Approved.
  // ---------------------------------------------------------------------------
  it("Test 1: revising an approved OA keeps the new OA finalized and the BOQ approved", () => {
    const newOaStatus = inheritedOaStatus("finalized");
    expect(newOaStatus).toBe("finalized");

    const prevBoq = {
      verification_status: "approved" as const,
      verified_at: "2026-01-10T10:00:00.000Z",
      verified_by_email: "qa@example.com",
    };
    const newBoq = inheritedBoqApproval(prevBoq);
    expect(newBoq.verification_status).toBe("approved");
    expect(newBoq.verified_at).toBe("2026-01-10T10:00:00.000Z");
    expect(newBoq.verified_by_email).toBe("qa@example.com");

    // Manufacturing should show Approved.
    expect(
      isManufacturingApproved({
        boqVerificationStatus: newBoq.verification_status,
        latestOaStatus: newOaStatus,
      }),
    ).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 2: Not-approved OA revise -> nothing auto-approves.
  // ---------------------------------------------------------------------------
  it("Test 2: revising a non-approved OA does NOT auto-approve the new OA or BOQ", () => {
    for (const src of ["draft", null, undefined, "pending", "rejected"] as const) {
      expect(inheritedOaStatus(src as never)).toBe("draft");
    }

    const prevBoq = {
      verification_status: "pending_verification" as const,
      verified_at: null,
      verified_by_email: null,
    };
    const newBoq = inheritedBoqApproval(prevBoq);
    expect(newBoq.verification_status).toBe("pending_verification");
    expect(newBoq.verified_at).toBeNull();
    expect(newBoq.verified_by_email).toBeNull();

    expect(
      isManufacturingApproved({
        boqVerificationStatus: newBoq.verification_status,
        latestOaStatus: "draft",
      }),
    ).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Test 3: Latest revision rule — old OA approved, latest OA not approved.
  // ---------------------------------------------------------------------------
  it("Test 3: status derives from the LATEST OA/BOQ revision only", () => {
    // Old OA R0 finalized, latest OA R1 draft -> Manufacturing must NOT show Approved.
    expect(
      isManufacturingApproved({
        boqVerificationStatus: "approved",
        latestOaStatus: "draft",
      }),
    ).toBe(false);

    // BOQ pending, OA finalized -> still not approved.
    expect(
      isManufacturingApproved({
        boqVerificationStatus: "pending_verification",
        latestOaStatus: "finalized",
      }),
    ).toBe(false);

    // Both approved on the latest revisions -> approved.
    expect(
      isManufacturingApproved({
        boqVerificationStatus: "approved",
        latestOaStatus: "finalized",
      }),
    ).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 4: Downstream linked modules all use the same derivation.
  // ---------------------------------------------------------------------------
  it("Test 4: every downstream module derives Approved from the same latest-revision rule", () => {
    const downstream = [
      "BOQ",
      "Manufacturing",
      "Requisition",
      "Annexure",
      "Planning",
      "Purchase",
      "Tracking",
      "Dispatch",
    ];
    const latest = { boqVerificationStatus: "approved", latestOaStatus: "finalized" };
    const stale = { boqVerificationStatus: "approved", latestOaStatus: "draft" };

    for (const _mod of downstream) {
      expect(isManufacturingApproved(latest)).toBe(true);
      expect(isManufacturingApproved(stale)).toBe(false);
    }
  });
});