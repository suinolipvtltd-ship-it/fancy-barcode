import { getSettings, saveSettings } from '../lib/storage.js';

const $ = (id) => document.getElementById(id);
const message = $('message');

function setMessage(text, tone = '') {
  message.textContent = text;
  message.className = `message ${tone}`.trim();
}

async function load() {
  const settings = await getSettings();
  $('apiBaseUrl').value = settings.apiBaseUrl || '';
  $('apiToken').value = settings.apiToken || '';
  $('reminderYears').value = String(settings.reminderYears ?? 1);
  $('reminderMinutes').value = String(settings.reminderMinutes ?? 10080);
  $('autoSend').checked = Boolean(settings.autoSend);
}

$('form').addEventListener('submit', async (event) => {
  event.preventDefault();

  const apiBaseUrl = $('apiBaseUrl').value.trim().replace(/\/+$/, '');
  const apiToken = $('apiToken').value.trim();

  if (apiBaseUrl && !/^https?:\/\//i.test(apiBaseUrl)) {
    setMessage('API base URL must start with http:// or https://', 'bad');
    return;
  }

  await saveSettings({
    apiBaseUrl,
    apiToken,
    reminderYears: Number($('reminderYears').value) || 1,
    reminderMinutes: Number($('reminderMinutes').value) || 0,
    autoSend: $('autoSend').checked,
  });

  setMessage('Settings saved.', 'ok');
});

$('test').addEventListener('click', async () => {
  const base = $('apiBaseUrl').value.trim().replace(/\/+$/, '');
  const token = $('apiToken').value.trim();

  if (!base || !token) {
    setMessage('Enter both the API base URL and the token first.', 'bad');
    return;
  }

  setMessage('Testing…');

  try {
    // A deliberately unknown SKU: 404 means the token was accepted.
    const response = await fetch(`${base}/api/inventory?sku=__connection_test__`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401) {
      setMessage('Token rejected (401). Mint a new token and paste it again.', 'bad');
      return;
    }
    if (response.status === 404 || response.ok) {
      setMessage('Connection OK — token accepted.', 'ok');
      return;
    }
    if (response.status === 500) {
      setMessage(
        'Reached the server but it failed (500). Check DATABASE_URL and that scripts/migrate.sql was run.',
        'bad',
      );
      return;
    }
    setMessage(`Unexpected response: HTTP ${response.status}.`, 'bad');
  } catch (e) {
    setMessage(
      `Cannot reach ${base}: ${e.message}. Check the URL and that this domain is listed in manifest.json host_permissions.`,
      'bad',
    );
  }
});

load();
