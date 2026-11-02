# Fancy Barcode browser extension

A Chrome (Manifest V3) extension that does two things:

1. **Sale → birthday reminder.** Watches Swipe (`app.getswipe.in`). When an
   invoice is saved / payment is received, it scrapes the customer and items,
   records the sale in Fancy Barcode (decrementing stock) and creates an
   all-day Google Calendar event one year later with the customer details in
   the description.
2. **QR stock check.** A camera scanner (or manual SKU entry) that shows the
   live stock count for whatever product QR code you scan. Read-only — scanning
   never changes stock; only a recorded sale does.

```
extension/
├── manifest.json          MV3 manifest (edit the OAuth client id here)
├── background.js          service worker: API calls, Calendar, retry queue
├── lib/
│   ├── api.js             fetch wrapper + endpoints
│   ├── calendar.js        Google Calendar all-day event creation
│   ├── dates.js           anniversary date maths (mirrors src/lib/birthday.ts)
│   ├── sku.js             QR payload parsing (mirrors src/lib/inventory.ts)
│   └── storage.js         chrome.storage helpers + default settings
├── content/swipe.js       Swipe detector, floating panel, confirm dialog
├── popup/                 toolbar popup (status, scanner, connect Google)
├── options/               settings page (API URL, token, reminder offsets)
└── scanner/               camera + manual stock lookup page
```

## 1. Prepare the backend

```bash
# 1. Apply the new tables (products, sales, customers, calendar_events, api_tokens…)
psql "$DATABASE_URL" -f scripts/migrate.sql     # or paste into the Neon SQL editor

# 2. Import your products (SKU is what the QR code must contain)
npm run import-products -- sample-products.csv

# 3. Mint an API token for the extension (printed once)
npm run issue-token -- you@example.com "Chrome extension"
```

Deploy (or run `npm run dev`) and confirm `GET /api/inventory?sku=<sku>` works
with `Authorization: Bearer <token>`.

## 2. Create the Google OAuth client

1. <https://console.cloud.google.com/> → new project (or reuse one).
2. **APIs & services → Library → Google Calendar API → Enable**.
3. **APIs & services → OAuth consent screen** → External → add yourself as a
   test user. Scope: `https://www.googleapis.com/auth/calendar.events`.
4. **Credentials → Create credentials → OAuth client ID → Chrome extension**.
5. Load the extension once (step 3) to get its ID, then paste that ID into the
   OAuth client, and paste the generated client id into
   `extension/manifest.json` → `oauth2.client_id`.

> The extension ID must be stable. While developing unpacked, Chrome derives it
> from the folder path; keep the folder in place, or set a `key` in the
> manifest once you publish.

## 3. Load the extension

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
   select this `extension/` folder.
2. Open the extension **Settings**:
   - **API base URL**: e.g. `https://your-site.netlify.app`
   - **API token**: the token from step 1
   - Click **Test connection** (a 404 on `__connection_test__` means auth OK).
   - Pick the reminder offset (default: 1 year, 1 week before).
   - Optional: enable **Save detected sales automatically**.
3. Toolbar popup → **Connect Google Calendar** (grants the calendar scope).
4. Toolbar popup → **Test calendar event** books a throwaway all-day event one
   year from today and prints the *Open in Google Calendar* link. If that works,
   real sales will book their reminders too.

If you use a domain other than `*.netlify.app` / `localhost`, add it to
`host_permissions` in `manifest.json` and reload the extension.

## How sale detection works

Swipe is a single-page app, so the detector uses three signals:

- **Success toasts** — new nodes matching `/invoice saved|created/`,
  `/payment received|successful/`, `/sale completed/` open the confirm dialog.
- **Invoice screens** — navigating to a path containing
  `invoice|bill|sale|pos|checkout` arms the panel button.
- **Always available** — the floating 🎀 button → *Capture this invoice*.

Scraped values are only a starting point: the confirm dialog lets you fix the
customer, phone, items and quantity before anything is saved. That is why the
default mode is "confirm" rather than "auto-send".

