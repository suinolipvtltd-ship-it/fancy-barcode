# Implementation Plan: CSV QR Label Generator

## Overview

Implement a client-side Next.js 15 App Router application that parses CSV/Excel files and renders printable Code 128 barcode label pairs. Tasks are sequenced so each step builds on the previous, ending with full integration.

## Tasks

- [x] 1. Install dependencies and configure project
  - Run `npm install papaparse xlsx react-barcode fast-check` and `npm install -D @types/papaparse`
  - Initialize Shadcn UI and add required components: `npx shadcn@latest init` then add `input`, `table`, `alert`, `button`
  - Verify `tsconfig.json` includes path aliases and strict mode is enabled
  - _Requirements: 1.1, 5.6_

- [x] 2. Define shared types and validation utility
  - [x] 2.1 Create `lib/types.ts` with `LabelRow` interface and `ParseResult` discriminated union
    - `LabelRow`: `{ Left_Value: string; Right_Value: string }`
    - `ParseResult`: `{ ok: true; rows: LabelRow[] } | { ok: false; error: string }`
    - _Requirements: 2.1, 3.1_

  - [x] 2.2 Create `lib/validateColumns.ts` with `validateColumns(fields: string[]): string | null`
    - Return `null` when both `Left_Value` and `Right_Value` are present
    - Return a descriptive error string naming every missing column when any are absent
    - _Requirements: 2.3, 3.3_

  - [ ]* 2.3 Write property test for `validateColumns` — Property 5
    - **Property 5: Missing columns always produce a named error**
    - **Validates: Requirements 2.3, 3.3**
    - File: `__tests__/lib/validateColumns.test.ts`
    - Use `fc.array(fc.string())` filtered to exclude sets containing both required columns
    - Assert the returned error string contains each missing column name

- [x] 3. Implement CSV parser
  - [x] 3.1 Create `lib/parseCSV.ts` wrapping PapaParse
    - Use `header: true`, `skipEmptyLines: true`
    - Call `validateColumns` on `results.meta.fields`
    - Filter rows where both values are empty/whitespace; map to `LabelRow[]`
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ]* 3.2 Write property test for `parseCSV` — Property 2
    - **Property 2: CSV parsing extracts correct columns**
    - **Validates: Requirements 2.1, 2.4**
    - File: `__tests__/lib/parseCSV.test.ts`
    - Generate `LabelRow[]` with `fc.array(labelRowArbitrary())`, serialize to CSV string, parse back, assert round-trip equality

  - [ ]* 3.3 Write property test for empty-row filtering — Property 4 (CSV)
    - **Property 4: Empty rows are always filtered out**
    - **Validates: Requirements 2.2**
    - Assert no row in result has both `Left_Value` and `Right_Value` as empty/whitespace

- [x] 4. Implement Excel parser
  - [x] 4.1 Create `lib/parseExcel.ts` wrapping SheetJS
    - Read first worksheet via `XLSX.read` + `sheet_to_json`
    - Call `validateColumns` on keys of first row
    - Filter empty rows; map to `LabelRow[]`; wrap in try/catch for parse errors
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ]* 4.2 Write property test for `parseExcel` — Property 3
    - **Property 3: Excel parsing round-trip**
    - **Validates: Requirements 3.1, 3.4**
    - File: `__tests__/lib/parseExcel.test.ts`
    - Generate `LabelRow[]`, build an in-memory `.xlsx` buffer via SheetJS, parse with `parseExcel`, assert round-trip equality

  - [ ]* 4.3 Write property test for empty-row filtering — Property 4 (Excel)
    - **Property 4: Empty rows are always filtered out**
    - **Validates: Requirements 3.2**
    - Assert no row in result has both fields empty/whitespace

- [x] 5. Checkpoint — Ensure all lib tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement `SingleLabel` component
  - [x] 6.1 Create `components/SingleLabel.tsx`
    - Accept `{ leftValue: string; rightValue: string }` props
    - Render three vertically stacked elements: bold `<p>` for `Left_Value`, `<Barcode>` (react-barcode, CODE128, SVG renderer, `displayValue={false}`), small `<p>` for `Right_Value`
    - Apply inline styles: `width: '2in'`, `height: '1in'`, flex column, centered, `overflow: hidden`
    - _Requirements: 5.2, 5.4, 5.5_

  - [ ]* 6.2 Write property test for `SingleLabel` — Property 7
    - **Property 7: Each label contains all three required elements**
    - **Validates: Requirements 5.2, 5.5**
    - File: `__tests__/components/SingleLabel.test.tsx`
    - Generate arbitrary `LabelRow` values; render `SingleLabel`; assert bold header, SVG element, and right-value text are all present in the DOM

  - [ ]* 6.3 Write unit test for `SingleLabel` dimensions
    - Assert inline styles set `width: '2in'` and `height: '1in'`
    - _Requirements: 5.4_

