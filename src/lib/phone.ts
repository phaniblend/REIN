/** Normalize to E.164. Defaults bare 10-digit numbers to +1 (US/CA). */
export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  if (raw.startsWith("+")) {
    const digits = raw.slice(1).replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) return null;
    return `+${digits}`;
  }

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function maskPhone(e164: string): string {
  if (e164.length < 6) return e164;
  return `${e164.slice(0, 2)}•••••${e164.slice(-4)}`;
}

/** @deprecated alias */
export const maskPhoneDisplay = maskPhone;