The invoice id (or a generated `SWIPE-<timestamp>` fallback) is the idempotency
key, so re-sending the same invoice returns `duplicate: true` and no second
calendar event is created.

If the site is unreachable or you are offline, the sale is queued in
`chrome.storage.local` and retried every 5 minutes (and from the popup's
*Retry pending* button).

## Recording past sales from the Sales list

Open **Sales** (`app.getswipe.in/list/sales`) and click the 🎀 button →
**Read sales list**. The extension reads every invoice row currently rendered,

| Field read from the row | Where it comes from |
| ----------------------- | ------------------- |
| Invoice id              | the `Bill #` column (`FF-265`), ignoring the `by <creator>` line under it |
| Total                   | the `Amount` column |
| Date                    | the `Date` column (`01 Nov 2026`, day-first) |
| Customer + phone        | the `Customer` column (`<name>` / `<phone>`) |
| Payment status          | the `Status` column (`paid` / `unpaid` / …) |

Columns are looked up by their header text (`Amount`, `Status`, `Mode`,
`Bill #`, `Customer`, `Date`), so reordering or hiding a column does not break
the import. On a list page **Capture this invoice** opens the same picker
instead of scraping the page — scraping there used to pick up the payment mode
(`UPI`) as the customer and the footer's lifetime total as the amount.

then shows a checklist. Uncheck what you do not want and press **Record
selected** — each row is posted to `POST /api/sales` and gets the usual
one-year calendar reminder. Rows already pushed from this browser are marked
*already recorded* and disabled (the server's `(source, external_id)`
idempotency is the second line of defence).

> The list view has **no line items**, so a list import records the invoice
> total and customer but cannot decrement stock. To reduce stock, open the
> individual invoice and use *Capture this invoice* instead.

Selectors are heuristic: Swipe's markup is not public API. If a column stops
being picked up, tweak `rowCandidates()` / `parseSaleRow()` in
`content/swipe.js`.

## QR codes

The scanner accepts any of these payloads:

| QR payload                        | Result            |
| --------------------------------- | ----------------- |
| `https://your-site/p/DRS-1024`    | SKU `DRS-1024`    |
| `https://your-site/scan?sku=DRS-…`| SKU from `sku=`   |
| `DRS-1024` (plain text)           | SKU as-is         |
| `{"sku":"DRS-1024"}`              | SKU from JSON     |

`BarcodeDetector` is also asked for `code_128`, `ean_13`, `code_39` and
`pdf417`, so the label generator's existing Code128 barcodes scan too.

## Calendar events

Each recorded sale creates one **all-day** event on the primary calendar of the
connected Google account:

| Part of the event | Value |
| ----------------- | ----- |
| Date              | sale date + reminder offset (default 1 year), 29 Feb clamped to 28 Feb |
| Title             | `Birthday dress follow-up — <customer>` |
| Description       | phone, sale date, items, notes |
| Reminder          | popup, `reminderMinutes` before (default 1 week) |
| `fancySaleId`     | private extended property linking the event to `sales.id` |

Before inserting, the extension lists events filtered by
`privateExtendedProperty=fancySaleId=<id>`. If one already exists it returns it
instead of creating a duplicate, so a retried or replayed sale cannot book the
same reminder twice.

### Troubleshooting

| Popup message | Fix |
| ------------- | --- |
| Google rejected the extension | `manifest.json` → `oauth2.client_id` is still the placeholder, or this extension's ID is not on that OAuth client |
| Access denied | add your Google account as a **test user** on the OAuth consent screen |
| `calendar.events` scope not granted | revoke the extension at <https://myaccount.google.com/permissions>, then reconnect |
| Nothing happens / "not connected" | you are not on a Chromium browser (`chrome.identity` needs Chrome, Edge or Brave) |

Scanning with a phone camera (not the extension) opens the public
`/p/<sku>` page, which shows the same stock count. That page is intentionally
public and indexed-off; it exposes only name, size, price and stock.

To make the QR encode the URL, build the label value as
`https://<your-site>/p/<SKU>` — the label designer currently emits Code128
only, so add a QR element (e.g. with the `qrcode` package) if you want
URL-based QR labels from this app.

