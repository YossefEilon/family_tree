# Dynamic Family Graph

Next.js + TypeScript family-tree application with a Hebrew, RTL interface and a deterministic SVG graph layout.

The production site is deployed on Vercel:

<https://family-tree-kappa-wine.vercel.app/>

## Development

```bash
npm install
copy .env.example .env.local
npx prisma generate
npm run dev
```

The application loads the family graph through the Google Sheets API route. Configure `GOOGLE_SHEETS_API_URL` for local development. The value should be the deployed Google Apps Script web-app URL.

## Vercel deployment

Environment variables from `.env.local` are not uploaded automatically to Vercel. Configure them in the Vercel project under **Settings → Environment Variables**, then redeploy.

Required for the Google Sheets-backed graph:

```env
GOOGLE_SHEETS_API_URL="https://script.google.com/macros/s/your-deployment-id/exec"
```

The following variables are required when authentication or database persistence is enabled:

```env
DATABASE_URL="postgresql://..."
AUTH_SECRET="..."
ADMIN_EMAIL="..."
ADMIN_PASSWORD="..."
MANAGE_PASSWORD="..."
```

`DATABASE_URL` must point to a hosted PostgreSQL database reachable from Vercel. A `localhost` database URL will not work in production. Never commit or publicly share these values.

For the manage screen, add `MANAGE_PASSWORD` in Vercel with the exact password you want users to enter. In Vercel's Environment Variables form, enter the value without surrounding quote characters, select **Production**, and redeploy after saving. The value in `.env.local` is local-only and is not copied to Vercel.

After changing environment variables, create a new deployment or redeploy the latest deployment. Make sure the variables are enabled for the correct Vercel environment, especially **Production**.

## Verification

```bash
npm run typecheck
npm test
npm run build
```

The former zero-build `index.html`, `js/`, and `css/` architecture has been removed. The Next.js app is the only application entry point.

## Android app (PWA)

The site is an installable Progressive Web App for Chrome on Android:

- `app/manifest.ts` — web app manifest (`/manifest.webmanifest`), Hebrew/RTL, standalone display
- `app/pwa-icon/[variant]/route.tsx` — PNG icons (regular + maskable) generated at build time
- `public/sw.js` — service worker: offline fallback (`/offline`), cached static assets, network-first graph/stories data
- `app/pwa-provider.tsx` — registers the service worker (production only) and shows a Hebrew install banner

To install: open the production URL in Chrome on Android → tap the install banner, or ⋮ → **Install app**. Bump `VERSION` in `public/sw.js` when changing caching behavior.
