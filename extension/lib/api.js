import { getSettings } from './storage.js';

export class ApiError extends Error {
  constructor(message, status = 0, body = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }

  /** Network failure or 5xx — worth retrying later. */
  get retryable() {
    return this.status === 0 || this.status >= 500;
  }
}

export async function apiFetch(path, { method = 'GET', body } = {}) {
  const settings = await getSettings();
  const base = (settings.apiBaseUrl || '').replace(/\/+$/, '');
  if (!base) throw new ApiError('Set the API base URL in the extension options.', 0);
  if (!settings.apiToken) {
    throw new ApiError('Set the API token in the extension options.', 0);
  }

  let response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiToken}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw new ApiError(`Cannot reach ${base}: ${e.message}`, 0);
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    const message = data?.error || `Request failed (HTTP ${response.status})`;
    throw new ApiError(message, response.status, data);
  }

  return data;
}

export function lookupStock(sku) {
  return apiFetch(`/api/inventory?sku=${encodeURIComponent(sku)}`);
}

export function recordScan(sku) {
  return apiFetch('/api/inventory/scan', { method: 'POST', body: { sku, source: 'extension' } });
}

export function recordSale(sale) {
  return apiFetch('/api/sales', { method: 'POST', body: sale });
}

export function saveCalendarEvent(event) {
  return apiFetch('/api/calendar/events', { method: 'POST', body: event });
}
