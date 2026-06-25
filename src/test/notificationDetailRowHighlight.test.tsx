import { describe, it, expect } from "vitest";
import { render, within } from "@testing-library/react";
import { BeforeAfterItemTable } from "@/components/notifications/NotificationDetailDialog";

/**
 * End-to-end-style test for the Notification Detail view's row rendering.
 *
 * Verifies that when a single line item changes on a document:
 *   1. Only that changed row is rendered (no sibling rows).
 *   2. The full row is visible — every field present on the row shows up
 *      as a column, even fields that did not change.
 *   3. Only the fields listed in `changedKeys` get the highlight class.
 *      Unchanged fields render without the highlight.
 *   4. The dedicated "Old Value -> New Value" table shows one entry per
 *      changed field with the correct before and after values.
 */

describe("Notification Detail — row-specific change rendering", () => {
  const edit = {
    lineNo: "3",
    kind: "modified" as const,
    before: {
      item_code: "RM-100",
      description: "Copper Wire 1.5 sqmm",
      make: "Polycab",
      qty: 100,
      uom: "MTR",
      rate: 25,
    },
    after: {
      item_code: "RM-100",
      description: "Copper Wire 1.5 sqmm",
      make: "Finolex",
      qty: 100,
      uom: "MTR",
      rate: 28,
    },
    changedKeys: new Set<string>(["make", "rate"]),
    by: "Priya (Design)",
    dept: "Design",
    when: "2026-06-25T10:00:00.000Z",
  };

  it("renders only the changed row with the correct row number", () => {
    const { container } = render(<BeforeAfterItemTable edit={edit} />);
    const tables = container.querySelectorAll("table");
    const dataRows = tables[0].querySelectorAll("tbody > tr");
    expect(dataRows.length).toBe(1);
    expect(dataRows[0].textContent).toContain("3");
    expect(dataRows[0].textContent).toContain("Finolex");
  });

  it("shows every field on the row, including unchanged ones", () => {
    const { container } = render(<BeforeAfterItemTable edit={edit} />);
    const tables = container.querySelectorAll("table");
    const headerCells = Array.from(
      tables[0].querySelectorAll("thead th"),
    ).map((th) => th.textContent?.trim() ?? "");
    // Row No. + 6 dynamic fields + Changes/Edit column
    expect(headerCells).toContain("Row No.");
    expect(headerCells).toContain("Changes/Edit");
    const joined = headerCells.join("|").toLowerCase();
    for (const label of ["item", "description", "make", "quantity", "uom", "rate"]) {
      expect(joined, `expected header for ${label}`).toContain(label);
    }
  });

  it("highlights only the changed fields and leaves the rest unhighlighted", () => {
    const { container } = render(<BeforeAfterItemTable edit={edit} />);
    const tables = container.querySelectorAll("table");
    const rowTable = tables[0];
    const headers = Array.from(rowTable.querySelectorAll("thead th")).map(
      (th) => th.textContent?.trim().toLowerCase() ?? "",
    );
    const cells = Array.from(
      rowTable.querySelectorAll("tbody > tr > td"),
    ) as HTMLTableCellElement[];
    // Cells layout: [Row No., ...dynamicFieldCells, Changes/Edit]
    const fieldCells = cells.slice(1, cells.length - 1);
    expect(fieldCells.length).toBe(headers.length - 2);

    const highlightClass = "bg-amber-100";
    headers.slice(1, headers.length - 1).forEach((label, idx) => {
      const isChanged = label.includes("make") || label.includes("rate");
      const cls = fieldCells[idx].className;
      if (isChanged) {
        expect(cls, `${label} should be highlighted`).toContain(highlightClass);
      } else {
        expect(cls, `${label} should NOT be highlighted`).not.toContain(
          highlightClass,
        );
      }
    });
  });

  it("renders an Old Value -> New Value entry for every changed field", () => {
    const { container } = render(<BeforeAfterItemTable edit={edit} />);
    expect(container.textContent).toMatch(/Old Value/i);
    expect(container.textContent).toMatch(/New Value/i);

    // The dedicated diff table is the last <table> in the component.
    const tables = container.querySelectorAll("table");
    const diffTable = tables[tables.length - 1];
    const diffRows = diffTable.querySelectorAll("tbody > tr");
    expect(diffRows.length).toBe(2);

    const rowTexts = Array.from(diffRows).map((r) => r.textContent ?? "");
    const makeRow = rowTexts.find((t) => t.toLowerCase().includes("make"))!;
    const rateRow = rowTexts.find((t) => t.toLowerCase().includes("rate"))!;

    expect(makeRow).toContain("Polycab");
    expect(makeRow).toContain("Finolex");
    expect(rateRow).toContain("25");
    expect(rateRow).toContain("28");

    // Unchanged fields must NOT appear in the diff table.
    for (const t of rowTexts) {
      expect(t.toLowerCase()).not.toContain("description");
      expect(t.toLowerCase()).not.toContain("uom");
    }

    // Sanity: old values rendered with strike-through class, new with emerald.
    const oldCell = within(diffTable).getByText("Polycab");
    const newCell = within(diffTable).getByText("Finolex");
    expect(oldCell.className).toContain("line-through");
    expect(newCell.className).toContain("emerald");
  });
});
