-- Migration: Schema for label generation job history and app users.
-- Run this against your Neon PostgreSQL database to set up the schema.

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name VARCHAR(255) NOT NULL,
  row_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs (created_at DESC);

-- Labels actually produced by a job (quantity-expanded), kept separate from the
-- number of source rows in the uploaded file. Null for older jobs.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS label_count INTEGER;

-- Users table for email/password authentication (replaces Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tracks failed login attempts for brute-force protection
CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Inventory, sales and calendar-reminder data (used by the browser extension)
-- ---------------------------------------------------------------------------

-- One row per sellable SKU. `sku` is the value encoded in the product QR code.
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku VARCHAR(128) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  size VARCHAR(32),
  price NUMERIC(10, 2),
  stock_qty INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_name ON products (name);

-- Every time someone scans a product QR code.
CREATE TABLE IF NOT EXISTS inventory_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku VARCHAR(128) NOT NULL,
  stock_qty INTEGER,
  source VARCHAR(32) NOT NULL DEFAULT 'extension',
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_scans_sku ON inventory_scans (sku, scanned_at DESC);

-- Customers captured from a sale (phone is the natural key when present).
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255),
  phone VARCHAR(32) UNIQUE,
  note TEXT,
  first_purchase_at TIMESTAMPTZ,
  last_purchase_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A recorded sale. (source, external_id) makes the extension idempotent, so a
-- re-submitted invoice never creates a second calendar event.
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(32) NOT NULL DEFAULT 'swipe',
  external_id VARCHAR(191) NOT NULL,
  customer_id UUID REFERENCES customers (id) ON DELETE SET NULL,
  customer_name VARCHAR(255),
  customer_phone VARCHAR(32),
  total_amount NUMERIC(12, 2),
  sold_at TIMESTAMPTZ NOT NULL,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_sales_sold_at ON sales (sold_at DESC);

CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales (id) ON DELETE CASCADE,
  sku VARCHAR(128),
  product_name VARCHAR(255),
  qty INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_price NUMERIC(10, 2)
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items (sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sku ON sale_items (sku);

-- Audit trail of every stock change.
CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku VARCHAR(128) NOT NULL,
  delta INTEGER NOT NULL,
  reason VARCHAR(32) NOT NULL DEFAULT 'sale',
  sale_id UUID REFERENCES sales (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_sku ON inventory_movements (sku, created_at DESC);

-- Maps a sale to the Google Calendar event the extension created for it.
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL UNIQUE REFERENCES sales (id) ON DELETE CASCADE,
  google_event_id VARCHAR(255),
  event_date DATE NOT NULL,
  html_link TEXT,
  calendar_id VARCHAR(255) NOT NULL DEFAULT 'primary',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- API tokens let the extension authenticate without a browser session cookie.
CREATE TABLE IF NOT EXISTS api_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  label VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens (user_id);

-- ---------------------------------------------------------------------------
-- Reminder admin (added after the extension shipped) — safe to re-run.
-- ---------------------------------------------------------------------------

-- Size sold for a line item (e.g. "M", "2-3Y"). Products already have `size`;
-- this captures what the customer actually bought.
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS size VARCHAR(32);

-- Set when an admin removes a reminder from the app. The row is kept so the
-- sale history stays intact; the API simply stops returning it.
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;

-- Who the order was for: 'girl' | 'boy' | NULL (unknown). Age is at the time
-- of purchase, in whole years.
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS child_gender VARCHAR(16);
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS child_age_years SMALLINT;

-- The child's actual birthday, so the calendar can highlight it. Optional.
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS child_birthday DATE;

CREATE INDEX IF NOT EXISTS idx_calendar_events_event_date
  ON calendar_events (event_date);

CREATE INDEX IF NOT EXISTS idx_calendar_events_open
  ON calendar_events (event_date) WHERE dismissed_at IS NULL;

-- Backfill reminders for sales recorded before the API started storing them
-- eagerly (when only a successful Google booking created the row).
INSERT INTO calendar_events (sale_id, event_date)
SELECT s.id, (s.sold_at + INTERVAL '1 year')::date
FROM sales s
WHERE NOT EXISTS (
  SELECT 1 FROM calendar_events ce WHERE ce.sale_id = s.id
)
ON CONFLICT (sale_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- CRM (customers, their children, and Google-review follow-ups).
-- Safe to re-run.
-- ---------------------------------------------------------------------------

-- When the shop last asked for a review, and when the customer actually left
-- one. NULL reviewed_at means "still owes us a review".
ALTER TABLE customers ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_customers_review_due
  ON customers (last_purchase_at DESC)
  WHERE reviewed_at IS NULL;

-- A customer can have any number of children; their birthdays drive the
-- reminder calendar and the "who is this order for" filters.
CREATE TABLE IF NOT EXISTS customer_children (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  name VARCHAR(120),
  gender VARCHAR(16),
  birthday DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_children_customer
  ON customer_children (customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_children_birthday
  ON customer_children (birthday);

-- Backfill: create a customer row for every phone number seen in `sales` that
-- has no customer yet, so old invoices show up in the CRM.
INSERT INTO customers (phone, name, first_purchase_at, last_purchase_at)
SELECT
  s.customer_phone,
  (array_agg(s.customer_name ORDER BY s.sold_at DESC)
     FILTER (WHERE s.customer_name IS NOT NULL))[1],
  MIN(s.sold_at),
  MAX(s.sold_at)
FROM sales s
WHERE s.customer_phone IS NOT NULL
  AND BTRIM(s.customer_phone) <> ''
GROUP BY s.customer_phone
ON CONFLICT (phone) DO NOTHING;

-- Backfill: link historical sales to the customer row with the same phone.
UPDATE sales s
SET customer_id = c.id
FROM customers c
WHERE s.customer_id IS NULL
  AND s.customer_phone IS NOT NULL
  AND c.phone = s.customer_phone;

-- Keep the denormalised first/last purchase stamps honest for backfilled rows.
UPDATE customers c
SET first_purchase_at = agg.first_sale,
    last_purchase_at = agg.last_sale
FROM (
  SELECT customer_id, MIN(sold_at) AS first_sale, MAX(sold_at) AS last_sale
  FROM sales
  WHERE customer_id IS NOT NULL
  GROUP BY customer_id
) agg
WHERE c.id = agg.customer_id;
