# BluffRoom — Real-Time Multiplayer Party Game 🎭

Arkadaş gruplarının akıllı telefonlarıyla internet üzerinden oynayabildiği, oyuncuların birbirlerini kandırmaya çalıştığı, gerçek zamanlı ve premium kalitede bir blöf parti oyunu.

---

## 🚀 Öne Çıkan Özellikler

- **Multiplayer & Mobil Öncelikli:** 4 - 12 kişilik odalar, 360px mobil ekranlara tam uyumlu arayüz.
- **Sunucu Otoriter Oyun Motoru:** Puanlama, aşama geçişleri, gizli cevaplar ve oylar tamamen güvenli sunucu tarafında (transaction kilitli) yönetilir.
- **İmzalı Misafir Oturumu (HMAC):** localStorage manipülasyonuyla başka oyuncunun kimliğini taklit etmeyi önleyen kriptografik oturum token'ları.
- **Deny-All RLS Güvenliği:** Tarayıcı veritabanı tablolarına doğrudan erişemez. Gizli gerçek cevaplar ve oy sahiplikleri zamanından önce sızdırılamaz.
- **Gerçek Zamanlı Senkronizasyon:** Supabase Realtime Broadcast (yalnızca durum sinyali taşır) ve yerel SSE (Server-Sent Events) fallback altyapısı.
- **Yapay Zekâ Soru Sistemi & Fallback:** Google Gemini, OpenAI veya Anthropic ile 10 soruluk oyun planı üretimi. Anahtar yoksa veya servis yanıt vermezse devreye giren 80+ soruluk zengin Türkçe soru havuzu.

---

## 🛠️ Teknoloji Yığını

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS
- **Backend:** Next.js Route Handlers, Node.js Crypto, Jose (JWT/JWS)
- **Veritabanı:** Supabase PostgreSQL (`postgres.js`) + Yerel/Test için `@electric-sql/pglite` (WASM Postgres)
- **Realtime:** Supabase Broadcast + Local SSE
- **Test:** Vitest, Testing Library, PGlite

---

## 📦 Kurulum ve Yerel Çalıştırma

BluffRoom, harici bir PostgreSQL servisine veya API anahtarına ihtiyaç duymadan **PGlite** ve **SSE** kullanarak kendi içinde çalışabilir!

1. Bağımlılıkları yükleyin:
   ```bash
   npm install
   ```

2. Ortam değişkenlerini kopyalayın:
   ```bash
   cp .env.example .env.local
   ```
   *(Yerel geliştirme için `.env.local` dosyasında zorunlu bir anahtar girmeniz gerekmez; sistem varsayılan güvenli geliştirme değerleriyle çalışır).*

3. Geliştirme sunucusunu başlatın:
   ```bash
   npm run dev
   ```
   Tarayıcınızda `http://localhost:3000` adresine gidin.

---

## 🧪 Testleri Çalıştırma

Tüm birim ve entegrasyon testlerini (gerçek SQL migration'ları PGlite üzerinde koşar) yürütmek için:

```bash
# Tüm testler
npm run test

# TypeScript kontrolü
npm run typecheck

# Lint kontrolü
npm run lint

# Üretim derlemesi (Production build)
npm run build
```

---

## ☁️ Supabase Kurulumu ve Migration

1. [Supabase](https://supabase.com) üzerinde yeni bir proje oluşturun.
2. **Project Settings -> Database** bölümünden **Connection Pooling (Transaction mode, port 6543)** URL'sini kopyalayın.
3. SQL Editor bölümünden `supabase/migrations/20261013000000_init.sql` dosyasının içeriğini çalıştırarak tabloları, RLS kurallarını ve tetikleyicileri oluşturun.
4. `.env.local` veya Vercel panelinde şu değişkenleri tanımlayın:
   ```env
   DATABASE_URL=postgres://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
   NEXT_PUBLIC_SUPABASE_URL=https://[ref].supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon_key]
   SUPABASE_SERVICE_ROLE_KEY=[service_role_key]
   SESSION_SECRET=[en-az-32-karakterlik-rastgele-anahtar]
   ```

---

## 🚀 Vercel Deployment

1. Projeyi GitHub reponuza push edin.
2. Vercel paneline projeyi import edin.
3. Yukarıda listelenen `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ve `SESSION_SECRET` değişkenlerini Vercel Environment Variables bölümüne ekleyin.
4. İsteğe bağlı olarak yapay zekâ anahtarını ekleyin:
   ```env
   AI_PROVIDER=gemini
   AI_API_KEY=[gemini_api_anahtari]
   ```
5. **Deploy** butonuna basın. Projeniz Vercel üzerinde canlıya alınacaktır.
