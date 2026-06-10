// Indian-system number to words (rupees)
const ones = [
  "", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
  "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN",
  "SEVENTEEN", "EIGHTEEN", "NINETEEN",
];
const tens = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

function twoDigits(n: number): string {
  if (n < 20) return ones[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return tens[t] + (o ? " " + ones[o] : "");
}
function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(ones[h] + " HUNDRED");
  if (r) parts.push(twoDigits(r));
  return parts.join(" ");
}

export function amountInWords(amount: number): string {
  const rupees = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - rupees) * 100);
  if (rupees === 0 && paise === 0) return "ZERO ONLY";

  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;

  const parts: string[] = [];
  if (crore) parts.push(twoDigits(crore) + " CRORE");
  if (lakh) parts.push(twoDigits(lakh) + " LAKH");
  if (thousand) parts.push(twoDigits(thousand) + " THOUSAND");
  if (rest) parts.push(threeDigits(rest));
  let words = parts.join(" ").replace(/\s+/g, " ").trim();
  if (paise) words += " AND " + twoDigits(paise) + " PAISE";
  return (words || "ZERO") + " ONLY";
}