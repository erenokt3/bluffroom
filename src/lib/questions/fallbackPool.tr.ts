import type { QuestionTemplate } from "./categories";

/**
 * Curated, safe Turkish fallback pool used when the AI provider is not
 * configured, times out or returns invalid output. The name is always used in
 * the nominative form ("{isim} ...") so no Turkish case suffixes are needed.
 */
export const FALLBACK_QUESTIONS_TR: QuestionTemplate[] = [
  // Çocukluk
  { category: "cocukluk", text: "{isim} küçükken büyüyünce ne olmak isterdi?" },
  { category: "cocukluk", text: "{isim} çocukken en çok hangi çizgi filmi izlerdi?" },
  { category: "cocukluk", text: "{isim} çocukken hangi oyuncağından hiç ayrılmazdı?" },
  { category: "cocukluk", text: "{isim} ilkokulda en çok hangi derste sıkılırdı?" },
  { category: "cocukluk", text: "{isim} çocukken hangi yemeği asla yemezdi?" },
  { category: "cocukluk", text: "{isim} küçükken hangi süper güce sahip olmak isterdi?" },
  { category: "cocukluk", text: "{isim} çocukken en çok neyle övünürdü?" },
  { category: "cocukluk", text: "{isim} küçükken hangi hayvanı evde beslemek isterdi?" },
  // Anılar
  { category: "anilar", text: "{isim} hangi komik anısını herkese tekrar tekrar anlatır?" },
  { category: "anilar", text: "{isim} bir tatilde nasıl komik bir olay yaşamıştır?" },
  { category: "anilar", text: "{isim} hayatında yaptığı en saçma alışverişte ne almıştır?" },
  { category: "anilar", text: "{isim} şimdiye kadar hangi tuhaf eşyayı kaybetmiştir?" },
  { category: "anilar", text: "{isim} en son neye kahkahalarla gülmüştür?" },
  { category: "anilar", text: "{isim} okulda hangi yaramazlıkla yakalanmıştır?" },
  { category: "anilar", text: "{isim} yemek yaparken nasıl bir felakete imza atmıştır?" },
  { category: "anilar", text: "{isim} yanlış kişiye hangi komik mesajı göndermiş olabilir?" },
  // Kişilik ve alışkanlıklar
  { category: "kisilik", text: "{isim} en çok hangi kelimeyi ya da lafı kullanır?" },
  { category: "kisilik", text: "{isim} sabah uyanınca ilk ne yapar?" },
  { category: "kisilik", text: "{isim} sinirlenince ne yapar?" },
  { category: "kisilik", text: "{isim} hangi küçük alışkanlığından asla vazgeçemez?" },
  { category: "kisilik", text: "{isim} canı sıkılınca telefonda ne yapar?" },
  { category: "kisilik", text: "{isim} en çok hangi konuda inatçıdır?" },
  { category: "kisilik", text: "{isim} bir partide genelde ne yaparken bulunur?" },
  { category: "kisilik", text: "{isim} en çok neden korkar?" },
  { category: "kisilik", text: "{isim} kendini tek bir emojiyle anlatsa hangisini seçerdi?" },
  // Gruptaki rolü
  { category: "grup_rolleri", text: "{isim} arkadaş grubunda hangi görevi üstlenir?" },
  { category: "grup_rolleri", text: "{isim} grup tatilinde neyi organize etmeyi üstlenirdi?" },
  { category: "grup_rolleri", text: "{isim} grup sohbetine en çok ne tür mesaj atar?" },
  { category: "grup_rolleri", text: "{isim} bir soygun filminde ekipte hangi rolü alırdı?" },
  { category: "grup_rolleri", text: "{isim} bir buluşmaya geç kalınca hangi bahaneyi uydurur?" },
  { category: "grup_rolleri", text: "{isim} grup fotoğrafında hep nasıl poz verir?" },
  { category: "grup_rolleri", text: "{isim} bir zombi istilasında hayatta kalmak için ne yapardı?" },
  // Tercihler ve favoriler
  { category: "tercihler", text: "{isim} en çok hangi yemeği sever?" },
  { category: "tercihler", text: "{isim} hangi filmi ya da diziyi tekrar tekrar izleyebilir?" },
  { category: "tercihler", text: "{isim} hayatı boyunca tek bir içecek içebilse ne seçerdi?" },
  { category: "tercihler", text: "{isim} en çok hangi mevsimi sever?" },
  { category: "tercihler", text: "{isim} karaokede hangi şarkıyı seçerdi?" },
  { category: "tercihler", text: "{isim} pizzasına mutlaka ne koyar?" },
  { category: "tercihler", text: "{isim} rüya tatili için hangi ülkeye giderdi?" },
  { category: "tercihler", text: "{isim} bir günlüğüne hangi hayvan olmak isterdi?" },
  // Hayali senaryolar
  { category: "hayali_senaryolar", text: "{isim} bir günlüğüne ünlü olsa ne yapardı?" },
  { category: "hayali_senaryolar", text: "{isim} 1 milyon TL kazansa ilk ne alırdı?" },
  { category: "hayali_senaryolar", text: "{isim} ıssız bir adaya düşse yanına hangi üç şeyi alırdı?" },
  { category: "hayali_senaryolar", text: "{isim} zamanda yolculuk yapabilse hangi döneme giderdi?" },
  { category: "hayali_senaryolar", text: "{isim} bir gün görünmez olsa ne yapardı?" },
  { category: "hayali_senaryolar", text: "{isim} kendi restoranını açsa adı ne olurdu?" },
  { category: "hayali_senaryolar", text: "{isim} bir film çekse konusu ne olurdu?" },
  { category: "hayali_senaryolar", text: "{isim} bir sabah başka bir ülkede uyansa ilk ne yapardı?" },
  { category: "hayali_senaryolar", text: "{isim} bir uygulama icat etse ne işe yarardı?" },
  { category: "hayali_senaryolar", text: "{isim} bir yarışma programına katılsa hangisini seçerdi?" },
  // Komik tahminler
  { category: "komik_tahminler", text: "{isim} 20 yıl sonra ne iş yapıyor olacak?" },
  { category: "komik_tahminler", text: "{isim} bir realite şovunda ilk hafta neden elenirdi?" },
  { category: "komik_tahminler", text: "{isim} kendi hayatını film yapsa adını ne koyardı?" },
  { category: "komik_tahminler", text: "{isim} bir kitap yazsa başlığı ne olurdu?" },
  { category: "komik_tahminler", text: "{isim} emekli olunca nerede yaşıyor olacak?" },
  { category: "komik_tahminler", text: "{isim} viral olsa hangi videoyla olurdu?" },
  { category: "komik_tahminler", text: "{isim} bir YouTube kanalı açsa konusu ne olurdu?" },
  { category: "komik_tahminler", text: "{isim} bir rekor kırsa bu hangi rekor olurdu?" },
  // Günlük yaşam
  { category: "gunluk_yasam", text: "{isim} buzdolabında her zaman ne bulundurur?" },
  { category: "gunluk_yasam", text: "{isim} telefonunda en çok hangi uygulamayı kullanır?" },
  { category: "gunluk_yasam", text: "{isim} hafta sonu en çok ne yapmayı sever?" },
  { category: "gunluk_yasam", text: "{isim} market alışverişinde sepetine ilk ne atar?" },
  { category: "gunluk_yasam", text: "{isim} duş alırken hangi şarkıyı söyler?" },
  { category: "gunluk_yasam", text: "{isim} çantasında ya da cebinde mutlaka ne taşır?" },
  { category: "gunluk_yasam", text: "{isim} uyumadan önce son olarak ne yapar?" },
  { category: "gunluk_yasam", text: "{isim} kahvaltıda neden asla vazgeçmez?" },
  // Arkadaşlar ne bilir
  { category: "arkadaslar", text: "{isim} kimsenin bilmediği hangi gizli yeteneğe sahip olabilir?" },
  { category: "arkadaslar", text: "{isim} arkadaşlarına en çok hangi tavsiyeyi verir?" },
  { category: "arkadaslar", text: "{isim} bir arkadaşına doğum gününde ne hediye eder?" },
  { category: "arkadaslar", text: "{isim} en çok hangi ünlüye benzetilir?" },
  { category: "arkadaslar", text: "{isim} hangi konuda saatlerce konuşabilir?" },
  { category: "arkadaslar", text: "{isim} arkadaşlarıyla buluşunca en çok nereye gitmek ister?" },
  { category: "arkadaslar", text: "{isim} en çok hangi lafla tanınır?" },
  // Rekabet
  { category: "rekabet", text: "{isim} hangi oyunda kaybetmeye asla dayanamaz?" },
  { category: "rekabet", text: "{isim} olimpiyatlara katılsa hangi branşta yarışırdı?" },
  { category: "rekabet", text: "{isim} hangi konuda herkesten daha iyi olduğunu iddia eder?" },
  { category: "rekabet", text: "{isim} bir yemek yarışmasında hangi yemeği yapardı?" },
  { category: "rekabet", text: "{isim} bir bilgi yarışmasında hangi kategoride kazanırdı?" },
  { category: "rekabet", text: "{isim} bir bahsi kaybetse ceza olarak ne yapmayı kabul ederdi?" },
];
