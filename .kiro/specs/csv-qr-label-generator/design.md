# Design Document: CSV QR Label Generator

## Overview

A fully client-side Next.js 15 (App Router) application that accepts a CSV or Excel (.xlsx) file, parses it in the browser, and renders a printable grid of side-by-side Code 128 barcode label pairs. No data ever leaves the client. The UI is built with Tailwind CSS and Shadcn UI components; barcodes are rendered as SVG via `react-barcode`.

### Technology Stack

| Concern | Library | Justification |
|---|---|---|
| Framework | Next.js 15 App Router | Required by project constraints |
| Language | TypeScript | Type safety across data models |
| Styling | Tailwind CSS + Shadcn UI | Consistent design system, rapid layout |
| CSV parsing | PapaParse | De-facto standard, header-aware, streaming-capable |
| Excel parsing | xlsx (SheetJS) | Widely used, handles `.xlsx` natively in browser |
| Barcode rendering | react-barcode | Outputs Code 128 as inline SVG — crisp at any DPI |
| Icons | lucide-react | Matches Shadcn UI icon style |

`react-barcode` is chosen over alternatives (e.g. `bwip-js`, `jsbarcode` direct) because it is a React component that renders an `<svg>` element directly into the DOM, requiring no canvas manipulation and producing resolution-independent output that prints cleanly at any scale.

---

## Architecture

The application is a single Next.js page (`app/page.tsx`) that owns all state. Child components are pure presentational components that receive props. All parsing logic lives in utility modules under `lib/`.

```
app/
  page.tsx                  ← root page, owns state
  globals.css               ← @media print rules live here
components/
  FileUploader.tsx           ← file input + drag-drop zone
  DataPreviewTable.tsx       ← parsed data preview
  LabelRenderer.tsx          ← outer grid of label pairs
  SingleLabel.tsx            ← one 2×1 inch label
lib/
  parseCSV.ts                ← PapaParse wrapper
  parseExcel.ts              ← xlsx wrapper
  validateColumns.ts         ← shared column validation
  types.ts                   ← shared TypeScript types
```

### Data Flow

```
User selects file
      │
      ▼
FileUploader (onChange)
      │  File object
      ▼
page.tsx handleFile()
      │  detects .csv / .xlsx
      ├─── parseCSV(file)   → LabelRow[]
      └─── parseExcel(file) → LabelRow[]
              │
              ▼
        validateColumns()
              │  error string | null
              ▼
        setState({ rows, error })
              │
      ┌───────┴────────────┐
      ▼                    ▼
DataPreviewTable      LabelRenderer
(rows)                (rows)
                           │
                     ┌─────┴─────┐
                     ▼           ▼
               SingleLabel  SingleLabel  (×2 per row)
```

State is held entirely in `page.tsx` using `useState`. No global state manager is needed given the linear data flow.

---

## Components and Interfaces

### `page.tsx`

Owns application state and orchestrates all child components.

```typescript
type AppState = {
  rows: LabelRow[];
  error: string | null;
  filename: string | null;
};
```

Responsibilities:
- Renders `FileUploader`, `DataPreviewTable`, `LabelRenderer`, and the Print button
- Calls `handleFile(file: File)` on upload, which dispatches to the correct parser
- Passes `rows` and `error` down as props
- Disables the Print button when `rows.length === 0`

### `FileUploader`

```typescript
interface FileUploaderProps {
  onFile: (file: File) => void;
  filename: string | null;
  error: string | null;
}
```

- Shadcn `<Input type="file" accept=".csv,.xlsx" />`
- Displays `filename` when set
- Displays `error` as a destructive alert when present
- Shows instructional placeholder when neither filename nor error is set

### `DataPreviewTable`

```typescript
interface DataPreviewTableProps {
  rows: LabelRow[];
}
```

- Shadcn `<Table>` with columns: `#`, `Left_Value`, `Right_Value`
- Displays row count above the table
- Hidden in print view via `print:hidden` Tailwind class

### `LabelRenderer`

```typescript
interface LabelRendererProps {
  rows: LabelRow[];
}
```

- Maps `rows` to `<LabelPair>` elements
- Each `LabelPair` renders two `<SingleLabel>` components side by side
- Uses a `div` with `id="label-renderer"` for print targeting

### `SingleLabel`

```typescript
interface SingleLabelProps {
  leftValue: string;
  rightValue: string;
}
```

- Fixed size: `2in × 1in` via inline styles
- Three vertically stacked children:
  1. `<p>` — bold, `Left_Value`, truncated if overflowing
  2. `<Barcode>` from `react-barcode` — Code 128, SVG output
  3. `<p>` — small text, `Right_Value`

---

## Data Models

```typescript
// lib/types.ts

/** One row of parsed input data */
export interface LabelRow {
  Left_Value: string;
  Right_Value: string;
}

/** Result returned by all parser functions */
export type ParseResult =
  | { ok: true; rows: LabelRow[] }
  | { ok: false; error: string };
```

### Utility Functions

#### `parseCSV(file: File): Promise<ParseResult>`

