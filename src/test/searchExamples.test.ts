import { describe, it, expect } from "vitest";
import Fuse from "fuse.js";

/**
 * Regression harness for the global search ranker.
 *
 * If you change the Fuse config in src/components/GlobalSearch.tsx, mirror it
 * here and re-run `bunx vitest run src/test/searchExamples.test.ts` to make
 * sure partial OA numbers, ambiguous company names, and item descriptions
 * still rank correctly.
 */

type Row = {
  id: string;
  oa_number: string;
  company_name: string;
  bill_to_name: string;
  reference: string;
  cost_sheet_number: string;
  item_descriptions: string;
  item_hsn: string;
};

const rows: Row[] = [
  { id: "A",  oa_number: "MR/2526/0042",  company_name: "Shree Ganesh Industries Pvt Ltd", bill_to_name: "Shree Ganesh Industries", reference: "PO-7781",  cost_sheet_number: "CS-1042", item_descriptions: "MS Pipe 80NB Sch 40 • Galvanized elbow 90deg", item_hsn: "7306 7307" },
  { id: "A2", oa_number: "MR/2425/0042",  company_name: "Anand Pipes & Tubes",             bill_to_name: "Anand Pipes",             reference: "AP-42",    cost_sheet_number: "CS-942",  item_descriptions: "MS Pipe 50NB Sch 40 • elbow",                item_hsn: "7306" },
  { id: "B",  oa_number: "MR/2526/0043",  company_name: "Sharma Engineering Works",        bill_to_name: "Sharma Engg",             reference: "PO-7790",  cost_sheet_number: "CS-1043", item_descriptions: "SS 304 Sheet 2mm • Hex bolt M12",            item_hsn: "7219 7318" },
  { id: "B2", oa_number: "GMS/2526/0143", company_name: "Sharma Steel Traders",            bill_to_name: "Sharma Steel",            reference: "SS-7790",  cost_sheet_number: "CS-2043", item_descriptions: "SS 316 sheet 3mm • washer M10",              item_hsn: "7219" },
  { id: "C",  oa_number: "GMS/2526/0101", company_name: "Tata Steel Processing",           bill_to_name: "Tata Steel",              reference: "TSP-9911", cost_sheet_number: "CS-2001", item_descriptions: "HR Coil 3mm • Cold rolled strip",            item_hsn: "7208" },
  { id: "C2", oa_number: "MR/2526/1010",  company_name: "Tata Power Co Ltd",               bill_to_name: "Tata Power",              reference: "TPW-1",    cost_sheet_number: "CS-1110", item_descriptions: "Transformer oil • copper bus bar",            item_hsn: "8504" },
  { id: "D",  oa_number: "GMS/2526/0102", company_name: "L&T Construction",                bill_to_name: "Larsen Toubro",           reference: "LT-5532",  cost_sheet_number: "CS-2002", item_descriptions: "TMT bar Fe500 • Concrete admixture",          item_hsn: "7214" },
  { id: "E",  oa_number: "MR/2425/0099",  company_name: "Bharat Forge Limited",            bill_to_name: "Bharat Forge",            reference: "BF-101",   cost_sheet_number: "CS-901",  item_descriptions: "Forged crankshaft • Connecting rod",          item_hsn: "8483" },
  { id: "E2", oa_number: "MR/2526/0099",  company_name: "Bharat Heavy Electricals",        bill_to_name: "BHEL",                    reference: "BHEL-77",  cost_sheet_number: "CS-1099", item_descriptions: "Turbine blade • generator stator",            item_hsn: "8503" },
  { id: "F",  oa_number: "MR/2526/0050",  company_name: "Reliance Industries Ltd",         bill_to_name: "Reliance",                reference: "RIL-2233", cost_sheet_number: "CS-1050", item_descriptions: "PVC pipe 110mm • HDPE fitting",               item_hsn: "3917" },
  { id: "G",  oa_number: "GMS/2526/0110", company_name: "Adani Power",                     bill_to_name: "Adani",                   reference: "AP-77",    cost_sheet_number: "CS-2010", item_descriptions: "Boiler tube 50mm • Heat exchanger plate",     item_hsn: "7304" },
  { id: "H",  oa_number: "MR/2526/0061",  company_name: "Godrej Boyce Mfg",                bill_to_name: "Godrej",                  reference: "GB-441",   cost_sheet_number: "CS-1061", item_descriptions: "Sheet metal cabinet • Powder coated panel",   item_hsn: "7326" },
  { id: "I",  oa_number: "MR/2526/0072",  company_name: "Mahindra & Mahindra",             bill_to_name: "Mahindra",                reference: "MM-558",   cost_sheet_number: "CS-1072", item_descriptions: "Tractor gearbox housing • Axle shaft",        item_hsn: "8708" },
  { id: "J",  oa_number: "GMS/2526/0120", company_name: "Shree Cement Ltd",                bill_to_name: "Shree Cement",            reference: "SC-9001",  cost_sheet_number: "CS-2020", item_descriptions: "OPC 53 grade cement bag • Clinker grinding ball", item_hsn: "2523" },
];

