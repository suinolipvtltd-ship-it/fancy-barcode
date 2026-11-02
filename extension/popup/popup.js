const $ = (id) => document.getElementById(id);

function send(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { ok: false, error: 'No response' });
    });
  });
}

function pill(element, ok, text) {
  element.textContent = text;
  element.classList.toggle('ok', ok === true);
  element.classList.toggle('bad', ok === false);
}

function renderRecent(recent) {
  const list = $('recent');
  list.innerHTML = '';

  if (!recent || recent.length === 0) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'No sales recorded yet.';
    list.appendChild(li);
    return;
  }

  for (const sale of recent) {
    const li = document.createElement('li');

    const title = document.createElement('div');
    title.textContent = `${sale.customer || 'Walk-in'}${sale.total ? ` · ₹${sale.total}` : ''}`;

    const meta = document.createElement('div');
    meta.className = 'when';
    const when = sale.at ? new Date(sale.at).toLocaleString() : '';
    meta.textContent = sale.duplicate
      ? `${when} · already recorded`
      : sale.calendarDate
        ? `${when} · reminder ${sale.calendarDate}`
        : `${when} · no reminder`;

    li.append(title, meta);

    if (sale.calendarError) {
      const warn = document.createElement('div');
      warn.className = 'warn';
      warn.textContent = `Calendar: ${sale.calendarError}`;
      li.appendChild(warn);
    }

    list.appendChild(li);
  }
}

async function refresh() {
  const status = await send({ type: 'GET_STATUS' });
  if (!status?.ok) {
    pill($('api-pill'), false, 'unknown');
    $('api-state').textContent = status?.error || 'Extension background not responding.';
    return;
  }

  pill($('api-pill'), status.apiConfigured, status.apiConfigured ? 'connected' : 'not set');
  pill($('google-pill'), status.googleConnected, status.googleConnected ? 'connected' : 'not connected');
  $('queue-count').textContent = String(status.queueLength ?? 0);

  $('api-state').textContent = status.apiConfigured
    ? status.apiBaseUrl
    : 'Add your API URL and token in Settings.';

  renderRecent(status.recent);
}

function activeTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs?.[0] || null);
    });
  });
}

$('capture').addEventListener('click', async () => {
  const message = $('message');
  const tab = await activeTab();

  if (!tab?.id) {
    message.textContent = 'No active tab.';
    return;
  }

  if (!/^https:\/\/app\.getswipe\.in\//.test(tab.url || '')) {
    message.textContent = 'Open a Swipe page (app.getswipe.in) first.';
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: 'OPEN_CAPTURE' }, (response) => {
    if (chrome.runtime.lastError || !response?.ok) {
      message.textContent =
        'Page assistant not loaded — reload the extension, then refresh this Swipe tab.';
      return;
    }
    window.close();
  });
});

$('scan').addEventListener('click', async () => {
  await send({ type: 'OPEN_SCANNER' });
  window.close();
});

$('connect').addEventListener('click', async () => {
  $('message').textContent = 'Opening Google sign-in…';
  const result = await send({ type: 'CONNECT_GOOGLE' });
  $('message').textContent = result?.ok
    ? 'Google Calendar connected.'
    : result?.error || 'Could not connect.';
  await refresh();
});

$('test-calendar').addEventListener('click', async () => {
  const message = $('message');
  message.textContent = 'Creating a test event…';

  const result = await send({ type: 'TEST_EVENT' });
  message.textContent = '';

  if (!result?.ok) {
    message.textContent = result?.error || 'Could not create the event.';
    return;
  }

  const calendar = result.calendar || {};
  message.textContent = `Test event created for ${calendar.date}. `;

  if (calendar.htmlLink) {
    const link = document.createElement('a');
    link.href = calendar.htmlLink;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Open in Google Calendar';
    message.appendChild(link);
  }
});

$('flush').addEventListener('click', async () => {
  $('message').textContent = 'Retrying…';
  const result = await send({ type: 'FLUSH_QUEUE' });
  $('message').textContent = result?.ok
    ? `Retried: ${result.flushed}, remaining: ${result.remaining}`
    : result?.error || 'Retry failed.';
  await refresh();
});

$('options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

refresh();
setInterval(refresh, 3000);
