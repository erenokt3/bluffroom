/**
 * Question plan generator: asks the configured AI provider for question
 * TEMPLATES only (never answers), validates them, and tops up from the curated
 * fallback pool. Never throws – the game must not crash if the AI is down.
 */
import { GAME_CONFIG } from "../config";
import { cryptoRng, shuffle, type Rng } from "../game/random";
import { CATEGORIES, NAME_TOKEN, type QuestionTemplate } from "./categories";
import { FALLBACK_QUESTIONS_TR } from "./fallbackPool.tr";
import { callAiProvider, extractJson, getAiConfig, type AiConfig } from "./providers";
import { aiResponseSchema, questionKey, validateQuestionTemplate } from "./validate";

export interface PlannedQuestion extends QuestionTemplate {
  source: "ai" | "fallback";
}

export interface QuestionPlan {
  questions: PlannedQuestion[];
  source: "ai" | "fallback" | "mixed";
  aiError?: string;
}

const SYSTEM_PROMPT_TR = `Sen arkadaş gruplarının oynadığı "BluffRoom" adlı bir blöf parti oyunu için soru yazarısın.
Görevin, bir oyuncu hakkında sorulacak kısa, eğlenceli, yaratıcı Türkçe sorular üretmek.
Sorunun cevabını SADECE sorulan oyuncu bilir; diğer oyuncular inandırıcı yalan cevaplar uyduracak.
Kurallar:
- Her soru oyuncunun adı yerine tam olarak bir kez "${NAME_TOKEN}" yer tutucusunu içermeli.
- "${NAME_TOKEN}" her zaman cümlenin öznesi olarak, EKSİZ kullanılmalı (örn. "${NAME_TOKEN} çocukken ne olmak isterdi?"). "${NAME_TOKEN}'in", "${NAME_TOKEN}'e" gibi ekler YASAK.
- Sorular 15-120 karakter, açık, kısa ve soru işaretiyle bitmeli.
- Aşağılayıcı, cinsel, siyasi, dini, sağlıkla ilgili, para/borç/maaş gibi hassas kişisel bilgi isteyen veya utandırıcı sorular YASAK.
- Sorular birbirinin kopyası veya çok benzeri olmamalı.
- Cevap ÜRETME, sadece soru üret.
- Yalnızca geçerli JSON döndür.`;

function userPrompt(count: number) {
  return `${count} adet soru üret. Kategorileri dengeli dağıt. Kullanılabilecek kategori anahtarları: ${CATEGORIES.join(", ")}.
Yanıt biçimi (sadece JSON):
{"questions":[{"text":"${NAME_TOKEN} küçükken ne olmak isterdi?","category":"cocukluk"}]}`;
}

/** Pick `count` questions maximising category variety and avoiding duplicates. */
function pickDiverse(
  pool: PlannedQuestion[],
  count: number,
  usedKeys: Set<string>,
  usedCategories: Map<string, number>,
  rng: Rng,
): PlannedQuestion[] {
  const out: PlannedQuestion[] = [];
  const shuffled = shuffle(pool, rng);
  for (let maxPerCat = 1; maxPerCat <= count && out.length < count; maxPerCat++) {
    for (const q of shuffled) {
      if (out.length >= count) break;
      const key = questionKey(q.text);
      if (usedKeys.has(key)) continue;
      if ((usedCategories.get(q.category) ?? 0) >= maxPerCat) continue;
      usedKeys.add(key);
      usedCategories.set(q.category, (usedCategories.get(q.category) ?? 0) + 1);
      out.push(q);
    }
  }
  return out;
}

export function fallbackPlan(count: number = GAME_CONFIG.totalRounds, rng: Rng = cryptoRng): QuestionPlan {
  const pool = FALLBACK_QUESTIONS_TR.map((q) => ({ ...q, source: "fallback" as const }));
  return { questions: pickDiverse(pool, count, new Set(), new Map(), rng), source: "fallback" };
}

export async function requestAiQuestions(cfg: AiConfig, count: number, timeoutMs: number): Promise<QuestionTemplate[]> {
  const raw = await callAiProvider(cfg, {
    system: SYSTEM_PROMPT_TR,
    user: userPrompt(count),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const parsed = aiResponseSchema.parse(extractJson(raw));
  const valid: QuestionTemplate[] = [];
  for (const q of parsed.questions) {
    const r = validateQuestionTemplate(q);
    if (r.ok) valid.push(r.value);
  }
  return valid;
}

export async function generateQuestionPlan(
  opts: { count?: number; rng?: Rng; timeoutMs?: number; config?: AiConfig | null } = {},
): Promise<QuestionPlan> {
  const count = opts.count ?? GAME_CONFIG.totalRounds;
  const rng = opts.rng ?? cryptoRng;
  const cfg = opts.config === undefined ? getAiConfig() : opts.config;
  if (!cfg) {
    return { ...fallbackPlan(count, rng), aiError: "AI_API_KEY tanımlı değil; yedek soru havuzu kullanıldı." };
  }
  let aiQuestions: PlannedQuestion[] = [];
  let aiError: string | undefined;
  try {
    // Ask for a few extra so filtering still leaves enough.
    const got = await requestAiQuestions(cfg, count + 4, opts.timeoutMs ?? GAME_CONFIG.ai.timeoutMs);
    aiQuestions = got.map((q) => ({ ...q, source: "ai" as const }));
  } catch (err) {
    aiError = err instanceof Error ? err.message : "AI isteği başarısız";
    console.warn("[ai] question generation failed, using fallback:", aiError);
  }
  const usedKeys = new Set<string>();
  const usedCategories = new Map<string, number>();
  // Prefer AI questions with up to 2 per category, then top up from the pool.
  const fromAi = pickDiverse(aiQuestions, count, usedKeys, usedCategories, rng).slice(0, count);
  const missing = count - fromAi.length;
  const fromPool =
    missing > 0
      ? pickDiverse(
          FALLBACK_QUESTIONS_TR.map((q) => ({ ...q, source: "fallback" as const })),
          missing,
          usedKeys,
          usedCategories,
          rng,
        )
      : [];
  const questions = shuffle([...fromAi, ...fromPool], rng);
  const source = fromPool.length === 0 ? "ai" : fromAi.length === 0 ? "fallback" : "mixed";
  return { questions, source, aiError };
}
