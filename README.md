# שורשים — Dynamic Family Graph

Next.js + TypeScript rewrite of the original zero-build family tree.

## Development

```bash
npm install
copy .env.example .env.local
npx prisma generate
npm run dev
```

The initial browser experience uses the typed demo graph. Configure `DATABASE_URL`, run a Prisma migration, and create a family record to enable persistence.

## Verification

```bash
npm run typecheck
npm test
npm run build
```

The former zero-build `index.html`, `js/`, and `css/` architecture has been removed. The Next.js app is the only application entry point.
