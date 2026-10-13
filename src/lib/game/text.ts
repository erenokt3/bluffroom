/**
 * Text normalisation used to detect duplicate answers and nickname collisions.
 * Turkish-aware lower-casing (İ→i, I→ı) so "IŞIK" and "ışık" match.
 */
export function normalizeAnswer(text: string): string {
  return text
    .normalize("NFC")
    .toLocaleLowerCase("tr-TR")
    .replace(/[.,!?;:'"`´’‘“”()\[\]{}…\-_/\\*~^]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Collapse whitespace and strip control characters from user text. */
export function cleanUserText(text: string): string {
  return text
    .normalize("NFC")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nicknameKey(nickname: string): string {
  return cleanUserText(nickname).toLocaleLowerCase("tr-TR");
}

/** Allowed nickname characters: letters (incl. Turkish), digits, space, _ . - */
const NICKNAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} _.\-]*$/u;

export function validateNickname(raw: unknown, min = 2, max = 16):
  | { ok: true; value: string }
  | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "Takma ad gerekli." };
  const value = cleanUserText(raw);
  if (value.length === 0) return { ok: false, error: "Takma ad boş olamaz." };
  if ([...value].length < min) return { ok: false, error: `Takma ad en az ${min} karakter olmalı.` };
  if ([...value].length > max) return { ok: false, error: `Takma ad en fazla ${max} karakter olabilir.` };
  if (!NICKNAME_RE.test(value))
    return { ok: false, error: "Takma ad yalnızca harf, rakam, boşluk ve _ . - içerebilir." };
  return { ok: true, value };
}

export function validateAnswerText(raw: unknown, max = 80):
  | { ok: true; value: string; normalized: string }
  | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "Cevap gerekli." };
  const value = cleanUserText(raw);
  if (value.length === 0) return { ok: false, error: "Cevap boş olamaz." };
  if ([...value].length > max) return { ok: false, error: `Cevap en fazla ${max} karakter olabilir.` };
  const normalized = normalizeAnswer(value);
  if (normalized.length === 0) return { ok: false, error: "Cevap yalnızca noktalama işaretlerinden oluşamaz." };
  return { ok: true, value, normalized };
}
