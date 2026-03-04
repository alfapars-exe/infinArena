# infinArena Frontend

Next.js tabanlı UI uygulaması.

## Geliştirme

Birleşik mod:

```bash
pnpm dev
```

Admin frontend (sadece admin rotaları):

```bash
pnpm dev:admin
```

Yarışmacı frontend (sadece oyuncu rotaları):

```bash
pnpm dev:player
```

Varsayılan portlar:

- Birleşik / Admin: `3000`
- Yarışmacı: `3001`

## Ortam Değişkenleri

- `NEXT_PUBLIC_BACKEND_URL`: frontend'in bağlanacağı backend URL'i
- `FRONTEND_ROLE`: `all | admin | player` (script'ler tarafından otomatik set edilir)

Örnek:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:7860
```
