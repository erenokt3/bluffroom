/**
 * Question categories. Keys are locale-independent; labels are per locale so
 * additional languages can be added later.
 */
export const CATEGORIES = [
  "cocukluk",
  "anilar",
  "kisilik",
  "grup_rolleri",
  "tercihler",
  "hayali_senaryolar",
  "komik_tahminler",
  "gunluk_yasam",
  "arkadaslar",
  "rekabet",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<string, Record<Category, string>> = {
  tr: {
    cocukluk: "Çocukluk Hayalleri",
    anilar: "Komik Anılar",
    kisilik: "Kişilik & Alışkanlıklar",
    grup_rolleri: "Gruptaki Rolü",
    tercihler: "Tercihler & Favoriler",
    hayali_senaryolar: "Hayali Senaryolar",
    komik_tahminler: "Komik Tahminler",
    gunluk_yasam: "Günlük Yaşam",
    arkadaslar: "Arkadaşlar Ne Bilir?",
    rekabet: "Şaşırtıcı Rekabet",
  },
};

/** Placeholder replaced with the owner's nickname when the question is shown. */
export const NAME_TOKEN = "{isim}";

export interface QuestionTemplate {
  text: string;
  category: Category;
}

export function renderQuestion(template: string, nickname: string): string {
  return template.split(NAME_TOKEN).join(nickname);
}
