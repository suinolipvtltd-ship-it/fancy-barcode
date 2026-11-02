-- Migration: Schema for label generation job history and app users.
-- Run this against your Neon PostgreSQL database to set up the schema.

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name VARCHAR(255) NOT NULL,
  row_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs (created_at DESC);

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
