# infinArena Backend

Express + Socket.IO + Drizzle tabanlı API sunucusu.

## Geliştirme

Birleşik mod:

```bash
pnpm dev
```

Admin backend:

```bash
pnpm dev:admin
```

Yarışmacı backend:

```bash
pnpm dev:player
```

Varsayılan portlar:

- Birleşik / Admin: `7860`
- Yarışmacı: `7861`

## Ortam Değişkenleri

- `BACKEND_ROLE`: `all | admin | player` (script'ler tarafından otomatik set edilir)
- `PORT`: dinleme portu
- Veritabanı (Supabase PostgreSQL önerilen):
	- `DATABASE_URL` (öncelikli)
	- veya `SUPABASE_DATABASE_URL`
	- veya parçalı tanım:
		- `SUPABASE_DB_HOST`
		- `SUPABASE_DB_PASSWORD`
		- `SUPABASE_DB_USER` (opsiyonel, varsayılan: `postgres`)
		- `SUPABASE_DB_PORT` (opsiyonel, varsayılan: `5432`)
		- `SUPABASE_DB_NAME` (opsiyonel, varsayılan: `postgres`)

Not: Production/Hugging Face Space ortamında DB URL verilmemişse backend başlatılmaz.

## Test

```bash
pnpm test
```

## OpenAPI (Swagger Contract)

Backend, Swagger UI ve makine-okunur OpenAPI dokümanını şu endpoint'lerde sunar:

```bash
GET /api/docs
```

```bash
GET /api/openapi.json
```

Bu sözleşme, testte doğrudan doğrulanır:

- OpenAPI belgesi semantik olarak geçerli olmalı
- Express route'larının tamamı OpenAPI dokümanında yer almalı

Bu sayede endpoint eklendiğinde/değiştiğinde sözleşme drift'i testte yakalanır.
