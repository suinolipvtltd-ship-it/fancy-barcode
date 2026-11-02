/**
 * chrome.storage helpers. Keep the storage keys in sync with
 * `content/swipe.js` (which talks to chrome.storage directly because content
 * scripts cannot use ES module imports).
 */

export const KEYS = {
  settings: 'settings',
  recentSales: 'recentSales',
  queue: 'queue',
};

export const DEFAULT_SETTINGS = {
  /** Base URL of the Fancy Barcode app (no trailing slash). */
  apiBaseUrl: 'http://localhost:3000',
  /** Bearer token minted in the app (POST /api/tokens). */
  apiToken: '',
  /** How many years ahead the reminder is booked. */
  reminderYears: 1,
  /** Calendar popup reminder, in minutes before the all-day event. */
  reminderMinutes: 7 * 24 * 60,
  /** Send sales automatically when a success toast is detected. */
  autoSend: false,
};

const MAX_RECENT = 50;
const MAX_QUEUE = 100;

export async function getSettings() {
  const stored = await chrome.storage.local.get(KEYS.settings);
  return { ...DEFAULT_SETTINGS, ...(stored[KEYS.settings] || {}) };
}

export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [KEYS.settings]: next });
  return next;
}

export async function getRecentSales() {
  const stored = await chrome.storage.local.get(KEYS.recentSales);
  return stored[KEYS.recentSales] || [];
}

export async function addRecentSale(entry) {
  const list = await getRecentSales();
  const next = [{ ...entry, at: new Date().toISOString() }, ...list].slice(0, MAX_RECENT);
  await chrome.storage.local.set({ [KEYS.recentSales]: next });
  return next;
}

export async function getQueue() {
  const stored = await chrome.storage.local.get(KEYS.queue);
  return stored[KEYS.queue] || [];
}

export async function setQueue(list) {
  await chrome.storage.local.set({ [KEYS.queue]: list.slice(0, MAX_QUEUE) });
}

export async function enqueue(entry) {
  const list = await getQueue();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  list.push({ id, attempts: 0, lastError: null, ...entry });
  await setQueue(list);
  return id;
}

export async function removeFromQueue(id) {
  const list = await getQueue();
  await setQueue(list.filter((item) => item.id !== id));
}