## Data written by the extension

| Endpoint                 | Purpose                                        |
| ------------------------ | ---------------------------------------------- |
| `GET /api/inventory`     | stock lookup (`?sku=`)                         |
| `POST /api/inventory`    | create product / set stock                     |
| `POST /api/inventory/scan` | stock lookup + scan analytics                |
| `POST /api/sales`        | record sale, decrement stock, return reminder  |
| `POST /api/calendar/events` | store the Google event id for a sale        |
| `POST /api/tokens`       | mint an API token (session auth only)          |

Stock changes are always audited in `inventory_movements`, so the current
number in `products.stock_qty` can be reconciled later.

## Limitations

- Swipe's markup is not public API; if it changes, tweak the selectors in
  `content/swipe.js` (`extractItems`, `findValueByLabel`).
- Calendar events are created on the **primary** calendar of the Google account
  you connect. Change `calendars/primary` in `lib/calendar.js` to target
  another calendar.
- `chrome.identity` requires a Chromium browser (Chrome, Edge, Brave). Firefox
  needs a different OAuth flow.

##

Ran terminal command:  grep -n 'client_id' extension/manifest.json; node --check extension/lib/calendar.js && node --check extension/background.js && node --check extension/popup/popup.js && echo "syntax OK"

Updated memory file

Calendar event creation is now complete and verified. Here's the state:

## What existed already

`calendar.js` → `chrome.identity.getAuthToken`, then `POST /calendar/v3/calendars/primary/events` with `start.date` / `end.date` (all-day), a popup reminder, and `extendedProperties.private.fancySaleId`.

## What I added

**1. Duplicate prevention** — before inserting, it calls:

```
GET /calendars/primary/events?privateExtendedProperty=fancySaleId=<saleId>
```

and returns the existing event (`duplicate: true`) instead of creating a second one. The lookup is best-effort: if it fails, the insert still goes ahead.

**2. Actionable Google errors** — `explainCalendarError()` maps Google's terse payloads to fixes:

| Google response | Message shown |
|---|---|
| 401 `invalid_client` / `unauthorized_client` | "Put your Chrome-extension OAuth client id in `manifest.json` and make sure this extension ID is listed on that client" |
| 401 (other) | "Google sign-in expired. Click Connect again" |
| 403 `access_denied` | "Add your Google account as a test user on the OAuth consent screen" |
| 403 `insufficient` / scope | "The `calendar.events` scope was not granted — revoke at myaccount.google.com/permissions" |
| 403 quota | "Quota reached, retry in a minute" |

**3. Test button** — popup → **Test calendar event** (`TEST_EVENT`) books a throwaway event one year out and prints *Open in Google Calendar*, so you can confirm OAuth + calendar without recording a sale.

**4. `bookReminder`** skips re-saving the DB mapping when the event already existed.

## Verified

Stubbed `chrome.identity` + `fetch`:

```
1 insert:  {"id":"evt_new","htmlLink":"https://cal/e/2","date":"2027-11-01"}
2 dedupe:  {"id":"evt_existing",...,"duplicate":true} | calls: 1   ← no insert
3 error:   AuthRequiredError | The calendar.events scope was not granted…
```

All 112 tests pass; syntax clean.

## The one thing still blocking you

`manifest.json` line 32 is still a placeholder:

```
"client_id": "REPLACE_WITH_YOUR_CHROME_EXTENSION_CLIENT_ID.apps.googleusercontent.com"
```

Until that's a real OAuth client, every calendar call fails before it reaches Google. To finish it:

1. `chrome://extensions` → copy the extension's **ID** (needs a stable ID — for unpacked use, keep the folder path fixed or add a `"key"`).
2. Google Cloud → APIs & Services → enable **Google Calendar API**.
3. OAuth consent screen → External → add your Gmail as a **test user**, scope `.../auth/calendar.events`.
4. Credentials → Create credentials → OAuth client ID → **Chrome extension** → paste the extension ID as *Item ID*.
5. Copy the generated client ID into `manifest.json` → `oauth2.client_id`, reload the extension.
