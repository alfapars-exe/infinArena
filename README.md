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

Bu repo iki role ayrik calisacak sekilde duzenlendi:

- `frontend/`: admin ve yarismaci arayuzlerini role-mode ile ayri calistirir
- `backend/`: admin ve yarismaci API yuzeylerini role-mode ile ayri calistirir

## Kurulum

```bash
pnpm install
```

## Gelistirme

### Ayrik mod (onerilen)

Terminal 1 (admin backend):

```bash
pnpm dev:backend:admin
```

Terminal 2 (yarismaci backend):

```bash
pnpm dev:backend:player
```

Terminal 3 (admin frontend):

```bash
pnpm dev:frontend:admin
```

Terminal 4 (yarismaci frontend):

```bash
pnpm dev:frontend:player
```

Varsayilan portlar:

- Admin frontend: `http://localhost:3000`
- Yarismaci frontend: `http://localhost:3001`
- Admin backend: `http://localhost:7860`
- Yarismaci backend: `http://localhost:7861`

### Birlesik mod (geriye donuk uyum)

Terminal 1:

```bash
pnpm dev:backend
```

Terminal 2:

```bash
pnpm dev:frontend
```

Varsayilan portlar:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:7860`

## Ortam Degiskenleri

- `frontend/.env.local`
  - birlesik mod icin: `NEXT_PUBLIC_BACKEND_URL=http://localhost:7860`
- `backend/.env.local`
  - birlesik mod icin: `PORT=7860`
  - `ADMIN_USERNAME=admin`
  - `ADMIN_PASSWORD=...`
  - `HUGGINGFACE_API_KEY=...`
  - `AUTH_TOKEN_SECRET=...`
  - `APP_STORAGE_DIR=./data`

## Hugging Face Space Notlari

- Space artik `AUTH_TOKEN_SECRET` ve `ADMIN_PASSWORD` eksik olsa da acilir.
- `AUTH_TOKEN_SECRET` yoksa container baslangicinda gecici (ephemeral) bir secret uretilir.
- `ADMIN_PASSWORD` yoksa bootstrap icin varsayilan `admin123` kullanilir.
- Guvenlik icin Space Settings -> Secrets altinda en az su degerleri tanimlayin:
  - `AUTH_TOKEN_SECRET`
  - `ADMIN_PASSWORD`

## Komutlar

- `pnpm build`: backend + frontend build
- `pnpm typecheck`: backend + frontend typecheck
- `pnpm test`: backend testleri

