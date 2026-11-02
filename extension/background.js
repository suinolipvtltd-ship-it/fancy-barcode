import {
  lookupStock,
  recordScan,
  recordSale,
  saveCalendarEvent,
  ApiError,
} from './lib/api.js';
import { connectGoogle, createAllDayEvent } from './lib/calendar.js';
import { buildReminderLocal } from './lib/dates.js';
import { normalizeSku } from './lib/sku.js';
import {
  addRecentSale,
  enqueue,
  getQueue,
  getRecentSales,
  getSettings,
  setQueue,
} from './lib/storage.js';

const FLUSH_ALARM = 'fancy-flush-queue';
const MAX_ATTEMPTS = 20;

/* -------------------------------------------------------------------------- */
/* Calendar                                                                   */
/* -------------------------------------------------------------------------- */

async function bookReminder(saleId, reminder, settings) {
  const event = await createAllDayEvent({
    date: reminder.date,
    title: reminder.title,
    description: reminder.description,
    reminderMinutes: settings.reminderMinutes,
    saleId,
  });

  // Best effort: store the mapping so the app can show the event link.
  if (!event.duplicate) {
    try {
      await saveCalendarEvent({
        saleId,
        googleEventId: event.id,
        eventDate: event.date,
        htmlLink: event.htmlLink,
      });
    } catch (e) {
      console.warn('calendar mapping not saved:', e);
    }
  }

  return event;
}

/* -------------------------------------------------------------------------- */
/* Sales                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Records the sale on the site and books the calendar event.
 * Throws on any failure — `sendSale` decides whether to queue it.
 */
async function attemptSale(sale) {
  const settings = await getSettings();
  const payload = { ...sale, soldAt: sale.soldAt || new Date().toISOString() };
  const apiResult = await recordSale(payload);

  const outcome = {
    saleId: apiResult.saleId,
    duplicate: Boolean(apiResult.duplicate),
    items: apiResult.items || [],
    warnings: apiResult.warnings || [],
    calendar: null,
    calendarError: null,
  };

  const reminder =
    apiResult.reminder ||
    buildReminderLocal({
      customerName: payload.customer?.name,
      customerPhone: payload.customer?.phone,
      items: payload.items,
      soldAt: payload.soldAt,
      years: settings.reminderYears,
      note: payload.customer?.note,
    });

  if (!outcome.duplicate) {
    try {
      outcome.calendar = await bookReminder(apiResult.saleId, reminder, settings);
    } catch (e) {
      outcome.calendarError = e.message;
      await enqueue({ kind: 'calendar', saleId: apiResult.saleId, reminder });
    }
  }

  await addRecentSale({
    saleId: apiResult.saleId,
    externalId: payload.externalId,
    customer: payload.customer?.name || null,
    phone: payload.customer?.phone || null,
    total: payload.totalAmount ?? null,
    duplicate: outcome.duplicate,
    calendarDate: outcome.calendar?.date || reminder.date,
    calendarLink: outcome.calendar?.htmlLink || null,
    calendarError: outcome.calendarError,
  });

  return outcome;
}

/** Wraps `attemptSale` and queues retryable failures (site down, offline). */
async function sendSale(sale) {
  try {
    return { ok: true, ...(await attemptSale(sale)) };
  } catch (e) {
    if (e instanceof ApiError && e.retryable) {
      await enqueue({ kind: 'sale', sale });
      return { ok: false, queued: true, error: e.message };
    }
    return { ok: false, error: e.message || String(e) };
  }
}

/* -------------------------------------------------------------------------- */
/* Retry queue                                                                */
/* -------------------------------------------------------------------------- */