```typescript
// lib/parseCSV.ts
import Papa from 'papaparse';
import { validateColumns } from './validateColumns';
import type { LabelRow, ParseResult } from './types';

export async function parseCSV(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const colError = validateColumns(results.meta.fields ?? []);
        if (colError) return resolve({ ok: false, error: colError });
        const rows = results.data
          .filter(r => r.Left_Value?.trim() || r.Right_Value?.trim())
          .map(r => ({ Left_Value: r.Left_Value ?? '', Right_Value: r.Right_Value ?? '' }));
        resolve({ ok: true, rows });
      },
      error(err) {
        resolve({ ok: false, error: err.message });
      },
    });
  });
}
```

#### `parseExcel(file: File): Promise<ParseResult>`

```typescript
// lib/parseExcel.ts
import * as XLSX from 'xlsx';
import { validateColumns } from './validateColumns';
import type { LabelRow, ParseResult } from './types';

export async function parseExcel(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });
  if (raw.length === 0) return { ok: true, rows: [] };
  const colError = validateColumns(Object.keys(raw[0]));
  if (colError) return { ok: false, error: colError };
  const rows: LabelRow[] = raw
    .filter(r => r.Left_Value?.trim() || r.Right_Value?.trim())
    .map(r => ({ Left_Value: String(r.Left_Value), Right_Value: String(r.Right_Value) }));
  return { ok: true, rows };
}
```

#### `validateColumns(fields: string[]): string | null`

```typescript
// lib/validateColumns.ts
const REQUIRED = ['Left_Value', 'Right_Value'] as const;

export function validateColumns(fields: string[]): string | null {
  const missing = REQUIRED.filter(col => !fields.includes(col));
  if (missing.length === 0) return null;
  return `Missing required column(s): ${missing.join(', ')}`;
}
```

---

## Label Layout and Print CSS

### Label Dimensions

Each label is sized using CSS inch units, which map directly to physical print dimensions:

```
┌─────────────────────────────────────────┐
│  Label Pair  (4in × 1in)                │
│  ┌──────────────────┬──────────────────┐│
│  │  SingleLabel     │  SingleLabel     ││
│  │  (2in × 1in)     │  (2in × 1in)     ││
│  │                  │                  ││
│  │  [Left_Value]    │  [Left_Value]    ││
│  │  ▐▌▐▌▐▌▐▌▐▌▐▌   │  ▐▌▐▌▐▌▐▌▐▌▐▌   ││
│  │  [Right_Value]   │  [Right_Value]   ││
│  └──────────────────┴──────────────────┘│
└─────────────────────────────────────────┘
```

### `SingleLabel` inline styles

```typescript
const labelStyle: React.CSSProperties = {
  width: '2in',
  height: '1in',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  boxSizing: 'border-box',
  padding: '2px 4px',
  border: '1px solid #ccc', // visible on screen, can be removed for print
};
```

`react-barcode` props for a compact 2×1 label:

```typescript
<Barcode
  value={rightValue}
  format="CODE128"
  renderer="svg"
  width={1.2}      // bar width in px
  height={40}      // bar height in px
  displayValue={false}  // we render the value ourselves below
  margin={0}
/>
```

### Print CSS (`app/globals.css`)

```css
@media print {
  /* Hide all UI chrome */
  .no-print {
    display: none !important;
  }

  /* Remove browser default page margins */
  @page {
    margin: 0;
  }

  body {
    margin: 0;
    padding: 0;
  }

  /* Ensure label pairs don't break across pages mid-label */
  .label-pair {
    page-break-inside: avoid;
    break-inside: avoid;
  }
}
```

All interactive UI elements (header, `FileUploader`, `DataPreviewTable`, Print button) receive the `no-print` class. The `LabelRenderer` output has no `no-print` class and renders normally in print mode.

---

## Error Handling

| Scenario | Handling |
|---|---|
| Unsupported file extension | `FileUploader` validates `file.name` extension before calling `onFile`; shows inline error |
| Missing `Left_Value` / `Right_Value` columns | `validateColumns` returns descriptive error string; displayed in UI |
| PapaParse parse error | `error` callback resolves `ParseResult` with `ok: false` |
| xlsx parse exception | `try/catch` in `parseExcel` resolves `ParseResult` with `ok: false` |
| Empty file (0 data rows) | Parsed successfully as `rows: []`; Print button disabled; preview shows 0 rows |
| New file uploaded | `handleFile` resets state (`rows: [], error: null`) before parsing |

All errors surface through the single `error: string | null` state field in `page.tsx` and are displayed by `FileUploader` as a Shadcn destructive `<Alert>`.


---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Unsupported extension always produces an error

*For any* filename whose extension is not `.csv` or `.xlsx`, the file validation logic should return a non-null error string.

**Validates: Requirements 1.3**

---

### Property 2: CSV parsing extracts correct columns

*For any* array of `LabelRow` objects serialized to CSV format, parsing that CSV with `parseCSV` should produce a `ParseResult` with `ok: true` and rows whose `Left_Value` and `Right_Value` fields match the original data.

