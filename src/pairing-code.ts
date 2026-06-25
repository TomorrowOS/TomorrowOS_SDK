import { randomBytes } from "crypto";

/** 0-9 and A-Z — 36 characters per digit position. */
export const PAIRING_CODE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export const PAIRING_CODE_LENGTH = 6;

export function normalizePairingCode(raw: string): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "");
}

export function isValidPairingCodeFormat(code: string): boolean {
  return (
    code.length === PAIRING_CODE_LENGTH &&
    [...code].every((ch) => PAIRING_CODE_ALPHABET.includes(ch))
  );
}

/** Random 6-character code; each position is digit or uppercase letter. */
export function generateRandomPairingCode(): string {
  const bytes = randomBytes(PAIRING_CODE_LENGTH);
  let out = "";
  for (let i = 0; i < PAIRING_CODE_LENGTH; i += 1) {
    out += PAIRING_CODE_ALPHABET[bytes[i] % PAIRING_CODE_ALPHABET.length];
  }
  return out;
}