- [x] 7. Implement `LabelRenderer` component
  - [x] 7.1 Create `components/LabelRenderer.tsx`
    - Accept `{ rows: LabelRow[] }` props
    - Map each row to a `div.label-pair` containing two `<SingleLabel>` components side by side (flexbox row)
    - Apply `id="label-renderer"` to the outer container
    - Size each pair: `width: '4in'`, `height: '1in'`
    - _Requirements: 5.1, 5.3_

  - [ ]* 7.2 Write property test for `LabelRenderer` — Property 6
    - **Property 6: Label pair count equals row count**
    - **Validates: Requirements 5.1**
    - File: `__tests__/components/LabelRenderer.test.tsx`
    - Generate `fc.array(labelRowArbitrary(), { minLength: 1 })`; render `LabelRenderer`; assert number of `.label-pair` elements equals `rows.length`

  - [ ]* 7.3 Write unit test for `LabelRenderer` pair dimensions
    - Assert each pair container has `width: '4in'` and `height: '1in'`
    - _Requirements: 5.3_

- [x] 8. Implement `DataPreviewTable` component
  - [x] 8.1 Create `components/DataPreviewTable.tsx`
    - Accept `{ rows: LabelRow[] }` props
    - Render Shadcn `<Table>` with columns `#`, `Left_Value`, `Right_Value`
    - Display row count above the table
    - Apply `print:hidden` Tailwind class to the root element
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ]* 8.2 Write unit test for `DataPreviewTable`
    - Assert row count label shows correct number for a known input
    - Assert table renders correct cell values
    - _Requirements: 4.1, 4.2_

- [x] 9. Implement `FileUploader` component
  - [x] 9.1 Create `components/FileUploader.tsx`
    - Accept `{ onFile: (file: File) => void; filename: string | null; error: string | null }` props
    - Render Shadcn `<Input type="file" accept=".csv,.xlsx" />`
    - Validate extension client-side before calling `onFile`; set inline error for unsupported types
    - Display `filename` when set; display `error` as Shadcn destructive `<Alert>` when present
    - Show instructional placeholder when neither filename nor error is set
    - _Requirements: 1.1, 1.2, 1.3, 7.1_

  - [ ]* 9.2 Write property test for extension validation — Property 1
    - **Property 1: Unsupported extension always produces an error**
    - **Validates: Requirements 1.3**
    - File: `__tests__/components/FileUploader.test.tsx`
    - Generate filenames with arbitrary non-`.csv`/`.xlsx` extensions; assert error is displayed and `onFile` is not called

  - [ ]* 9.3 Write unit tests for `FileUploader`
    - Assert `<input>` has `accept=".csv,.xlsx"` attribute
    - Assert filename is displayed after file selection
    - Assert instructional placeholder is visible on initial render
    - _Requirements: 1.1, 1.2, 7.1_

- [x] 10. Implement `app/page.tsx` with state management
  - [x] 10.1 Create `app/page.tsx` with `AppState` and `handleFile` logic
    - State: `{ rows: LabelRow[]; error: string | null; filename: string | null }`
    - `handleFile`: reset state, detect `.csv`/`.xlsx` extension, dispatch to `parseCSV` or `parseExcel`, update state with result
    - Render `FileUploader`, `DataPreviewTable` (when rows > 0), `LabelRenderer` (when rows > 0), and Print button
    - Apply `no-print` class to all UI chrome elements; Print button calls `window.print()`
    - Disable Print button when `rows.length === 0`
    - _Requirements: 1.2, 1.4, 6.1, 6.5, 7.2, 7.3_

  - [ ]* 10.2 Write property test for parse error state — Property 8
    - **Property 8: Parse error clears rows**
    - **Validates: Requirements 7.2**
    - File: `__tests__/page.test.tsx`
    - Simulate state with existing rows; trigger a parse that returns `ok: false`; assert `rows` is empty and `error` is non-null

  - [ ]* 10.3 Write property test for new file upload reset — Property 9
    - **Property 9: New file upload resets state**
    - **Validates: Requirements 7.3**
    - Generate two sequences of `LabelRow[]`; simulate two sequential uploads; assert final state contains only rows from the second file

  - [ ]* 10.4 Write unit tests for `page.tsx`
    - Assert Print button is disabled when `rows = []`
    - Assert Print button is enabled after successful parse
    - Assert UI chrome elements carry `no-print` class
    - _Requirements: 6.1, 6.5, 6.2_

- [x] 11. Add print CSS to `app/globals.css`
  - Add `@media print` block hiding `.no-print` elements with `display: none !important`
  - Add `@page { margin: 0; }` and `body { margin: 0; padding: 0; }` inside the print block
  - Add `.label-pair { page-break-inside: avoid; break-inside: avoid; }` rule
  - _Requirements: 6.2, 6.3, 4.3_

  - [ ]* 11.1 Write unit test for print CSS classes
    - Assert `LabelRenderer` root element does not have `no-print` class
    - Assert header, `FileUploader`, `DataPreviewTable`, and Print button all have `no-print` class
    - _Requirements: 6.2_

- [x] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use `fast-check` with `{ numRuns: 100 }` and a comment tagging the design property (e.g. `// Feature: csv-qr-label-generator, Property 2`)
- Unit tests cover concrete examples and UI assertions not suited to property generation
- `react-barcode` renders SVG; no canvas manipulation required
