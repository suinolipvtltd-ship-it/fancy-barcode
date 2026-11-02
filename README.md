This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Inventory + Chrome extension

Beyond label generation, the app now stores products/stock and accepts sales from
a companion Chrome extension (`extension/`). The extension detects sales on
Swipe, books a Google Calendar reminder for the same customer one year later,
and looks up live stock by scanning a product QR code.

Setup, in order:

```bash
psql "$DATABASE_URL" -f scripts/migrate.sql        # products, sales, api_tokens, …
npm run import-products -- sample-products.csv     # bulk-load SKUs + stock
npm run issue-token -- you@example.com "Chrome extension"
```

Then follow [`extension/README.md`](extension/README.md) (Google OAuth client,
loading the unpacked extension, settings).

New endpoints: `GET|POST /api/inventory`, `POST /api/inventory/scan`,
`POST /api/sales`, `POST /api/calendar/events`, `GET|POST|DELETE /api/tokens`.
Product QR codes point at `/p/<sku>`, a public read-only stock page.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
