# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
npm run build              # tsc — compile TypeScript to dist/
npm start                  # run migrations + start server (all bots)
npm run migration:generate -- src/lib/db/migrations/MigrationName  # generate migration after entity changes
npm run migration:run      # compile + run pending migrations
npm run invoice:cli -- "<pairzon-url>"   # interactive CLI invoice classifier
npm run invoice:month -- [YYYY-MM]       # monthly spend summary (interactive if no arg)
npm run invoice:push -- "<pairzon-or-rami-levy-url>"  # fetch an invoice locally (must run from Israel) and push it to the deployed web app via API
```

No test framework is configured (`npm test` is a no-op).

## Architecture

**ESM project** (`"type": "module"`) — all imports use `.js` extensions even for `.ts` source files. TypeScript compiles to `dist/` with `module: NodeNext`.

### Entry Point

`src/index.ts` initializes TypeORM (`AppDataSource`), starts **three Telegram bots** (polling mode), and an Express server on port 3000.

### Telegram Bots

Each bot module exports `initTelegramBotManager()` and uses its own bot token env var:

| Module | Token Env Var | Purpose |
|---|---|---|
| `src/index.ts` (main) | `TELEGRAM_BOT_TOKEN` | Article reading, PDF extraction, link suggestions |
| `src/lib/linksBot.ts` | `TELEGRAM_LINKS_BOT_TOKEN` | Save/list URLs with DB persistence |
| `src/lib/invoicesSummaryBot.ts` | `TELEGRAM_INVOICES_BOT_TOKEN` | DB-backed invoice submit/classify/summary (also handles plain pasted links) |

Bot pattern: `new TelegramBot(token, { polling: true })`, then `bot.onText()` for commands, `bot.on('callback_query')` for inline keyboards, `bot.on('message')` for general messages.

### Database

PostgreSQL via TypeORM. Config in `src/lib/data-source.ts`. Entities and migrations are loaded from `dist/` (compiled JS).

**Entities** in `src/lib/db/entity/`: `User`, `Link`, `Invoice`, `InvoiceItem` — all use UUID PKs and `createdAt`/`updatedAt` timestamps.

**Circular import pattern**: For bidirectional entity relations, use `import * as Module from './Entity.js'` and type the relation field as `Module.Entity | undefined` (union with undefined makes TypeScript emit `Object` for decorator metadata, avoiding initialization errors).

### CLI Tools

`src/lib/invoicesCli.ts` and `src/lib/invoicesMonthSummary.ts` are standalone scripts (run via `npm run invoice:cli` / `npm run invoice:month`). They work with CSV files in `/mnt/c/Users/Yehez/Downloads/invoices/` (WSL2 path) — completely independent of the DB.

### Web App & Invoice API

`src/lib/invoicesApi.ts` mounts an Express router (under `/api`) used by the React client in `client/`. Every route requires `Authorization: Bearer <WEB_SECRET>`. Key routes: `GET /invoices`, `POST /invoices` (fetches a URL server-side and saves it), `POST /invoices/import` (saves pre-fetched invoice JSON — no server-side fetch), `PATCH /invoices/:id`, `DELETE /invoices/:id`, `PATCH /items/:id`.

**Israel-only invoice sources**: pairzon.com and rami-levy.co.il block/reject requests from outside Israel, so `POST /invoices` fails when the server isn't running in Israel (e.g. the Railway deployment, which runs in US West). Workaround: run `npm run invoice:push -- "<url>"` locally (in Israel) — it fetches the invoice data locally via `getInvoiceDataFromUrl` (`src/lib/invoicesBot.ts`) and POSTs the already-fetched JSON to the deployed app's `POST /api/invoices/import`, so the deployed DB gets the invoice without the deployed server ever needing to reach the Israeli site itself. Requires `PROD_API_URL` and `PROD_WEB_SECRET` (the deployed app's `WEB_SECRET`, which may differ from the local one) in `.env`.

## Environment Variables

Required in `.env` (gitignored): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_LINKS_BOT_TOKEN`, `TELEGRAM_INVOICES_BOT_TOKEN`, `POSTGRES_USERNAME`, `POSTGRES_PASSWORD`, `DB_HOST`, `POSTGRES_PORT`, `BITES_DB`, `WEB_SECRET` (auth for the invoice API/web client).

For `npm run invoice:push`: `PROD_API_URL` (the deployed app's base URL) and `PROD_WEB_SECRET` (its `WEB_SECRET` value).

## Key Conventions

- Migration files: `{timestamp}-{PascalCaseName}.ts` with raw SQL in `queryRunner.query()`
- Bots gracefully skip init if their token env var is missing
- `npm run migration:generate` requires a running PostgreSQL instance to diff against
