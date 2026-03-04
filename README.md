---
title: infinArena
emoji: 🎮
colorFrom: red
colorTo: blue
sdk: docker
app_port: 3000
pinned: false
---

# infinArena Monorepo

Bu repo iki role ayrık çalışacak şekilde düzenlendi:

- `frontend/`: admin ve yarışmacı arayüzlerini role-mode ile ayrı çalıştırır
- `backend/`: admin ve yarışmacı API yüzeylerini role-mode ile ayrı çalıştırır

## Kurulum

```bash
pnpm install
```

## Geliştirme

### Ayrık mod (önerilen)

Terminal 1 (admin backend):

```bash
pnpm dev:backend:admin
```

Terminal 2 (yarışmacı backend):

```bash
pnpm dev:backend:player
```

Terminal 3 (admin frontend):

```bash
pnpm dev:frontend:admin
```

Terminal 4 (yarışmacı frontend):

```bash
pnpm dev:frontend:player
```

Varsayılan portlar:

- Admin frontend: `http://localhost:3000`
- Yarışmacı frontend: `http://localhost:3001`
- Admin backend: `http://localhost:7860`
- Yarışmacı backend: `http://localhost:7861`

### Birleşik mod (geriye dönük uyum)

Terminal 1:

```bash
pnpm dev:backend
```

Terminal 2:

```bash
pnpm dev:frontend
```

Varsayılan portlar:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:7860`

## Ortam Değişkenleri

- `frontend/.env.local`
  - birleşik mod için: `NEXT_PUBLIC_BACKEND_URL=http://localhost:7860`
- `backend/.env.local`
  - birleşik mod için: `PORT=7860`
  - `ADMIN_USERNAME=admin`
  - `ADMIN_PASSWORD=...`
  - `HUGGINGFACE_API_KEY=...`
  - `AUTH_TOKEN_SECRET=...`
  - `APP_STORAGE_DIR=./data`

## Hugging Face Space Notları

- Space artık `AUTH_TOKEN_SECRET` ve `ADMIN_PASSWORD` eksik olsa da açılır.
- `AUTH_TOKEN_SECRET` yoksa container başlangıcında geçici (ephemeral) bir secret üretilir.
- `ADMIN_PASSWORD` yoksa bootstrap için varsayılan `admin123` kullanılır.
- Güvenlik için Space Settings -> Secrets altında en az şu değerleri tanımlayın:
  - `AUTH_TOKEN_SECRET`
  - `ADMIN_PASSWORD`

## Komutlar

- `pnpm build`: backend + frontend build
- `pnpm typecheck`: backend + frontend typecheck
- `pnpm test`: backend testleri
- `pnpm l10n:check`: TR/ENG metin ve i18n tutarlılık kontrolü
