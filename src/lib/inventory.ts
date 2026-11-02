/**
 * SKU parsing for QR payloads.
 *
 * Product QR codes encode a URL to our own site (e.g.
 * `https://shop.example.com/p/DRS-1024?size=M`). Scanners may also hand us the
 * raw SKU, a `sku=` query string, or a small JSON blob — all of those are
 * accepted here so the extension never depends on one exact format.
 */

export interface ScannedProductRef {
  sku: string;
  /** True when the payload was a URL pointing at our product page. */
  fromUrl: boolean;
}

const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function normalizeSku(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidSku(raw: string): boolean {
  return SKU_PATTERN.test(normalizeSku(raw));
}

/**
 * Extracts a SKU from whatever a QR/barcode scanner returned.
 * Returns `null` when nothing usable can be found.
 */
export function extractSkuFromScan(raw: string): ScannedProductRef | null {
  const text = (raw ?? "").trim();
  if (!text) return null;

  // 1. JSON payload: {"sku":"DRS-1024"} or {"sku": "..."} inside a wrapper.
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const candidate =
        (parsed.sku as string | undefined) ??
        (parsed.SKU as string | undefined) ??
        (parsed.id as string | undefined);
      if (typeof candidate === "string" && candidate.trim()) {
        const sku = normalizeSku(candidate);
        return isValidSku(sku) ? { sku, fromUrl: false } : null;
      }
    } catch {
      // Fall through to the other strategies.
    }
  }

  // 2. A URL: prefer /p/<sku>, then ?sku=..., then the last path segment.
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      const fromPath = /\/p\/([^/?#]+)/i.exec(url.pathname);
      const candidate =
        fromPath?.[1] ??
        url.searchParams.get("sku") ??
        url.searchParams.get("SKU") ??
        url.pathname.split("/").filter(Boolean).pop();
      if (candidate) {
        const sku = normalizeSku(decodeURIComponent(candidate));
        if (isValidSku(sku)) return { sku, fromUrl: true };
      }
    } catch {
      return null;
    }
  }

  // 3. "sku=DRS-1024" style query fragments.
  const queryMatch = /[?&]sku=([^&#]+)/i.exec(text);
  if (queryMatch) {
    const sku = normalizeSku(decodeURIComponent(queryMatch[1]));
    if (isValidSku(sku)) return { sku, fromUrl: false };
  }

  // 4. Plain SKU / barcode value.
  const sku = normalizeSku(text);
  if (isValidSku(sku)) return { sku, fromUrl: false };

  return null;
}

/** Coerces a loosely-typed quantity into a positive integer (default 1). */
export function parseQty(raw: unknown): number {
  const value =
    typeof raw === "number" ? raw : Number.parseInt(String(raw ?? "1"), 10);
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(Math.floor(value), 9999);
}
