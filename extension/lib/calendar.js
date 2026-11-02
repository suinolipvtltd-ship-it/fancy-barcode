import { nextDay } from './dates.js';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

export class AuthRequiredError extends Error {
  constructor(message = 'Connect Google Calendar in the extension first.') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

function getAuthToken(interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(
          new AuthRequiredError(
            chrome.runtime.lastError?.message || 'Google Calendar is not connected.',
          ),
        );
        return;
      }
      resolve(token);
    });
  });
}

export async function connectGoogle(interactive = true) {
  const token = await getAuthToken(interactive);
  return { connected: true, token };
}

async function insertEvent(token, body) {
  const response = await fetch(`${CALENDAR_API}/calendars/primary/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  return { response, data };
}

/**
 * Turns Google's terse error payloads into something actionable. The usual
 * culprits are a placeholder OAuth client id, a mismatched extension id, or a
 * consent screen that never granted the calendar scope.
 */
function explainCalendarError(status, data) {
  const message = String(
    data?.error?.message || data?.error_description || data?.error || '',
  );

  if (status === 401 && /invalid_client|unauthorized_client|invalid_grant|deleted_client/i.test(message)) {
    return new AuthRequiredError(
      'Google rejected the extension. Put your Chrome-extension OAuth client id in manifest.json (oauth2.client_id) and make sure this extension ID is listed on that client.',
    );
  }
  if (status === 401) {
    return new AuthRequiredError(
      'Google sign-in expired. Click “Connect Google Calendar” again.',
    );
  }
  if (status === 403 && /access_denied/i.test(message)) {
    return new AuthRequiredError(
      'Access denied. Add your Google account as a test user on the OAuth consent screen, then reconnect.',
    );
  }
  if (status === 403 && /insufficient|scope|PERMISSION_DENIED/i.test(message)) {
    return new AuthRequiredError(
      'The calendar.events scope was not granted. Revoke the extension at myaccount.google.com/permissions, then reconnect.',
    );
  }
  if (status === 403 && /rateLimit|quota/i.test(message)) {
    return new Error('Google Calendar quota reached. Try again in a minute.');
  }
  if (status === 404) {
    return new Error('Calendar not found — the connected account may have no primary calendar.');
  }
  return new Error(message || `Calendar API error (HTTP ${status})`);
}

/** Looks for an event already stamped with this sale id. */
async function findExistingEvent(token, saleId) {
  const url = new URL(`${CALENDAR_API}/calendars/primary/events`);
  url.searchParams.set('privateExtendedProperty', `fancySaleId=${saleId}`);
  url.searchParams.set('maxResults', '5');
  url.searchParams.set('showDeleted', 'false');

  let response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    return null; // lookup is best-effort; a failed check must not block the insert
  }
  if (!response.ok) return null;

  const data = await response.json().catch(() => null);
  const event = data?.items?.[0];
  if (!event) return null;

  return {
    id: event.id,
    htmlLink: event.htmlLink || null,
    date: event.start?.date || null,
    title: event.summary || null,
  };
}

/**
 * Creates an all-day event on the user's primary calendar.
 * Uses an extended property so a duplicate request can be spotted later.
 */
export async function createAllDayEvent({
  date,
  title,
  description,
  reminderMinutes = 7 * 24 * 60,
  saleId = null,
}) {
  let token;
  try {
    token = await getAuthToken(false);
  } catch (e) {
    throw new AuthRequiredError(e.message);
  }

  // A retried sale must not create a second event.
  if (saleId) {
    const existing = await findExistingEvent(token, saleId);
    if (existing) {
      return { ...existing, date: existing.date || date, duplicate: true };
    }
  }

  const body = {
    summary: title,
    description,
    start: { date },
    end: { date: nextDay(date) },
    transparency: 'transparent',
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: Math.max(0, Math.min(reminderMinutes, 40320)) }],
    },
    extendedProperties: saleId ? { private: { fancySaleId: saleId } } : undefined,
  };

  let { response, data } = await insertEvent(token, body);

  if (response.status === 401) {
    // Token expired or revoked — drop the cached one and try once more.
    await new Promise((resolve) => chrome.identity.removeCachedAuthToken({ token }, resolve));
    try {
      token = await getAuthToken(false);
    } catch (e) {
      throw new AuthRequiredError(e.message);
    }
    ({ response, data } = await insertEvent(token, body));
  }

  if (!response.ok) {
    throw explainCalendarError(response.status, data);
  }

  return {
    id: data.id,
    htmlLink: data.htmlLink || null,
    date,
  };
}
