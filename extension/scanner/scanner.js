import { extractSkuFromScan } from '../lib/sku.js';

const video = document.getElementById('video');
const cameraNote = document.getElementById('camera-note');
const resultEl = document.getElementById('result');
const historyEl = document.getElementById('history');
const manualForm = document.getElementById('manual');
const manualInput = document.getElementById('manual-input');

const COOLDOWN_MS = 2500;
const history = [];
let detector = null;
let running = false;
let lastRaw = null;
let lastAt = 0;

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

function beep(ok = true) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.frequency.value = ok ? 880 : 220;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.19);
  } catch {
    /* audio is a nicety, never a requirement */
  }
}

function renderError(text) {
  resultEl.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'error';
  p.textContent = text;
  resultEl.appendChild(p);
}

function renderProduct(product, sku) {
  resultEl.innerHTML = '';

  if (!product) {
    const skuEl = document.createElement('p');
    skuEl.className = 'sku';
    skuEl.textContent = sku;
    const error = document.createElement('p');
    error.className = 'error';
    error.textContent = 'This SKU is not in the inventory.';
    resultEl.append(skuEl, error);
    return;
  }

  const skuEl = document.createElement('p');
  skuEl.className = 'sku';
  skuEl.textContent = product.sku;

  const nameEl = document.createElement('p');
  nameEl.className = 'name';
  nameEl.textContent = product.name;

  const stock = document.createElement('div');
  stock.className = product.lowStock ? 'stock low' : 'stock';
  const strong = document.createElement('strong');
  strong.textContent = String(product.stockQty);
  const label = document.createElement('span');
  label.textContent = 'in stock';
  stock.append(strong, label);

  resultEl.append(skuEl, nameEl, stock);

  if (product.lowStock) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = `LOW STOCK · reorder at ${product.lowStockThreshold}`;
    resultEl.appendChild(badge);
  }

  const meta = document.createElement('p');
  meta.className = 'meta';
  meta.textContent = [
    product.size ? `Size ${product.size}` : null,
    product.price ? `₹${product.price}` : null,
    `Updated ${new Date(product.updatedAt).toLocaleString()}`,
  ]
    .filter(Boolean)
    .join(' · ');
  resultEl.appendChild(meta);
}

function pushHistory(sku, product) {
  history.unshift({
    sku,
    name: product?.name || null,
    stockQty: product?.stockQty ?? null,
    at: new Date(),
  });
  history.splice(20);

  historyEl.innerHTML = '';
  for (const entry of history) {
    const li = document.createElement('li');

    const left = document.createElement('span');
    left.textContent = `${entry.sku}${entry.name ? ` — ${entry.name}` : ''}`;

    const right = document.createElement('span');
    right.className = 'when';
    right.textContent =
      entry.stockQty === null
        ? 'unknown'
        : `${entry.stockQty} left · ${entry.at.toLocaleTimeString()}`;

    li.append(left, right);
    historyEl.appendChild(li);
  }
}

async function lookup(raw) {
  const parsed = extractSkuFromScan(raw);
  if (!parsed) {
    renderError(`Not a product code: ${raw.slice(0, 120)}`);
    beep(false);
    return;
  }

  resultEl.innerHTML = '';
  const loading = document.createElement('p');
  loading.className = 'muted';
  loading.textContent = `Looking up ${parsed.sku}…`;
  resultEl.appendChild(loading);

  const response = await send({ type: 'LOOKUP_STOCK', sku: parsed.sku });
  if (!response?.ok) {
    renderError(response?.error || 'Lookup failed.');
    beep(false);
    return;
  }

  renderProduct(response.product, parsed.sku);
  pushHistory(parsed.sku, response.product);
  beep(Boolean(response.product));
}

function handleScan(raw) {
  const now = Date.now();
  if (raw === lastRaw && now - lastAt < COOLDOWN_MS) return;
  lastRaw = raw;
  lastAt = now;
  lookup(raw);
}

async function startCamera() {
  if (!('BarcodeDetector' in window)) {
    cameraNote.hidden = false;
    cameraNote.textContent =
      'This browser build has no BarcodeDetector. Use the manual lookup below, or open this page in Chrome.';
    return;
  }

  try {
    const formats = await window.BarcodeDetector.getSupportedFormats();
    const wanted = ['qr_code', 'code_128', 'ean_13', 'code_39', 'pdf417'].filter((format) =>
      formats.includes(format),
    );

    detector = new window.BarcodeDetector({ formats: wanted });

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();

    running = true;
    tick();
  } catch (e) {
    cameraNote.hidden = false;
    cameraNote.textContent = `Camera unavailable: ${e.message}. You can still type a SKU below.`;
  }
}

async function tick() {
  if (!running) return;

  try {
    if (video.readyState >= 2) {
      const codes = await detector.detect(video);
      if (codes.length > 0) handleScan(codes[0].rawValue);
    }
  } catch {
    /* transient detection errors are normal while the frame is blurry */
  }

  setTimeout(tick, 220);
}

manualForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = manualInput.value.trim();
  if (!value) return;
  manualInput.value = '';
  lookup(value);
});

startCamera();
