# infinArena Backend

Express + Socket.IO + Drizzle tabanli API sunucusu.

## Gelistirme

Birlesik mod:

```bash
pnpm dev
```

Admin backend:

```bash
pnpm dev:admin
```

Yarismaci backend:

```bash
pnpm dev:player
```

Varsayilan portlar:

- Birlesik / Admin: `7860`
- Yarismaci: `7861`

## Ortam Degiskenleri

- `BACKEND_ROLE`: `all | admin | player` (script'ler tarafindan otomatik set edilir)
- `PORT`: dinleme portu

## Test

```bash
pnpm test
```

## OpenAPI (Swagger Contract)

Backend, Swagger UI ve makine-okunur OpenAPI dokumanini su endpoint'lerde sunar:

```bash
GET /api/docs
```

```bash
GET /api/openapi.json
```

Bu sozlesme, testte dogrudan dogrulanir:

- OpenAPI belgesi semantik olarak gecerli olmali
- Express route'larinin tamami OpenAPI dokumaninda yer almali

Bu sayede endpoint eklendiginde/degistiginde sozlesme drift'i testte yakalanir.
