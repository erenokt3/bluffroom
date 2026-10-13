import { z } from "zod";
import { CATEGORIES, NAME_TOKEN, type QuestionTemplate } from "./categories";
import { normalizeAnswer } from "../game/text";

/** Schema the AI provider must return. */
export const aiResponseSchema = z.object({
  questions: z
    .array(
      z.object({
        text: z.string(),
        category: z.string(),
      }),
    )
    .min(1)
    .max(40),
});

/** Exact tokens that are not allowed anywhere in a question. */
const BANNED_TOKENS = new Set([
  "din", "dini", "dinî", "ırk", "ırkı", "öl", "ölü", "seks", "porno", "kilo", "kilosu",
]);

/** Word stems (prefix match on each token) that indicate sensitive/unsafe content. */
const BANNED_STEMS = [
  "cinsel", "seksi", "çıplak", "sevişm", "erotik", "mahrem",
  "siyas", "politik", "cumhurbaşkan", "milletvekil",
  "dinin", "inanç", "mezhep", "namaz", "ibadet",
  "etnik", "irkç", "ırkç", "kürt", "ermeni",
  "hastalı", "ilaç", "depres", "intihar", "ölüm", "öldür", "kanser", "terapi", "psikiyatr",
  "şişman", "obez", "çirkin", "aptal", "salak", "gerizekal", "beceriksiz", "ezik", "zavallı",
  "maaş", "borç", "kredi", "şifre", "adres", "tc kimlik", "kimlik", "telefon numara",
  "aldat", "eski sevgili", "boşan", "hamile",
  "uyuşturucu", "esrar", "silah", "kavga", "taciz", "istismar", "küfür",
];

export function isSafeQuestion(text: string): boolean {
  const lower = text.toLocaleLowerCase("tr-TR");
  const tokens = lower.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (tokens.some((t) => BANNED_TOKENS.has(t))) return false;
  if (tokens.some((t) => BANNED_STEMS.some((s) => !s.includes(" ") && t.startsWith(s)))) return false;
  if (BANNED_STEMS.some((s) => s.includes(" ") && lower.includes(s))) return false;
  return true;
}

export type ValidationResult = { ok: true; value: QuestionTemplate } | { ok: false; reason: string };

/** Validate a single AI-produced question template. */
export function validateQuestionTemplate(raw: { text: string; category: string }): ValidationResult {
  const text = raw.text.replace(/\s+/g, " ").trim();
  if (!(CATEGORIES as readonly string[]).includes(raw.category)) return { ok: false, reason: "category" };
  if (text.length < 15 || text.length > 140) return { ok: false, reason: "length" };
  if (!text.endsWith("?")) return { ok: false, reason: "question-mark" };
  if (text.split(NAME_TOKEN).length !== 2) return { ok: false, reason: "name-token" };
  // Name must be used in nominative form: no suffix/apostrophe right after it.
  if (/\{isim\}['’\p{L}]/u.test(text)) return { ok: false, reason: "name-suffix" };
  if (/[<>{}\[\]]/.test(text.replace(NAME_TOKEN, ""))) return { ok: false, reason: "markup" };
  if (/https?:|www\./i.test(text)) return { ok: false, reason: "url" };
  if (!isSafeQuestion(text.replace(NAME_TOKEN, "x"))) return { ok: false, reason: "unsafe" };
  return { ok: true, value: { text, category: raw.category as QuestionTemplate["category"] } };
}

export function questionKey(text: string): string {
  return normalizeAnswer(text.replace(NAME_TOKEN, ""));
}