async function flushQueue() {
  const queue = await getQueue();
  if (queue.length === 0) return { flushed: 0, remaining: 0 };

  const settings = await getSettings();
  if (!settings.apiToken) return { flushed: 0, remaining: queue.length, error: 'API token missing' };

  let flushed = 0;
  const remaining = [];

  for (const item of queue) {
    try {
      if (item.kind === 'calendar') {
        await bookReminder(item.saleId, item.reminder, await getSettings());
      } else {
        await attemptSale(item.sale);
      }
      flushed += 1;
    } catch (e) {
      const attempts = (item.attempts || 0) + 1;
      // Permanent failures (auth, validation) should not be retried forever.
      const permanent =
        e instanceof ApiError && !e.retryable && e.status !== 0 && e.status < 500;
      if (!permanent && attempts < MAX_ATTEMPTS) {
        remaining.push({ ...item, attempts, lastError: e.message });
      } else {
        console.error('dropping queued item', item.id, e.message);
      }
    }
  }

  await setQueue(remaining);
  return { flushed, remaining: remaining.length };
}

/* -------------------------------------------------------------------------- */
/* Google connection                                                          */
/* -------------------------------------------------------------------------- */

function hasGoogleToken() {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      resolve(Boolean(token) && !chrome.runtime.lastError);
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Message router                                                             */
/* -------------------------------------------------------------------------- */

const handlers = {
  async RECORD_SALE(message) {
    if (!message.sale) throw new Error('Missing sale payload');
    return await sendSale(message.sale);
  },

  async LOOKUP_STOCK(message) {
    const sku = normalizeSku(message.sku);
    if (!sku) throw new Error('Missing SKU');
    try {
      const product = await lookupStock(sku);
      // Record the scan silently; a failed log must not break the lookup.
      recordScan(sku).catch(() => {});
      return { ok: true, product };
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        return { ok: true, product: null, sku };
      }
      throw e;
    }
  },

  async GET_STATUS() {
    const [settings, queue, recent, googleConnected] = await Promise.all([
      getSettings(),
      getQueue(),
      getRecentSales(),
      hasGoogleToken(),
    ]);
    return {
      ok: true,
      apiConfigured: Boolean(settings.apiBaseUrl && settings.apiToken),
      apiBaseUrl: settings.apiBaseUrl,
      googleConnected,
      queueLength: queue.length,
      recent: recent.slice(0, 10),
      settings,
    };
  },

  async CONNECT_GOOGLE() {
    await connectGoogle(true);
    return { ok: true, googleConnected: true };
  },

  /** Books a throwaway event so the Google setup can be verified without a sale. */
  async TEST_EVENT() {
    const settings = await getSettings();
    const reminder = buildReminderLocal({
      customerName: 'Calendar test',
      items: [],
      soldAt: new Date(),
      years: settings.reminderYears,
      note: 'Created from the Fancy Barcode popup to verify Google Calendar.',
    });

    const event = await createAllDayEvent({
      date: reminder.date,
      title: `Fancy Barcode test — ${reminder.date}`,
      description: reminder.description,
      reminderMinutes: settings.reminderMinutes,
    });

    return { ok: true, calendar: event };
  },

  async CONNECT_GOOGLE_SILENT() {
    return { ok: true, googleConnected: await hasGoogleToken() };
  },

  async FLUSH_QUEUE() {
    return { ok: true, ...(await flushQueue()) };
  },

  async OPEN_SCANNER() {
    await chrome.tabs.create({ url: chrome.runtime.getURL('scanner/scanner.html') });
    return { ok: true };
  },

  async OPEN_OPTIONS() {
    chrome.runtime.openOptionsPage();
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = handlers[message?.type];
  if (!handler) {
    return false;
  }
  Promise.resolve(handler(message))
    .then((result) => sendResponse(result))
    .catch((e) => sendResponse({ ok: false, error: e?.message || String(e) }));
  return true; // keep the message channel open for the async response
});

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

function ensureAlarm() {
  chrome.alarms.get(FLUSH_ALARM, (existing) => {
    if (!existing) chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: 5, delayInMinutes: 1 });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm();
  flushQueue().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  flushQueue().catch(() => {});
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === FLUSH_ALARM) flushQueue().catch(() => {});
});
