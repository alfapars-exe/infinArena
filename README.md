---
title: infinArena
emoji: "🎯"
colorFrom: red
colorTo: blue
sdk: docker
pinned: false
license: mit
app_port: 7860
python_version: "3.9"
---

# infinArena - Interaktif Quiz Platformu

**infinArena**, Kahoot benzeri gercek zamanli, cok oyunculu bir interaktif quiz platformudur. Ogretmenler, egitmenler ve organizatorler icin tasarlanmis olup canli quiz oturumlari ile katilimcilarin bilgi ve becerilerini eglenceli bir sekilde test etmelerini saglar.

## Ozellikler

### Temel Ozellikler
- **Gercek Zamanli Cok Oyunculu**: Socket.IO ile anlik soru-cevap deneyimi
- **5 Soru Tipi**: Coktan secmeli, dogru/yanlis, coklu secim, metin girisi, siralama
- **Canli Skor Tablosu**: Her soru sonrasi guncellenen siralama
- **AI ile Soru Uretimi**: HuggingFace API ile otomatik quiz olusturma
- **Coklu Dil Destegi**: Turkce ve Ingilizce arayuz

### Oyuncu Deneyimi
- **Sunucu Senkronize Zamanlayici**: Admin ve oyuncu arasinda tam senkronizasyon
- **Ses Efektleri**: Web Audio API ile tick-tock, dogru/yanlis, fanfare sesleri
- **Podyum Animasyonu**: Quiz sonunda ilk 3 icin ozel animasyon ve confetti
- **Motivasyon Mesajlari**: Her soru sonrasi rastgele motivasyon mesaji
- **Oturum Kaydetme**: Sayfa yenilemede otomatik yeniden baglanma (localStorage)
- **Canli Puan Gosterimi**: Soru sirasinda azalan mevcut puan gosterimi
- **Kismi Puan**: Coklu secim sorularinda dogru secimler icin kismi puan

### Admin Paneli
- **Quiz Yonetimi**: Olusturma, duzenleme, silme, yayinlama
- **Canli Oturum Kontrolu**: Soru gecisi, istatistik goruntusu, quiz sonlandirma
- **YouTube Muzik Oynatici**: Lobby ve oturum sirasinda arka plan muzigi
- **Export Ozelligi**: Quiz draftlarini Excel/Word, sonuclari Excel olarak indirme
- **Detayli Istatistikler**: Soru bazli cevap dagilimi, oyuncu performansi

## Teknoloji Yigini

| Katman | Teknoloji | Surum |
|--------|-----------|-------|
| **Frontend** | Next.js (App Router) | 14.2.20 |
| **UI** | React | 18.3.1 |
| **Dil** | TypeScript | 5.7.2 |
| **Stil** | Tailwind CSS + Bootstrap | 3.4.16 / 5.3.8 |
| **Animasyon** | Framer Motion + canvas-confetti | 11.15.0 / 1.9.3 |
| **Durum Yonetimi** | Zustand | 5.0.2 |
| **WebSocket** | Socket.IO | 4.8.1 |
| **Veritabani** | SQLite (libsql) / PostgreSQL | - |
| **ORM** | Drizzle ORM | 0.36.4 |
| **Kimlik Dogrulama** | NextAuth.js (JWT) | 4.24.11 |
| **Dogrulama** | Zod | 3.24.1 |
| **Export** | ExcelJS + docx | 4.4.0 / 9.5.1 |
| **AI** | HuggingFace Inference API | - |

## Proje Yapisi

