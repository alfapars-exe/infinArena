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
- Veritabani (Supabase PostgreSQL onerilen):
	- `DATABASE_URL` (oncelikli)
	- veya `SUPABASE_DATABASE_URL`
	- veya parcali tanim:
		- `SUPABASE_DB_HOST`
		- `SUPABASE_DB_PASSWORD`
		- `SUPABASE_DB_USER` (opsiyonel, varsayilan: `postgres`)
		- `SUPABASE_DB_PORT` (opsiyonel, varsayilan: `5432`)
		- `SUPABASE_DB_NAME` (opsiyonel, varsayilan: `postgres`)

Not: Production/Hugging Face Space ortaminda DB URL verilmemisse backend baslatilmaz.

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
