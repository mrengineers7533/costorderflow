import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guard rail: Motor, Motor Qty, and Remarks must read from the same
 * source fields (`motor`, `motor_quantity`, `remarks`) on every surface
 * that renders BOQ/OA line items — Design, BOQ/OA, and Manufacturing /
 * Purchase. If any page is refactored to read these values from a
 * different property, this test fails so the drift is caught early.
 */

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const SURFACES: { label: string; path: string }[] = [
  { label: "Design (DesignBoqView)", path: "src/pages/design/DesignBoqView.tsx" },
  { label: "Design (DesignReview)", path: "src/pages/boqs/DesignReview.tsx" },
  { label: "BOQ editor", path: "src/pages/boqs/BoqEditor.tsx" },
  { label: "BOQ verify", path: "src/pages/boqs/BoqVerify.tsx" },
  { label: "OA editor", path: "src/pages/orders/OrderEditor.tsx" },
  { label: "Manufacturing/Purchase BOQ details", path: "src/pages/modules/ApprovedBoqModule.tsx" },
];

const FIELDS = ["motor", "motor_quantity", "remarks"] as const;

// Accepts either a direct property access (`.motor`, `?.motor_quantity`)
// or a quoted string key (`"motor"`, `'remarks'`) — DesignBoqView reads
// these fields through a dynamic column-key lookup rather than dotted
// access, but the underlying property name must still match.
const fieldRegex = (f: string) =>
  new RegExp(`(?:\\??\\.${f}(?![A-Za-z0-9_])|["']${f}["'])`);

describe("Motor / Motor Qty / Remarks field consistency", () => {
  for (const { label, path } of SURFACES) {
    for (const field of FIELDS) {
      it(`${label} reads \`${field}\` from the canonical property`, () => {
        const src = read(path);
        expect(
          fieldRegex(field).test(src),
          `${path} no longer references \`.${field}\` — Motor/Motor Qty/Remarks must stay on the same source fields across all pages.`,
        ).toBe(true);
      });
    }
  }

  it("BoqLineItem type still declares motor, motor_quantity, remarks", () => {
    const src = read("src/lib/boq/types.ts");
    expect(src).toMatch(/remarks:\s*string/);
    expect(src).toMatch(/motor\?:\s*string/);
    expect(src).toMatch(/motor_quantity\?:\s*number/);
  });

  it("OA LineItem type still declares motor, motor_quantity, remarks", () => {
    const src = read("src/lib/orders/types.ts");
    expect(src).toMatch(/remarks\?:\s*string/);
    expect(src).toMatch(/motor\?:\s*string/);
    expect(src).toMatch(/motor_quantity\?:\s*number/);
  });
});