**Validates: Requirements 2.1, 2.4**

---

### Property 3: Excel parsing round-trip

*For any* array of `LabelRow` objects serialized to `.xlsx` format, parsing that file with `parseExcel` should produce a `ParseResult` with `ok: true` and rows whose `Left_Value` and `Right_Value` fields match the original data.

**Validates: Requirements 3.1, 3.4**

---

### Property 4: Empty rows are always filtered out

*For any* parsed output (CSV or Excel), no row in the resulting `LabelRow[]` array should have both `Left_Value` and `Right_Value` as empty or whitespace-only strings.

**Validates: Requirements 2.2, 3.2**

---

### Property 5: Missing columns always produce a named error

*For any* set of column header strings that omits `Left_Value`, `Right_Value`, or both, `validateColumns` should return an error string that explicitly names every missing column.

**Validates: Requirements 2.3, 3.3**

---

### Property 6: Label pair count equals row count

*For any* non-empty `LabelRow[]`, the `LabelRenderer` should render exactly `rows.length` label pair containers.

**Validates: Requirements 5.1**

---

### Property 7: Each label contains all three required elements

*For any* `LabelRow`, the rendered `SingleLabel` component should contain a bold header element displaying `Left_Value`, an SVG barcode element, and a small-text element displaying `Right_Value`.

**Validates: Requirements 5.2, 5.5**

---

### Property 8: Parse error clears rows

*For any* application state that contains previously parsed rows, when a new parse operation returns `ok: false`, the resulting state should have `rows: []` and a non-null `error` string.

**Validates: Requirements 7.2**

---

### Property 9: New file upload resets state

*For any* sequence of two file uploads, the application state after the second upload should contain only data derived from the second file — no rows from the first file should be present.

**Validates: Requirements 7.3**

---

## Testing Strategy

### Dual Testing Approach

Both unit tests and property-based tests are required. They are complementary:

- **Unit tests** cover specific examples, integration points, and UI state assertions
- **Property tests** verify universal invariants across randomly generated inputs

### Property-Based Testing

**Library**: [`fast-check`](https://github.com/dubzzz/fast-check) — the standard PBT library for TypeScript/JavaScript.

Each property test must run a minimum of **100 iterations** (fast-check default is 100; set explicitly via `{ numRuns: 100 }`).

Each test must include a comment referencing the design property it validates:

```typescript
// Feature: csv-qr-label-generator, Property 2: CSV parsing extracts correct columns
it('round-trips LabelRow[] through CSV serialization', () => {
  fc.assert(
    fc.property(fc.array(labelRowArbitrary()), async (rows) => {
      const csv = rowsToCSV(rows);
      const file = new File([csv], 'test.csv', { type: 'text/csv' });
      const result = await parseCSV(file);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.rows).toEqual(rows);
    }),
    { numRuns: 100 }
  );
});
```

**Property tests to implement** (one test per property):

| Test | Design Property | Tag |
|---|---|---|
| Unsupported extension → error | Property 1 | `Feature: csv-qr-label-generator, Property 1` |
| CSV round-trip | Property 2 | `Feature: csv-qr-label-generator, Property 2` |
| Excel round-trip | Property 3 | `Feature: csv-qr-label-generator, Property 3` |
| Empty rows filtered | Property 4 | `Feature: csv-qr-label-generator, Property 4` |
| Missing columns named in error | Property 5 | `Feature: csv-qr-label-generator, Property 5` |
| Label pair count = row count | Property 6 | `Feature: csv-qr-label-generator, Property 6` |
| SingleLabel contains all three elements | Property 7 | `Feature: csv-qr-label-generator, Property 7` |
| Parse error clears rows | Property 8 | `Feature: csv-qr-label-generator, Property 8` |
| New file upload resets state | Property 9 | `Feature: csv-qr-label-generator, Property 9` |

### Unit Tests (Examples and Edge Cases)

Unit tests focus on concrete scenarios that are not well-suited to property generation:

- **File input accept attribute** — verify `<input>` has `accept=".csv,.xlsx"` (Req 1.1)
- **Filename display** — after file selection, filename appears in UI (Req 1.2)
- **Row count display** — `DataPreviewTable` shows correct count for a known input (Req 4.2)
- **Print button disabled** — when `rows = []`, Print button has `disabled` attribute (Req 6.5)
- **Label dimensions** — `SingleLabel` inline styles set `width: 2in`, `height: 1in`; `LabelPair` sets `width: 4in` (Req 5.3, 5.4)
- **Print CSS classes** — UI chrome elements have `no-print` class; `LabelRenderer` does not (Req 6.2)
- **Initial placeholder** — on first render with no file, instructional text is visible (Req 7.1)
- **Empty file** — parsing a CSV with only a header row produces `rows: []` without error

### Test File Structure

```
__tests__/
  lib/
    parseCSV.test.ts
    parseExcel.test.ts
    validateColumns.test.ts
  components/
    SingleLabel.test.tsx
    LabelRenderer.test.tsx
    DataPreviewTable.test.tsx
    FileUploader.test.tsx
  page.test.tsx
```
