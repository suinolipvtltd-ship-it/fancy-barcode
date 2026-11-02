/**
 * SKU parsing — mirrors `src/lib/inventory.ts` (the two must stay in sync).
 * QR codes encode a URL to our product page, but raw SKUs and `sku=` values
 * are accepted too.
 */

const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function normalizeSku(raw) {
  return String(raw ?? '').trim().toUpperCase();
}

export function isValidSku(raw) {
  return SKU_PATTERN.test(normalizeSku(raw));
}

/** @returns {{sku: string, fromUrl: boolean} | null} */
export function extractSkuFromScan(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;

  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      const candidate = parsed.sku ?? parsed.SKU ?? parsed.id;
      if (typeof candidate === 'string' && candidate.trim()) {
        const sku = normalizeSku(candidate);
        return isValidSku(sku) ? { sku, fromUrl: false } : null;
      }
    } catch {
      /* fall through */
    }
  }

  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      const fromPath = /\/p\/([^/?#]+)/i.exec(url.pathname);
      const candidate =
        fromPath?.[1] ??
        url.searchParams.get('sku') ??
        url.searchParams.get('SKU') ??
        url.pathname.split('/').filter(Boolean).pop();
      if (candidate) {
        const sku = normalizeSku(decodeURIComponent(candidate));
        if (isValidSku(sku)) return { sku, fromUrl: true };
      }
    } catch {
      return null;
    }
  }

  const queryMatch = /[?&]sku=([^&#]+)/i.exec(text);
  if (queryMatch) {
    const sku = normalizeSku(decodeURIComponent(queryMatch[1]));
    if (isValidSku(sku)) return { sku, fromUrl: false };
  }

  const sku = normalizeSku(text);
  return isValidSku(sku) ? { sku, fromUrl: false } : null;
}