```
infinArena/
├── server.ts                    # Ozel HTTP sunucusu (Socket.IO entegrasyonu)
├── Dockerfile                   # Docker yapilandirmasi
├── src/
│   ├── app/                     # Next.js App Router sayfalari
│   │   ├── page.tsx             # Ana sayfa (oyuncu girisi)
│   │   ├── play/[pin]/          # Oyuncu quiz ekrani
│   │   ├── admin/               # Admin paneli
│   │   │   ├── page.tsx         # Dashboard (quiz listesi + AI uretim)
│   │   │   ├── live/[sessionId]/ # Canli oturum kontrolu
│   │   │   └── quizzes/[id]/    # Quiz duzenleyici + yayinlama + sonuclar
│   │   └── api/                 # API Route'lari
│   │       ├── ai/generate-quiz/ # AI quiz uretimi
│   │       ├── quizzes/         # Quiz CRUD
│   │       │   └── [id]/
│   │       │       ├── export/  # Quiz draft export (Excel/Word)
│   │       │       ├── publish/ # Quiz yayinlama
│   │       │       ├── questions/ # Soru CRUD
│   │       │       └── results/ # Sonuclar + export
│   │       ├── sessions/[pin]/  # Oturum sorgulama
│   │       └── upload/          # Medya yukleme
│   ├── lib/                     # Yardimci kutuphaneler
│   │   ├── errors/              # Hata yonetimi
│   │   │   ├── app-error.ts     # Ozel hata siniflari
│   │   │   ├── error-handler.ts # Merkezi hata isleyici
│   │   │   └── with-auth.ts     # Auth middleware wrapper
│   │   ├── repositories/        # Veritabani erisim katmani
│   │   │   ├── quiz.repository.ts
│   │   │   ├── session.repository.ts
│   │   │   └── player.repository.ts
│   │   ├── services/            # Is mantigi katmani
│   │   │   ├── ai.service.ts    # AI quiz uretimi
│   │   │   ├── quiz.service.ts  # Quiz islemleri
│   │   │   ├── session.service.ts # Oturum islemleri
│   │   │   └── export.service.ts  # Excel/Word export
│   │   ├── db/                  # Veritabani
│   │   │   ├── index.ts         # DB baglantisi (SQLite/PostgreSQL)
│   │   │   ├── schema.ts        # Drizzle ORM semasi
│   │   │   ├── migrations.ts    # Otomatik migration
│   │   │   └── seed.ts          # Varsayilan admin olusturma
│   │   ├── socket/              # WebSocket
│   │   │   ├── server.ts        # Socket.IO event handler'lari
│   │   │   ├── session-manager.ts # Bellek ici oturum yonetimi
│   │   │   └── events.ts        # Event tanimlari
│   │   ├── logger.ts            # Yapilandirilmis loglama
│   │   ├── auth.ts              # NextAuth yapilandirmasi
│   │   ├── i18n.ts              # Coklu dil (TR/EN)
│   │   ├── scoring.ts           # Puan hesaplama formulu
│   │   ├── validators.ts        # Zod dogrulama semalari
│   │   ├── avatars.ts           # Rastgele emoji avatar
│   │   ├── pin-generator.ts     # 6 haneli PIN uretici
│   │   └── storage.ts           # Dosya depolama yonetimi
│   └── types/                   # TypeScript tip tanimlari
│       ├── index.ts             # Socket.IO event tipleri
│       └── next-auth.d.ts       # NextAuth tip genisletmesi
```

## Mimari

### Katmanli Yapi (Clean Architecture)

```
API Route (ince katman) -> Service (is mantigi) -> Repository (DB erisimi)
                                                      |
                                                  Drizzle ORM -> SQLite/PostgreSQL
```

- **API Route'lar**: Auth kontrolu + service cagrisi + response (3 adim)
- **Service Katmani**: Is mantigi, dogrulama, is kurallari
- **Repository Katmani**: Veritabani sorgulari, veri erisimi
- **Hata Yonetimi**: `AppError` sinif hiyerarsisi + merkezi `handleApiError`
- **Loglama**: Context bazli yapilandirilmis log sistemi (`[AI]`, `[Socket]`, `[DB]`)

### Socket.IO Event Akisi

```
Oyuncu                    Sunucu                    Admin
  |                         |                         |
  |-- player:join --------->|                         |
  |<- player:joined-success |-- lobby:player-joined ->|
  |                         |<- admin:start-quiz -----|
  |<- game:countdown -------|-- game:countdown ------>|
  |<- game:question-start --|-- game:question-start ->|
  |-- player:answer ------->|                         |
  |<- game:answer-ack ------|                         |
  |                    [timer biter]                   |
  |<- game:batch-results ---|-- game:question-stats ->|
  |<- game:leaderboard -----|-- game:leaderboard ---->|
  |                         |<- admin:next-question --|
  |                    [tum sorular biter]             |
  |<- game:quiz-ended ------|-- game:quiz-ended ----->|
```

## Kurulum

### Gereksinimler
- Node.js 18+
- pnpm 10+

### Yerel Gelistirme

```bash
# Bagimliliklari yukle
pnpm install

# Gelistirme sunucusunu baslat
pnpm dev
```

Uygulama `http://localhost:7860` adresinde calisir.

### Uretim Build

```bash
pnpm build
pnpm start
```

### Ortam Degiskenleri

`.env.local` dosyasi olusturun:

```env
# Zorunlu
NEXTAUTH_SECRET=guclu-rastgele-bir-deger

# Opsiyonel
APP_STORAGE_DIR=./data               # Depolama koku (varsayilan: ./data)
DATABASE_URL=file:./data/quiz.db     # Veritabani URL'si
HUGGINGFACE_API_KEY=hf_xxxxx         # AI quiz uretimi icin
LOG_LEVEL=info                       # debug | info | warn | error
PORT=7860                            # Sunucu portu
```

| Degisken | Aciklama | Varsayilan |
|----------|----------|-----------|
| `NEXTAUTH_SECRET` | JWT sifreleme anahtari | Dahili deger |
| `APP_STORAGE_DIR` | DB ve uploads koku | `./data` (yerel), `/data/infinarena` (HF) |
| `DATABASE_URL` | Veritabani baglanti URL'si | `file:<APP_STORAGE_DIR>/quiz.db` |
| `HUGGINGFACE_API_KEY` | HuggingFace API anahtari | - |
| `REQUIRE_PERSISTENT_STORAGE` | Kalici depolama zorunlulugu | `false` (yerel), `true` (HF) |
| `LOG_LEVEL` | Minimum log seviyesi | `info` (uretim), `debug` (gelistirme) |
| `PORT` | HTTP sunucu portu | `7860` |

