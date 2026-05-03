export type GhanaMomoProvider = "mtn" | "vod" | "atl";

/** Converts stored E.164 Ghana (+233…) or local 0XXXXXXXXX to ten-digit local form Paystack expects. */
export function e164GhanaToLocal10(phone: string): string | null {
  const d = phone.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("233")) {
    const rest = d.slice(3);
    if (rest.length === 9) return `0${rest}`;
  }
  if (d.length === 10 && d.startsWith("0")) return d;
  if (d.length === 9 && !d.startsWith("0")) return `0${d}`;
  return null;
}

/** Infer MoMo provider from national prefix (Ghana). Unknown prefix → null (caller must ask user). */
export function inferGhanaMomoProvider(local10: string): GhanaMomoProvider | null {
  if (local10.length !== 10 || !local10.startsWith("0")) return null;
  const prefix = local10.slice(0, 3);
  const mtn = ["024", "054", "055", "053", "059"];
  const vod = ["020", "050", "023"];
  const atl = ["026", "027", "056", "057"];
  if (mtn.includes(prefix)) return "mtn";
  if (vod.includes(prefix)) return "vod";
  if (atl.includes(prefix)) return "atl";
  return null;
}
