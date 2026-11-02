/*
 * Swipe (app.getswipe.in) sale detector.
 *
 * Injects a small floating panel. When Swipe shows a "saved"/"payment received"
 * toast we scrape the invoice (customer, items, total) and — after your
 * confirmation, or automatically if enabled in settings — record the sale in
 * Fancy Barcode and book a Google Calendar reminder for next year.
 *
 * Plain content script (no modules): helpers below mirror extension/lib/*.js.
 */
(() => {
  if (window.__fancySalesAssistantLoaded) return;
  window.__fancySalesAssistantLoaded = true;

  const HOST_ID = 'fancy-sales-assistant-root';
  const SEEN_KEY = 'fb:seenSales';
  const SETTINGS_KEY = 'settings';
  const DEFAULT_SETTINGS = { autoSend: false, reminderYears: 1 };

  const SUCCESS_PATTERNS = [
    /invoice (?:has been |was )?(?:saved|created|generated)/i,
    /bill (?:has been |was )?(?:saved|created)/i,
    /payment (?:received|successful|completed|recorded)/i,
    /sale (?:completed|saved|successful)/i,
  ];

  const settings = { ...DEFAULT_SETTINGS };
  let lastAutoHash = null;

  /* ------------------------------- helpers ------------------------------- */

  const norm = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const lower = (value) => norm(value).toLowerCase();

  function debounce(fn, ms) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  function pageText() {
    return document.body ? document.body.innerText || '' : '';
  }

  function pageLines() {
    return pageText()
      .split('\n')
      .map((line) => norm(line))
      .filter(Boolean);
  }

  function matchFirst(text, regexes) {
    for (const re of regexes) {
      const match = text.match(re);
      if (match && match[1]) return norm(match[1]);
    }
    return null;
  }

  function toNumber(raw) {
    if (raw === null || raw === undefined) return null;
    const value = Number(String(raw).replace(/[^\d.]/g, ''));
    return Number.isFinite(value) ? value : null;
  }

  function parseQty(raw) {
    const value = Number.parseInt(String(raw ?? '1'), 10);
    return Number.isFinite(value) && value > 0 ? Math.min(value, 9999) : 1;
  }

  function formatAmount(value) {
    if (value === null || value === undefined || !Number.isFinite(value)) return '';
    return `₹${value.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function hashDraft(draft) {
    const items = (draft.items || [])
      .map((item) => `${item.sku || item.name}:${item.size || ''}:${item.qty}`)
      .join(',');
    return [draft.externalId, draft.customer?.name, draft.customer?.phone, draft.totalAmount, items]
      .map((part) => norm(part))
      .join('|');
  }

  /* -------------------------------- storage ------------------------------- */

  function readSeen() {
    try {
      return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function markSeen(hash) {
    const list = readSeen().filter((entry) => entry.hash !== hash);
    list.unshift({ hash, at: Date.now() });
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(list.slice(0, 200)));
    } catch {
      /* storage full or disabled — detection still works per page load */
    }
  }

  function hasSeen(hash) {
    return readSeen().some((entry) => entry.hash === hash);
  }

  function loadSettings() {
    try {
      chrome.storage.local.get(SETTINGS_KEY, (result) => {
        Object.assign(settings, DEFAULT_SETTINGS, result?.[SETTINGS_KEY] || {});
      });
    } catch {
      /* extension reloaded; keep defaults */
    }
  }

  /* ------------------------------- scraping ------------------------------- */

  function detectInvoiceId() {
    const url = new URL(location.href);
    for (const key of ['invoice_id', 'invoiceId', 'invoice', 'bill_id', 'id']) {
      const value = url.searchParams.get(key);
      if (value) return value;
    }

    const pathMatch = /\/(?:invoice|invoices|bill|bills)\/([A-Za-z0-9-]{3,})/.exec(
      url.pathname,
    );
    if (pathMatch) return pathMatch[1];

    return matchFirst(pageText(), [
      /(?:invoice|bill)\s*(?:no|number|#)\.?\s*[:\-]?\s*([A-Za-z0-9/-]{2,})/i,
    ]);
  }

  function findValueByLabel(labels) {
    const wanted = labels.map(lower);

    for (const label of document.querySelectorAll('label')) {
      const text = lower(label.textContent).replace(/[:*]/g, '').trim();
      if (!wanted.includes(text)) continue;

      const id = label.getAttribute('for');
      if (id) {
        const field = document.getElementById(id);
        if (field?.value) return norm(field.value);
      }
      const sibling = label.parentElement?.querySelector('input, textarea, select');
      if (sibling?.value) return norm(sibling.value);
    }

    // Inputs with a matching placeholder / aria-label / name.
    for (const field of document.querySelectorAll('input, textarea')) {
      const marker = lower(
        field.getAttribute('placeholder') ||
          field.getAttribute('aria-label') ||
          field.getAttribute('name') ||
          '',
      ).replace(/[:*]/g, '').trim();
      if (marker && wanted.some((want) => marker.includes(want)) && field.value) {
        return norm(field.value);
      }
    }

    // "Customer Name" on one line, the value on the next.
    const lines = pageLines();
    for (let i = 0; i < lines.length - 1; i += 1) {
      const key = lower(lines[i]).replace(/[:*]/g, '').trim();
      if (!wanted.some((want) => key === want || key.startsWith(want))) continue;
      const next = lines[i + 1];
      if (next && next.length <= 80 && !wanted.some((want) => lower(next).startsWith(want))) {
        return next;
      }
    }

    return null;
  }

  function detectCustomer() {
    const name = findValueByLabel([
      'customer name',
      'customer',
      'party name',
      'billed to',
      'name',
    ]);
    const phone = findValueByLabel(['phone', 'mobile', 'phone number', 'mobile number']);

    return {
      name: name || null,
      phone: phone || matchFirst(pageText(), [/\b(?:\+?91[-\s]?)?([6-9]\d{9})\b/]),
    };
  }

  // Size / age band, e.g. M, XL, 2-3Y, 5 years, Free Size.
  const SIZE_TOKEN = /\b(?:xxs|xs|s|m|l|xl|xxl|xxxl|free\s?size|newborn|\d{1,2}\s?-\s?\d{1,2}\s?(?:y|yr|yrs|years?)|\d{1,2}\s?(?:y|yr|yrs|years?))\b/i;

  /** Falls back to the trailing size in a product name like "Frock - 2-3Y". */
  function guessSize(name) {
    if (!name) return null;
    const match = String(name).match(SIZE_TOKEN);
    return match ? norm(match[0]).toUpperCase() : null;
  }

  function extractItems() {
    const items = [];
    const skipName = /^(total|sub-total|subtotal|tax|cgst|sgst|igst|discount|round ?off|amount|balance)$/i;

    for (const table of document.querySelectorAll('table')) {
      const headerCells = Array.from(
        table.querySelectorAll('thead tr:last-child th, tr:first-child th'),
      ).map((cell) => lower(cell.textContent));

      if (headerCells.length < 2) continue;

      const findIdx = (keys) =>
        headerCells.findIndex((header) => keys.some((key) => header.includes(key)));

      const nameIdx = findIdx(['item', 'product', 'description', 'particular']);
      const qtyIdx = findIdx(['qty', 'quantity', 'units', 'pcs']);
      const priceIdx = findIdx(['rate', 'price', 'amount', 'mrp', 'total']);
      const skuIdx = findIdx(['sku', 'code', 'barcode', 'hsn']);
      const sizeIdx = findIdx(['size', 'sizes', 'variant', 'fit']);

      if (nameIdx === -1) continue;

      for (const row of Array.from(table.querySelectorAll('tr')).slice(0, 200)) {
        const cells = Array.from(row.children).map((cell) => norm(cell.textContent));
        if (cells.length <= nameIdx) continue;

        const name = cells[nameIdx];
        if (!name || skipName.test(name)) continue;

        const qty = qtyIdx >= 0 ? parseQty(cells[qtyIdx]) : 1;
        const unitPrice = priceIdx >= 0 ? toNumber(cells[priceIdx]) : null;
        const sku = skuIdx >= 0 ? cells[skuIdx] || null : null;
        const size =
          (sizeIdx >= 0 ? cells[sizeIdx] || null : null) || guessSize(name);

        if (qtyIdx < 0 && unitPrice === null) continue; // header/empty row
        if (name.length > 120) continue;

        items.push({ name, sku, size, qty, unitPrice });
        if (items.length >= 50) break;
      }
    }

    // De-duplicate identical name+sku+size+qty rows produced by nested tables.
    const seen = new Set();
    return items.filter((item) => {
      const key = `${lower(item.name)}|${item.sku || ''}|${item.size || ''}|${item.qty}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /** Page text with the table summary / pagination / footer totals removed. */
  function pageTextWithoutTotals() {
    if (!document.body) return pageText();
    const clone = document.body.cloneNode(true);
    for (const node of Array.from(
      clone.querySelectorAll(
        '.ant-table-summary, .ant-pagination, footer, [class*="summary"], [class*="footer"]',
      ),
    )) {
      node.remove();
    }
    return clone.innerText || '';
  }

  function detectTotal() {
    return toNumber(
      matchFirst(pageTextWithoutTotals(), [
        /(?:grand total|total amount|amount payable|net total|invoice total|total)\s*[:₹]?\s*([\d,]+(?:\.\d{1,2})?)/i,
      ]),
    );
  }

  function buildDraft() {
    const items = extractItems();
    const customer = detectCustomer();
    const externalId = detectInvoiceId();

    return {
      source: 'swipe',
      externalId: externalId || `SWIPE-${Date.now()}`,
      soldAt: new Date().toISOString(),
      customer: { name: customer.name, phone: customer.phone, note: '' },
      items,
      totalAmount: detectTotal(),
      raw: { url: location.href, title: document.title },
    };
  }

  /* ----------------------------- sales list page --------------------------- */

  // Invoices already pushed to Fancy Barcode from the list view. Kept per
  // browser (not per page) so re-opening the list does not double-record.
  const LIST_SEEN_KEY = 'fb:recordedInvoices';

  const MONTHS = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const STATUS_WORD = /^(paid|unpaid|partially paid|partial|pending|due|overdue|credit|cancelled|canceled|refund(?:ed)?|void)$/i;
  const MODE_WORD = /^(upi|cash|card|credit card|debit card|bank|bank transfer|neft|imps|rtgs|cheque|check|online|razorpay|paytm|phonepe|gpay|google pay|wallet|adjustment)$/i;
  const NOISE_ROW = /^(view|edit|print|download|share|whatsapp|sms|email|invoice|sale|total|amount|actions?|status|date|created time|customer|payment|balance|more)$/i;

  function readRecorded() {
    try {
      const list = JSON.parse(localStorage.getItem(LIST_SEEN_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function markRecorded(externalId) {
    if (!externalId) return;
    const list = readRecorded().filter((id) => id !== externalId);
    list.unshift(externalId);
    try {
      localStorage.setItem(LIST_SEEN_KEY, JSON.stringify(list.slice(0, 1000)));
    } catch {
      /* storage disabled — server-side idempotency still applies */
    }
  }

  function isRecorded(externalId) {
    return readRecorded().includes(externalId);
  }

  function shortHash(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) | 0;
    return Math.abs(hash).toString(36).slice(0, 6);
  }

  function onSalesListPage() {
    return /\/list\//i.test(location.pathname);
  }

  function rowLines(el) {
    return (el.innerText || '')
      .split('\n')
      .map((line) => norm(line))
      .filter(Boolean);
  }

  function rowCells(el) {
    const cells = Array.from(
      el.querySelectorAll('td, th, [role="cell"], [role="gridcell"]'),
    )
      .map((cell) => norm(cell.innerText))
      .filter(Boolean);
    return cells.length ? cells : rowLines(el);
  }

  function looksLikeInvoiceId(value) {
    return /^#?[A-Z0-9][A-Z0-9/_-]{2,}$/i.test(value) && /\d/.test(value);
  }

  function findRowInvoiceId(el, text) {
    for (const anchor of el.querySelectorAll('a[href]')) {
      const href = anchor.getAttribute('href') || '';
      const match =
        /(?:invoice|invoices|sale|sales|bill|bills|receipt|receipts|order|orders)s?\/([A-Za-z0-9_-]{3,})/i.exec(href) ||
        /[?&](?:id|invoice_id|invoiceId|bill_id|sale_id)=([A-Za-z0-9_-]{3,})/i.exec(href);
      if (match) return match[1];
    }

    const fromText = matchFirst(text, [
      /(?:invoice|inv|bill|receipt)\s*(?:no\.?|number|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9/_-]{2,})/i,
    ]);
    if (fromText && /\d/.test(fromText)) return fromText.replace(/^#/, '');

    for (const line of rowLines(el)) {
      if (looksLikeInvoiceId(line)) return line.replace(/^#/, '');
    }
    return null;
  }

  function findRowCustomerName(el, text, { externalId, amount, dateRaw, phone, status }) {
    const banned = [externalId, dateRaw, phone, status, amount !== null ? String(amount) : null]
      .filter(Boolean)
      .map((value) => lower(value));

    const isNoise = (line) => {
      const value = lower(line);
      if (!value || banned.includes(value)) return true;
      if (STATUS_WORD.test(line) || MODE_WORD.test(line) || NOISE_ROW.test(line)) return true;
      if (/^by\s/i.test(line)) return true; // "by <creator>" under the bill number
      if (/^\+?\d[\d\s-]{7,}$/.test(line)) return true; // phone number
      if (looksLikeInvoiceId(line)) return true;
      if (/^[₹$]?\s*[\d.,]+$/.test(line)) return true;
      if (line.length > 60) return true;
      return !/[a-z]{2}/i.test(line);
    };

    for (const cell of rowCells(el)) if (!isNoise(cell)) return cell;
    for (const line of rowLines(el)) if (!isNoise(line)) return line;

    return matchFirst(text, [
      /(?:customer|billed to|party)\s*[:\-]?\s*([A-Za-z][A-Za-z .'-]{1,60})/i,
    ]);
  }

  /** Parses dd/mm/yyyy (Swipe is India-first) and "12 Oct 2024" into ISO noon. */
  function parseSaleDate(raw) {
    if (!raw) return null;
    const cleaned = norm(raw).replace(/(\d)(?:st|nd|rd|th)\b/gi, '$1');

    let day = null;
    let month = null;
    let year = null;

    const numeric = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(cleaned);
    const dayFirst = /^(\d{1,2})\s+([a-z]{3,})\.?,?\s+(\d{2,4})$/i.exec(cleaned);
    const monthFirst = /^([a-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{2,4})$/i.exec(cleaned);

    if (numeric) {
      day = Number(numeric[1]);
      month = Number(numeric[2]) - 1;
      year = Number(numeric[3]);
    } else if (dayFirst) {
      day = Number(dayFirst[1]);
      month = MONTHS[lower(dayFirst[2]).slice(0, 3)];
      year = Number(dayFirst[3]);
    } else if (monthFirst) {
      day = Number(monthFirst[2]);
      month = MONTHS[lower(monthFirst[1]).slice(0, 3)];
      year = Number(monthFirst[3]);
    } else {
      const fallback = new Date(cleaned);
      if (Number.isNaN(fallback.getTime())) return null;
      fallback.setHours(12, 0, 0, 0);
      return fallback.toISOString();
    }

    if (month === undefined || month === null) return null;
    if (year < 100) year += 2000;

    const date = new Date(year, month, day, 12, 0, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  function parseSaleRow(el, indexes) {
    const text = norm(el.innerText);
    if (!text || text.length < 6) return null;

    const cells = Array.from(el.children).filter((cell) => /^(TD|TH)$/.test(cell.tagName));
    const mapped = indexes && cells.length >= 3 ? indexes : null;

    const linesOf = (key) => {
      const index = mapped ? mapped[key] : -1;
      const cell = index >= 0 ? cells[index] : null;
      if (!cell) return [];
      return (cell.innerText || '')
        .split('\n')
        .map((line) => norm(line))
        .filter(Boolean);
    };
    const textOf = (key) => linesOf(key).join(' ');

    const amount = mapped
      ? toNumber(textOf('amount'))
      : toNumber(
          matchFirst(text, [
            /₹\s*([\d,]+(?:\.\d{1,2})?)/,
            /(?:rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i,
          ]),
        );

    const customerText = mapped ? textOf('customer') : '';
    const phone =
      matchFirst(customerText, [/\b(?:\+?91[-\s]?)?([6-9]\d{9})\b/]) ||
      matchFirst(text, [/\b(?:\+?91[-\s]?)?([6-9]\d{9})\b/]);

    const invoiceLines = linesOf('invoice');
    let externalId =
      invoiceLines.find((line) => looksLikeInvoiceId(line)) || invoiceLines[0] || null;
    externalId = externalId || findRowInvoiceId(el, text);

    const dateRaw = mapped
      ? linesOf('date')[0] || null
      : matchFirst(text, [
          /(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/,
          /(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+\d{2,4})/i,
          /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{2,4})/i,
        ]);

    const statusRaw = mapped
      ? textOf('status')
      : matchFirst(text, [
          /\b(partially paid|partial|paid|unpaid|pending|overdue|due|credit|cancelled|canceled|refunded)\b/i,
        ]);

    // Column layout: the customer cell is "<name>\n<phone>".
    const customerName = mapped
      ? linesOf('customer').find((line) => !/^\+?\d[\d\s-]{7,}$/.test(line)) || null
      : findRowCustomerName(el, text, {
          externalId,
          amount,
          dateRaw,
          phone,
          status: statusRaw,
        });

    if (!externalId && amount === null) return null;

    return {
      externalId: externalId ? externalId.replace(/^#/, '') : null,
      amount,
      dateRaw,
      soldAt: parseSaleDate(dateRaw),
      phone,
      status: statusRaw ? lower(statusRaw) : null,
      customerName: customerName || null,
      text,
    };
  }

  /**
   * Maps semantic fields to column indexes from the table header, so rows are
   * read by column instead of guessing which line is the customer name.
   * Swipe renders the sales list as an Ant Design table; columns can be
   * reordered or hidden, hence the lookup instead of hard-coded positions.
   */
  function columnIndexes(el) {
    const table = el.closest('table');
    if (!table) return null;

    const headers = Array.from(table.querySelectorAll('thead tr:last-child th')).map((th) =>
      lower(norm(th.innerText)),
    );
    if (headers.length < 3) return null;

    const find = (...keys) =>
      headers.findIndex((title) => keys.some((key) => title.includes(key)));

    const indexes = {
      amount: find('amount', 'total'),
      status: find('status'),
      mode: find('mode'),
      invoice: find('bill', 'invoice', 'document'),
      customer: find('customer', 'party', 'billed to'),
      date: find('date'),
    };

    if (indexes.invoice < 0 && indexes.customer < 0) return null;
    return indexes;
  }

  /** Every element on the page that looks like one sale row. */
  function rowCandidates() {
    const tableRows = Array.from(
      document.querySelectorAll('table tbody tr, [role="row"]'),
    ).filter(
      (el) => norm(el.innerText).length >= 6 && !el.querySelector('tr, [role="row"]'),
    );
    if (tableRows.length) return tableRows;

    // Card/list layouts: climb from each invoice link to the smallest ancestor
    // that also carries an amount or a date.
    const cards = new Set();
    for (const anchor of document.querySelectorAll('a[href]')) {
      const href = anchor.getAttribute('href') || '';
      if (!/(invoice|invoices|sale|sales|bill|bills|order|orders)/i.test(href)) continue;

      let node = anchor;
      for (let depth = 0; depth < 4 && node; depth += 1) {
        const text = norm(node.innerText);
        const hasMarker = text.includes('₹') || /\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(text);
        if (text.length > 10 && hasMarker) {
          cards.add(node);
          break;
        }
        node = node.parentElement;
      }
    }

    const list = Array.from(cards);
    return list.filter((el) => !list.some((other) => other !== el && el.contains(other)));
  }

  /** Reads every sale currently rendered on the Swipe sales list. */
  function scanSalesList() {
    const rows = [];
    const seen = new Set();

    for (const el of rowCandidates()) {
      const row = parseSaleRow(el, columnIndexes(el));
      if (!row) continue;

      if (!row.externalId) {
        row.externalId = `SWIPE-LIST-${shortHash(row.text)}`;
      }
      if (seen.has(row.externalId)) continue;
      seen.add(row.externalId);
      rows.push(row);
    }

    return rows;
  }

  function openListModal(rows) {
    closeModal();

    const overlay = document.createElement('div');
    overlay.className = 'fb-overlay';

    const card = document.createElement('form');
    card.className = 'fb-modal';

    const title = document.createElement('h2');
    title.textContent = `Sales on this page (${rows.length})`;

    const hint = document.createElement('p');
    hint.className = 'fb-hint';
    hint.textContent =
      'Uncheck anything you do not want to record. The list view has no line items, so stock only drops for SKUs captured from an invoice page.';

    const list = document.createElement('div');
    list.className = 'fb-list';

    const entries = rows.map((row) => {
      const recorded = isRecorded(row.externalId);

      const line = document.createElement('label');
      line.className = 'fb-list-row';
      line.dataset.seen = String(recorded);

      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = !recorded;
      box.disabled = recorded;

      const body = document.createElement('div');

      const head = document.createElement('div');
      const amountLabel = formatAmount(row.amount);
      head.textContent = `${row.externalId}${amountLabel ? ` · ${amountLabel}` : ''}`;

      const meta = document.createElement('div');
      meta.className = 'fb-list-meta';
      meta.textContent =
        [row.customerName, row.phone, row.dateRaw, row.status, recorded ? 'already recorded' : null]
          .filter(Boolean)
          .join(' · ') || 'no customer details';

      body.append(head, meta);
      line.append(box, body);
      list.appendChild(line);

      return { row, box, line, recorded };
    });

    const result = document.createElement('div');
    result.className = 'fb-result';
    result.hidden = true;

    const footer = document.createElement('div');
    footer.className = 'fb-footer';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Close';
    cancel.addEventListener('click', closeModal);

    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'fb-primary';
    save.textContent = 'Record selected';
    save.disabled = entries.every((entry) => entry.recorded);

    // Bulk sync: ticking every row on the page is the "sync all sales" path.
    const selectAll = document.createElement('button');
    selectAll.type = 'button';
    selectAll.className = 'fb-small';
    selectAll.textContent = 'Select all';
    selectAll.addEventListener('click', () => {
      const selectable = entries.filter((entry) => !entry.recorded);
      const allChecked = selectable.length > 0 && selectable.every((entry) => entry.box.checked);
      for (const entry of selectable) entry.box.checked = !allChecked;
      selectAll.textContent = allChecked ? 'Select all' : 'Clear selection';
      save.disabled = selectable.length === 0;
    });

    footer.append(selectAll, cancel, save);
    card.append(title, hint, list, footer, result);

    card.addEventListener('submit', async (event) => {
      event.preventDefault();

      const selected = entries.filter((entry) => entry.box.checked && !entry.recorded);
      if (selected.length === 0) {
        result.hidden = false;
        result.textContent = 'Nothing selected.';
        return;
      }

      save.disabled = true;
      cancel.disabled = true;
      result.hidden = false;
      result.style.whiteSpace = 'pre-line';

      const lines = [];
      let recorded = 0;
      let failed = 0;

      for (let index = 0; index < selected.length; index += 1) {
        const entry = selected[index];

        const sale = {
          source: 'swipe',
          externalId: entry.row.externalId,
          soldAt: entry.row.soldAt || new Date().toISOString(),
          customer: {
            name: entry.row.customerName,
            phone: entry.row.phone,
            note: null,
          },
          // The list has no line items — a single unlinked line keeps the
          // invoice total and reminder intact without inventing a product.
          items: [{ name: null, sku: null, qty: 1 }],
          totalAmount: entry.row.amount,
          raw: { url: location.href, listRow: entry.row.text.slice(0, 2000) },
        };

        const response = await sendMessage({ type: 'RECORD_SALE', sale });

        if (response?.ok) {
          recorded += 1;
          markRecorded(entry.row.externalId);
          entry.box.checked = false;
          entry.box.disabled = true;
          entry.line.dataset.seen = 'true';
          lines.push(
            `✓ ${entry.row.externalId}${response.duplicate ? ' (already there)' : ''}${
              response.calendar ? ` — reminder ${response.calendar.date}` : ''
            }`,
          );
        } else if (response?.queued) {
          failed += 1;
          lines.push(`… ${entry.row.externalId} queued for retry`);
        } else {
          failed += 1;
          lines.push(`✕ ${entry.row.externalId} — ${response?.error || 'failed'}`);
        }

        result.textContent = `Recording ${index + 1}/${selected.length}…\n\n${lines.join('\n')}`;
      }

      result.textContent = `${lines.join('\n')}\n\nDone — ${recorded} recorded${
        failed ? `, ${failed} pending` : ''
      }.`;
      save.disabled = false;
      cancel.disabled = false;
      setStatus(
        `List import: ${recorded} of ${selected.length} recorded.`,
        failed ? 'warn' : 'good',
      );
    });

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeModal();
    });

    overlay.appendChild(card);
    shadow.appendChild(overlay);
    modalEl = overlay;
  }

  /* ---------------------------------- UI ---------------------------------- */

  // Styles live inside the shadow root so Swipe's CSS cannot leak in.
  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .fb-fab {
      position: fixed; right: 18px; bottom: 18px; z-index: 2147483000;
      width: 52px; height: 52px; border-radius: 50%; border: 0; cursor: pointer;
      background: #111827; color: #fff; font-size: 22px; line-height: 1;
      box-shadow: 0 8px 24px rgba(0,0,0,.25);
    }
    .fb-fab:hover { background: #1f2937; }
    .fb-panel {
      position: fixed; right: 18px; bottom: 82px; z-index: 2147483000;
      width: 300px; padding: 14px 16px; border-radius: 12px; background: #fff;
      border: 1px solid #e5e7eb; box-shadow: 0 12px 32px rgba(0,0,0,.18); color: #111827;
    }
    .fb-panel-head { display: flex; align-items: center; justify-content: space-between; font-size: 13px; }
    .fb-dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; }
    .fb-status { margin: 8px 0 12px; font-size: 12px; line-height: 1.45; color: #4b5563; }
    .fb-status[data-tone="good"] { color: #047857; }
    .fb-status[data-tone="warn"] { color: #b45309; }
    .fb-status[data-tone="bad"] { color: #b91c1c; }
    .fb-actions { display: flex; flex-direction: column; gap: 6px; }
    .fb-actions button, .fb-modal button {
      font-size: 12px; padding: 8px 10px; border-radius: 8px; cursor: pointer;
      border: 1px solid #d1d5db; background: #fff; color: #111827;
    }
    .fb-actions button:hover, .fb-modal button:hover { background: #f9fafb; }
    .fb-primary { background: #111827 !important; border-color: #111827 !important; color: #fff !important; }
    .fb-primary:hover { background: #1f2937 !important; }
    .fb-primary:disabled { opacity: .6; cursor: default; }
    .fb-overlay {
      position: fixed; inset: 0; z-index: 2147483600; display: flex;
      align-items: center; justify-content: center; padding: 24px;
      background: rgba(17,24,39,.55);
    }
    .fb-modal {
      width: 100%; max-width: 520px; max-height: 88vh; overflow: auto;
      background: #fff; border-radius: 14px; padding: 20px 22px; color: #111827;
      box-shadow: 0 24px 60px rgba(0,0,0,.35);
    }
    .fb-modal h2 { margin: 0 0 4px; font-size: 16px; }
    .fb-hint { margin: 0 0 14px; font-size: 12px; color: #6b7280; }
    .fb-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
    .fb-field span { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .03em; color: #6b7280; }
    .fb-field input {
      font-size: 13px; padding: 8px 10px; border: 1px solid #d1d5db;
      border-radius: 8px; color: #111827; background: #fff;
    }
    .fb-items { margin: 4px 0 8px; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; }
    .fb-items-head, .fb-item-row {
      display: grid; grid-template-columns: 1fr 84px 56px 48px 24px; gap: 6px;
      align-items: center; padding: 6px 8px;
    }
    .fb-items-head { background: #f9fafb; font-size: 10px; text-transform: uppercase; color: #6b7280; }
    .fb-item-row { border-top: 1px solid #f3f4f6; }
    .fb-item-row input {
      font-size: 12px; padding: 6px 8px; border: 1px solid #d1d5db;
      border-radius: 6px; width: 100%; color: #111827;
    }
    .fb-remove { border: 0 !important; background: transparent !important; color: #9ca3af; padding: 2px !important; }
    .fb-small { font-size: 11px !important; padding: 6px 8px !important; }
    .fb-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
    .fb-footer .fb-small { margin-right: auto; }
    .fb-result { margin-top: 12px; font-size: 12px; line-height: 1.5; color: #374151; }
    .fb-result a { color: #1d4ed8; }
    .fb-list {
      margin: 4px 0 10px; max-height: 46vh; overflow: auto;
      border: 1px solid #e5e7eb; border-radius: 10px;
    }
    .fb-list-row {
      display: flex; gap: 8px; align-items: flex-start; padding: 8px 10px;
      border-top: 1px solid #f3f4f6; font-size: 12px; cursor: pointer;
    }
    .fb-list-row:first-child { border-top: 0; }
    .fb-list-row[data-seen="true"] { opacity: .5; cursor: default; }
    .fb-list-row input[type="checkbox"] { margin: 2px 0 0; flex: none; }
    .fb-list-meta { margin-top: 2px; font-size: 11px; color: #6b7280; }
  `;

  const host = document.createElement('div');
  host.id = HOST_ID;
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  const styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  shadow.appendChild(styleEl);

  const fab = document.createElement('button');
  fab.className = 'fb-fab';
  fab.type = 'button';
  fab.title = 'Fancy Barcode sales assistant';
  fab.textContent = '🎀';
  shadow.appendChild(fab);

  const panel = document.createElement('div');
  panel.className = 'fb-panel';
  panel.innerHTML = `
    <div class="fb-panel-head">
      <strong>Sales assistant</strong>
      <span class="fb-dot" data-role="dot"></span>
    </div>
    <p class="fb-status" data-role="status">Watching for completed invoices…</p>
    <div class="fb-actions">
      <button type="button" class="fb-primary" data-action="capture">Capture this invoice</button>
      <button type="button" data-action="list">Read sales list</button>
      <button type="button" data-action="scan">Scan product QR</button>
      <button type="button" data-action="options">Settings</button>
    </div>
  `;
  panel.hidden = true;
  shadow.appendChild(panel);

  const statusEl = () => panel.querySelector('[data-role="status"]');

  function setStatus(message, tone = '') {
    const el = statusEl();
    if (!el) return;
    el.textContent = message;
    el.dataset.tone = tone;
  }

  fab.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
  });

  /**
   * Runs a panel action. Shared by the floating panel and by the toolbar popup
   * (which sends an OPEN_CAPTURE message) so both behave identically.
   */
  function runAction(action) {
    if (action === 'capture' || action === 'list') {
      panel.hidden = false;

      // On the sales list there is no single invoice to scrape — recording the
      // whole page would mix up totals and customers, so pick from the rows.
      if (onSalesListPage()) {
        const rows = scanSalesList();
        if (rows.length === 0) {
          setStatus(
            'No sale rows found. Open the Sales list and scroll so the rows load, then try again.',
            'warn',
          );
        } else {
          openListModal(rows);
        }
        return true;
      }

      if (action === 'list') {
        setStatus('Open the Swipe Sales list first — this button reads that table.', 'warn');
        return true;
      }

      openModal(buildDraft());
      return true;
    }

    if (action === 'scan') {
      sendMessage({ type: 'OPEN_SCANNER' });
      return true;
    }

    if (action === 'options') {
      sendMessage({ type: 'OPEN_OPTIONS' }).then((response) => {
        if (response?.ok) setStatus('Settings opened in a new tab.');
      });
      return true;
    }

    return false;
  }

  panel.addEventListener('click', (event) => {
    const action = event.target?.dataset?.action;
    if (!action) return;
    runAction(action);
  });

  function sendMessage(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { ok: false, error: 'No response from extension' });
        });
      } catch (e) {
        resolve({ ok: false, error: e.message });
      }
    });
  }

  /* --------------------------------- modal -------------------------------- */

  let modalEl = null;

  function closeModal() {
    modalEl?.remove();
    modalEl = null;
  }

  function field(labelText, value = '', type = 'text') {
    const wrap = document.createElement('label');
    wrap.className = 'fb-field';

    const span = document.createElement('span');
    span.textContent = labelText;

    const input = document.createElement('input');
    input.type = type;
    input.value = value ?? '';
    input.name = labelText.toLowerCase().replace(/\s+/g, '-');

    wrap.append(span, input);
    return { wrap, input };
  }

  function openModal(draft) {
    closeModal();

    const overlay = document.createElement('div');
    overlay.className = 'fb-overlay';

    const card = document.createElement('form');
    card.className = 'fb-modal';

    const title = document.createElement('h2');
    title.textContent = 'Record sale & book reminder';

    const hint = document.createElement('p');
    hint.className = 'fb-hint';
    hint.textContent =
      'Check the details Swipe gave us, fix anything that looks wrong, then save.';

    const invoice = field('Invoice no', draft.externalId);
    const name = field('Customer name', draft.customer?.name || '');
    const phone = field('Phone', draft.customer?.phone || '', 'tel');
    const note = field('Notes (e.g. size, colour)', '');
    const total = field('Total amount', draft.totalAmount ?? '', 'number');

    const itemsBox = document.createElement('div');
    itemsBox.className = 'fb-items';

    const itemsHead = document.createElement('div');
    itemsHead.className = 'fb-items-head';
    itemsHead.innerHTML = '<span>Item</span><span>SKU</span><span>Size</span><span>Qty</span>';
    itemsBox.appendChild(itemsHead);

    const rows = [];

    function addItemRow(item = {}) {
      const row = document.createElement('div');
      row.className = 'fb-item-row';

      const itemName = document.createElement('input');
      itemName.placeholder = 'Product name';
      itemName.value = item.name || '';

      const sku = document.createElement('input');
      sku.placeholder = 'SKU';
      sku.value = item.sku || '';

      const size = document.createElement('input');
      size.placeholder = 'Size';
      size.value = item.size || '';

      const qty = document.createElement('input');
      qty.type = 'number';
      qty.min = '1';
      qty.value = String(item.qty || 1);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'fb-remove';
      remove.textContent = '✕';
      remove.title = 'Remove item';

      const entry = { row, itemName, sku, size, qty };
      remove.addEventListener('click', () => {
        rows.splice(rows.indexOf(entry), 1);
        row.remove();
      });

      row.append(itemName, sku, size, qty, remove);
      itemsBox.appendChild(row);
      rows.push(entry);
    }

    const initialItems = draft.items?.length ? draft.items : [{}];
    initialItems.forEach(addItemRow);

    const addItem = document.createElement('button');
    addItem.type = 'button';
    addItem.className = 'fb-small';
    addItem.textContent = '+ Add item';
    addItem.addEventListener('click', () => addItemRow({}));

    const result = document.createElement('div');
    result.className = 'fb-result';
    result.hidden = true;

    const footer = document.createElement('div');
    footer.className = 'fb-footer';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', closeModal);

    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'fb-primary';
    save.textContent = 'Save & create reminder';

    footer.append(cancel, save);

    card.append(
      title,
      hint,
      invoice.wrap,
      name.wrap,
      phone.wrap,
      note.wrap,
      itemsBox,
      addItem,
      total.wrap,
      footer,
      result,
    );

    card.addEventListener('submit', async (event) => {
      event.preventDefault();
      save.disabled = true;
      save.textContent = 'Saving…';
      result.hidden = false;
      result.textContent = 'Recording sale…';

      const items = rows
        .map((entry) => ({
          name: norm(entry.itemName.value) || null,
          sku: norm(entry.sku.value).toUpperCase() || null,
          size: norm(entry.size.value).toUpperCase() || null,
          qty: parseQty(entry.qty.value),
        }))
        .filter((item) => item.name || item.sku);

      if (items.length === 0) {
        result.textContent = 'Add at least one item (product name or SKU).';
        save.disabled = false;
        save.textContent = 'Save & create reminder';
        return;
      }

      const sale = {
        source: 'swipe',
        externalId: norm(invoice.input.value) || `SWIPE-${Date.now()}`,
        soldAt: new Date().toISOString(),
        customer: {
          name: norm(name.input.value) || null,
          phone: norm(phone.input.value) || null,
          note: norm(note.input.value) || null,
        },
        items,
        totalAmount: toNumber(total.input.value),
        raw: { url: location.href, title: document.title },
      };

      markSeen(hashDraft(sale));
      const response = await sendMessage({ type: 'RECORD_SALE', sale });
      renderResult(result, response);

      if (response?.ok) {
        save.textContent = 'Saved';
        save.disabled = true;
        cancel.textContent = 'Done';
        setStatus(
          response.calendar
            ? `Reminder booked for ${response.calendar.date}.`
            : response.duplicate
              ? 'Sale already recorded.'
              : 'Sale saved (calendar pending).',
          'good',
        );
      } else {
        save.disabled = false;
        save.textContent = 'Retry';
      }
    });

    overlay.appendChild(card);
    shadow.appendChild(overlay);
    modalEl = overlay;
    invoice.input.focus();

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeModal();
    });
  }

  function renderResult(container, response) {
    if (!response) {
      container.textContent = 'No response from the extension. Reload the page and try again.';
      return;
    }

    if (!response.ok) {
      container.textContent =
        (response.queued ? 'Saved locally, will retry: ' : 'Failed: ') + (response.error || 'Unknown error');
      return;
    }

    const parts = [];
    if (response.duplicate) parts.push('This invoice was already recorded.');
    if (response.calendar) {
      parts.push(`Calendar reminder: ${response.calendar.date}`);
    } else if (response.calendarError) {
      parts.push(`Calendar pending: ${response.calendarError}`);
    }

    for (const item of response.items || []) {
      if (!item.sku) continue;
      parts.push(
        item.known
          ? `${item.sku}: ${item.stockQty} left${item.lowStock ? ' ⚠️ low stock' : ''}`
          : `${item.sku}: not in inventory`,
      );
    }

    for (const warning of response.warnings || []) parts.push(warning);

    container.textContent = parts.join('\n');
    container.style.whiteSpace = 'pre-line';

    if (response.calendar?.htmlLink) {
      const link = document.createElement('a');
      link.href = response.calendar.htmlLink;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Open calendar event';
      container.appendChild(document.createElement('br'));
      container.appendChild(link);
    }

    // Shown when Google sign-in is unavailable — one click saves the reminder.
    if (response.calendarUrl) {
      const link = document.createElement('a');
      link.href = response.calendarUrl;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Add to Google Calendar';
      container.appendChild(document.createElement('br'));
      container.appendChild(link);
    }
  }

  /* ------------------------------- detection ------------------------------ */

  function looksLikeSuccess(text) {
    return SUCCESS_PATTERNS.some((pattern) => pattern.test(text));
  }

  const onPossibleSale = debounce(async () => {
    const draft = buildDraft();
    const hash = hashDraft(draft);

    if (hash === lastAutoHash || hasSeen(hash)) return;
    lastAutoHash = hash;

    if (draft.items.length === 0) {
      setStatus('Sale page detected — click “Capture this invoice”.', 'warn');
      panel.hidden = false;
      return;
    }

    if (settings.autoSend) {
      setStatus('Sale detected — recording…');
      markSeen(hash);
      const response = await sendMessage({ type: 'RECORD_SALE', sale: draft });
      setStatus(
        response?.ok
          ? `Recorded. Reminder for ${response.calendar?.date || response.reminder?.date || 'next year'}.`
          : `Failed: ${response?.error || 'unknown error'}`,
        response?.ok ? 'good' : 'bad',
      );
      return;
    }

    setStatus('Sale detected — confirm the details.', 'warn');
    openModal(draft);
  }, 900);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const text = norm(node.innerText || node.textContent || '');
        if (text && text.length < 400 && looksLikeSuccess(text)) {
          onPossibleSale();
          return;
        }
      }
    }
  });

  function startObserver() {
    if (!document.body) {
      setTimeout(startObserver, 500);
      return;
    }
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // SPA navigation: Swipe is a single-page app, so watch history changes too.
  function onUrlChange() {
    if (onSalesListPage()) {
      const rows = scanSalesList();
      setStatus(
        rows.length
          ? `${rows.length} sale${rows.length === 1 ? '' : 's'} on this page — open the panel and use “Read sales list”.`
          : 'Sales list detected — scroll the table so the rows load, then use “Read sales list”.',
        rows.length ? 'good' : 'warn',
      );
      return;
    }

    const path = location.pathname.toLowerCase();
    if (/(invoice|bill|sale|pos|checkout)/.test(path)) {
      setStatus('Invoice screen detected — capture when the sale is saved.');
    }
  }

  // The page renders after the URL changes, so give the table a moment.
  const scheduleUrlCheck = debounce(onUrlChange, 1500);

  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function patched(...args) {
      const result = original.apply(this, args);
      scheduleUrlCheck();
      return result;
    };
  }
  window.addEventListener('popstate', scheduleUrlCheck);

  // Lets the toolbar popup open the capture dialog on the active tab, which
  // also proves the page assistant is actually injected here.
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'OPEN_CAPTURE') return false;
    sendResponse({ ok: runAction('capture') });
    return false;
  });

  loadSettings();
  startObserver();
  scheduleUrlCheck();
})();
