# Agent Guide — Dynamic Family Graph

This repository is a Next.js App Router application. It is a Hebrew, RTL family-tree product with a deterministic SVG graph layout.

## Architecture

- `app/` — Next.js routes, page UI, global styles, and API handlers
- `lib/domain.ts` — Zod schemas, typed graph model, demo data, graph traversal
- `lib/layout.ts` — deterministic family-unit layout and SVG edge paths
- `lib/auth.ts` / `lib/prisma.ts` — authentication and database access
- `prisma/schema.prisma` — PostgreSQL schema
- `scripts/import-google-sheets.ts` — validated migration utility for the existing Apps Script JSON
- `types/` — framework type augmentations
- `lib/*.test.ts` — Vitest domain and layout tests

## Conventions

1. Use strict TypeScript and React components; do not reintroduce the deleted zero-build HTML/JavaScript architecture.
2. Keep user-facing copy in Hebrew and preserve `lang="he" dir="rtl"`.
3. Validate all external input with Zod before persistence or graph operations.
4. Keep graph layout deterministic; do not replace it with force-directed physics.
5. Keep secrets in environment variables. Never expose database credentials or admin passwords in client code.
6. After graph mutations, update the typed graph state and persist through the server API.

## Commands

```bash
npm run dev
npm run typecheck
npm test
npm run build
```

Copy `.env.example` to `.env.local`, configure `DATABASE_URL` and Auth.js values, then run `npx prisma generate` before using persistence.
