import { today } from "@/lib/api";

export function yesterday(): string {
  const d = new Date(`${today()}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** "12", "$12.50", "12,50" -> 12.5; anything else -> NaN. */
export function parseAmount(text: string): number {
  const cleaned = text.replace(/[$\s]/g, "").replace(",", ".");
  return /^\d+(\.\d{0,2})?$/.test(cleaned) ? Number(cleaned) : NaN;
}
