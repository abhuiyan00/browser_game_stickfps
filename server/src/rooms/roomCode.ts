// Excludes visually ambiguous characters (0/O, 1/I) so codes are easy to read aloud/type.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  for (const ch of code.toUpperCase()) {
    if (!ALPHABET.includes(ch)) return false;
  }
  return true;
}
