# infinArena Frontend

Next.js tabanli UI uygulamasi.

## Gelistirme

Birlesik mod:

```bash
pnpm dev
```

Admin frontend (sadece admin rotalari):

```bash
pnpm dev:admin
```

Yarismaci frontend (sadece oyuncu rotalari):

```bash
pnpm dev:player
```

Varsayilan portlar:

- Birlesik / Admin: `3000`
- Yarismaci: `3001`

## Ortam Degiskenleri

- `NEXT_PUBLIC_BACKEND_URL`: frontend'in baglanacagi backend URL'i
- `FRONTEND_ROLE`: `all | admin | player` (script'ler tarafindan otomatik set edilir)

Ornek:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:7860
```
