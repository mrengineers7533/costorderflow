export const DEFAULT_MR_TERMS = `1. Payment: 40% advance & balance against proforma invoice prior to dispatch.
2. Taxation: Extra as applicable at the time of dispatch.
3. Packing & Forwarding: Extra
4. Freight: Extra
5. Insurance: Extra
6. Delivery: 12-14 weeks after receipt of your purchase order & advance.
7. Exclusions: Any equipment and/or material and/or services not specifically mentioned in this order acceptance.`;

export interface BankDetails {
  bank_name: string;
  branch: string;
  account_no: string;
  ifsc: string;
}

export const DEFAULT_MR_BANK: BankDetails = {
  bank_name: "AXIS BANK",
  branch: "NOIDA",
  account_no: "0001568288",
  ifsc: "UTIB0005147",
};

export const MR_FOOTER_ADDRESS =
  "PLEASE DO ALL CORRESPONDENCE AND SEND PAYMENTS AT C-27, C-BLOCK, GROUND FLOOR, TRAPEZOID IT PARK, SECTOR-62, NOIDA, PIN-201309";

export const DEFAULT_GMS_BANK: BankDetails = {
  bank_name: "Citi Bank",
  branch: "Noida",
  account_no: "0005989288",
  ifsc: "CITI0000017",
};

export const GMS_HEAD_OFFICE_LINES = [
  "209A, 2nd Floor, K M Trade Tower,",
  "Kaushambi, Sahibabad, Ghaziabad-201010,",
  "Uttar Pradesh, INDIA",
  "Tel : +91 0120-4567202/03",
  "info@gmsdelhi.com",
];

export const DEFAULT_GMS_EXCLUSIONS = [
  "Exclusion: Sea Freight/Local Freight",
  "Exclusion: Custom duty, CHA, Port charges & GST",
  "Exclusion: All Insurance.",
];

export const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
};