// Mirror of GlobalSearch.tsx Fuse config — keep in sync.
const fuse = new Fuse(rows, {
  includeScore: true,
  ignoreLocation: true,
  threshold: 0.35,
  minMatchCharLength: 2,
  keys: [
    { name: "oa_number",         weight: 0.30 },
    { name: "company_name",      weight: 0.22 },
    { name: "bill_to_name",      weight: 0.14 },
    { name: "reference",         weight: 0.10 },
    { name: "cost_sheet_number", weight: 0.08 },
    { name: "item_descriptions", weight: 0.10 },
    { name: "item_hsn",          weight: 0.03 },
  ],
});

const fyOf = (oa: string) => {
  const m = oa.match(/\/(\d{4})\//);
  return m ? parseInt(m[1], 10) : 0;
};

function search(q: string): string[] {
  const ql = q.toLowerCase();
  const hits = fuse.search(q, { limit: 20 });
  const scored = hits.map((r) => {
    let s = r.score ?? 1;
    if (r.item.oa_number.toLowerCase().includes(ql)) s -= 0.6;
    if (r.item.cost_sheet_number.toLowerCase().includes(ql)) s -= 0.4;
    if (r.item.reference.toLowerCase().includes(ql)) s -= 0.3;
    s -= fyOf(r.item.oa_number) * 0.0001;
    return { id: r.item.id, s };
  });
  scored.sort((a, b) => a.s - b.s);
  return scored.map((r) => r.id);
}

const examples: Array<{ q: string; top1: string }> = [
  { q: "0042",          top1: "A"  }, // newer FY (2526) wins over 2425
  { q: "2425/0042",     top1: "A2" },
  { q: "MR/2526/0050",  top1: "F"  },
  { q: "2526/0072",     top1: "I"  },
  { q: "0099",          top1: "E2" },
  { q: "GMS/2526/0101", top1: "C"  },
  { q: "shree ganesh",  top1: "A"  },
  { q: "shree cement",  top1: "J"  },
  { q: "sharma engineering", top1: "B"  },
  { q: "sharma steel",  top1: "B2" },
  { q: "tata steel",    top1: "C"  },
  { q: "tata power",    top1: "C2" },
  { q: "reliance",      top1: "F"  },
  { q: "godrej",        top1: "H"  },
  { q: "mahindr",       top1: "I"  }, // typo / partial
  { q: "forge",         top1: "E"  },
  { q: "bharat heavy",  top1: "E2" },
  { q: "crankshaft",    top1: "E"  },
  { q: "pvc pipe",      top1: "F"  },
  { q: "tmt bar",       top1: "D"  },
  { q: "boiler tube",   top1: "G"  },
  { q: "turbine blade", top1: "E2" },
  { q: "transformer oil", top1: "C2" },
  { q: "cs-2002",       top1: "D"  },
  { q: "PO-7781",       top1: "A"  },
  { q: "BHEL-77",       top1: "E2" },
];

describe("global search ranking", () => {
  for (const ex of examples) {
    it(`ranks "${ex.q}" → ${ex.top1} first`, () => {
      const ids = search(ex.q);
      expect(ids[0]).toBe(ex.top1);
    });
  }
});