## Kullanim

### 1. Admin Paneli
- `/infinarenapanel/login` adresinden giris yapin
- Varsayilan kimlik bilgileri: `admin` / `inFina2026!!**`

### 2. Quiz Olusturma
- Dashboard'dan "Yeni Quiz" veya "AI ile Olustur" secin
- AI ile: Konu, zorluk, soru sayisi, model ve dil secin
- Manuel: Soru ekle, secenekleri ayarla, dogru cevabi isaretle

### 3. Quiz Yayinlama
- Quiz duzenleyicisinden "Yayinla" butonuna basin
- Otomatik 6 haneli PIN olusturulur
- PIN'i katilimcilarla paylasin

### 4. Canli Oturum
- Admin canli oturum ekraninda quiz akisini kontrol eder
- "Basla" ile geri sayim baslar, sorular sirayla gonderilir
- Her soru sonrasi istatistikler ve skor tablosu gosterilir

### 5. Oyuncu Katilimi
- Ana sayfa (`/`) veya `/play/<PIN>` adresinden katilim
- Rumuz girin, quiz baslayana kadar lobi'de bekleyin
- Sorulari cevaplayin, skorunuzu takip edin

### 6. Export
- Quiz duzenleyicisinde "Export" butonu ile soru draftini Excel/Word olarak indirin
- Yayinlama sayfasinda gecmis oturum sonuclarini Excel olarak indirin

## Veritabani Semasi

| Tablo | Aciklama |
|-------|----------|
| `admins` | Admin kullanicilari (username, email, passwordHash) |
| `quizzes` | Quizler (title, description, status, adminId) |
| `questions` | Sorular (questionText, questionType, timeLimitSeconds, basePoints) |
| `answer_choices` | Secenekler (choiceText, isCorrect, orderIndex) |
| `quiz_sessions` | Canli oturumlar (pin, status, isLive) |
| `players` | Oyuncular (nickname, avatar, totalScore, isConnected) |
| `player_answers` | Oyuncu cevaplari (choiceId, isCorrect, responseTimeMs, pointsAwarded) |

## Puan Hesaplama

```
puan = basePoints - (gecenSaniye / deductionInterval) * deductionPoints
minimum puan = 100 (dogru cevap icin)
```

- **Seri Bonusu**: 3+ ardisik dogru: %10, 5+ ardisik dogru: %20
- **Kismi Puan** (coklu secim): `selectedCorrect / totalCorrect` orani ile carpilir

## Deployment

### Docker

```bash
docker build -t infinarena .
docker run -p 7860:7860 -v /data:/data infinarena
```

### HuggingFace Spaces

1. Space'i Docker SDK ile olusturun
2. **Persistent Storage**'i etkinlestirin (Space ayarlari)
3. Secrets ekleyin:
   - `NEXTAUTH_SECRET`: Guclu rastgele deger
   - `HUGGINGFACE_API_KEY`: AI quiz uretimi icin (opsiyonel)
4. Deploy edin

### Kalicilik Kontrolu

1. Uygulamayi deploy edin
2. Yeni bir quiz olusturun ve bir gorsel yukleyin
3. Yeni bir deploy tetikleyin (commit push)
4. Admin panelini tekrar acin
5. Dogrulayin: Quiz hala mevcut, yuklenen gorsel hala calisiyor

## API Endpoint'leri

| Method | Endpoint | Aciklama |
|--------|----------|----------|
| GET | `/api/quizzes` | Tum quizleri listele |
| POST | `/api/quizzes` | Yeni quiz olustur |
| GET | `/api/quizzes/:id` | Quiz detayi (sorularla) |
| PUT | `/api/quizzes/:id` | Quiz guncelle |
| DELETE | `/api/quizzes/:id` | Quiz sil |
| POST | `/api/quizzes/:id/questions` | Soru ekle |
| PUT | `/api/quizzes/:id/questions` | Soru guncelle |
| DELETE | `/api/quizzes/:id/questions?questionId=X` | Soru sil |
| POST | `/api/quizzes/:id/publish` | Quiz yayinla (PIN olustur) |
| GET | `/api/quizzes/:id/results` | Quiz sonuclari |
| GET | `/api/quizzes/:id/export?format=excel\|word` | Quiz draft export |
| GET | `/api/quizzes/:id/results/export` | Sonuc export (Excel) |
| POST | `/api/ai/generate-quiz` | AI ile quiz olustur |
| GET | `/api/sessions/:pin` | Oturum bilgisi |
| POST | `/api/upload` | Medya yukleme |

## Lisans

MIT
