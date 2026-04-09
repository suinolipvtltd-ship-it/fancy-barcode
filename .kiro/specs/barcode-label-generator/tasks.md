# Implementation Plan: Barcode Label Generator

## Overview

Incrementally build a Next.js (App Router) barcode label generator for Zebra thermal printers. The implementation starts with project scaffolding and core types, then builds file parsing, label rendering, PDF generation, ZPL generation, job persistence, and error handling — wiring everything together in the main page at the end.

## Tasks

- [x] 1. Set up project structure, dependencies, and core types
  - [x] 1.1 Initialize Next.js project with App Router and install dependencies
    - Initialize a Next.js (App Router) TypeScript project if not already present
    - Install dependencies: `react-pdf` (`@react-pdf/renderer`), `xlsx`, `jsbarcode`, `fast-check` (dev), and a test runner (`vitest` or `jest`)
    - Install Neon serverless driver: `@neondatabase/serverless`
    - Set up `vitest` (or `jest`) config for the project
    - _Requirements: all (project foundation)_

  - [x] 1.2 Define core TypeScript interfaces and constants
    - Create `src/lib/types.ts` with `ProductRecord`, `ParseResult`, `LabelConfig`, `CreateJobRequest`, `JobRecord` interfaces
    - Create `src/lib/constants.ts` with PDF layout constants (page width 309.6pt, label width 144pt, label height 72pt, column gap 9pt, left margin 2.7pt)
    - _Requirements: 2.1, 2.3, 3.3, 3.4, 4.1, 5.1, 5.2, 5.3, 9.1_

- [x] 2. Implement file upload and parsing
  - [x] 2.1 Create the FileUploader component
    - Build `src/components/FileUploader.tsx` with drag-and-drop zone and click-to-browse fallback
    - Accept only `.xlsx` and `.csv` extensions; show error for other types
    - Display file name + success indicator on valid drop; instructional text when empty
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 2.2 Implement the fileProcessor module
    - Create `src/lib/fileProcessor.ts` with `parseFile(file: File): Promise<ParseResult>`
    - Use `xlsx` library to read both `.xlsx` and `.csv` formats client-side
    - Validate required columns (Product Name, SKU, MRP, Barcode Value); return errors listing missing columns
    - Skip rows with empty Barcode Value, recording warnings with row numbers
    - Return error if zero valid rows remain after parsing
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 8.1_

  - [ ]\* 2.3 Write property tests for file parsing (Properties 1–4)
    - **Property 1: File extension validation** — generate random file names, assert accepted iff extension is `.xlsx` or `.csv`
    - **Validates: Requirements 1.1, 1.3**
    - **Property 2: File parsing round trip** — generate random tabular data with required columns, serialize to CSV string, parse, verify field equality
    - **Validates: Requirements 2.1, 2.3**
    - **Property 3: Missing column detection** — generate random subsets of required columns to omit, verify error lists exactly those columns
    - **Validates: Requirements 2.2**
    - **Property 4: Empty barcode row filtering** — generate datasets with random empty barcode positions, verify filtered output and warning row numbers
    - **Validates: Requirements 2.4**

- [x] 3. Checkpoint — File upload and parsing
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement label rendering
  - [x] 4.1 Create the LabelCanvas component
    - Build `src/components/LabelCanvas.tsx` as a react-pdf `<View>` element sized at 144×72 points
    - Render barcode image using jsbarcode (pre-rendered to data URL)
    - Conditionally show Product Name and SKU based on `LabelConfig`
    - Always show barcode image and MRP
    - Truncate long product names with ellipsis via react-pdf text styles
    - _Requirements: 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ]\* 4.2 Write property tests for label rendering (Properties 5–6)
    - **Property 5: Label content respects configuration** — generate random ProductRecords and LabelConfig booleans, verify rendered output contains exactly the expected fields
    - **Validates: Requirements 3.3, 3.4, 3.5**
    - **Property 6: Long product name truncation** — generate product names exceeding label width, verify truncation with ellipsis
    - **Validates: Requirements 4.3**

  - [x] 4.3 Create the LabelConfigPanel component
    - Build `src/components/LabelConfigPanel.tsx` with checkboxes for Include Product Name (default: checked) and Include SKU (default: checked)
    - Add output mode toggle (PDF / ZPL) and DPI selector (203 / 300) shown only when ZPL is selected
    - Accept `zplEnabled` feature flag prop to show/hide ZPL options
    - _Requirements: 3.1, 3.2, 7.1, 7.5_

- [x] 5. Implement PDF generation
  - [x] 5.1 Create the pdfGenerator module
    - Build `src/lib/pdfGenerator.ts` with `generatePdf(options): Promise<Blob>`
    - Use react-pdf to compose a 2-column grid layout: page width 309.6pt, label cells 144×72pt, column gap 9pt, left margin 2.7pt
    - Portrait orientation, no auto-scaling
    - Handle odd label count: last label in left column, right column empty
    - Catch react-pdf rendering failures and surface error with retry option
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 8.3_

  - [ ]\* 5.2 Write property tests for PDF layout (Properties 7–8)
    - **Property 7: PDF layout dimensions** — generate random-length ProductRecord arrays, verify page width, label cell dimensions, and gap in the PDF document structure
    - **Validates: Requirements 4.1, 5.1, 5.2, 5.3**
    - **Property 8: Odd label count layout** — generate random odd-length arrays, verify last label is in left column
    - **Validates: Requirements 5.4**

- [x] 6. Checkpoint — Label rendering and PDF generation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement ZPL generation
  - [x] 7.1 Create the zplGenerator module
    - Build `src/lib/zplGenerator.ts` with `generateZpl(options): string`
    - Generate one ZPL label block per ProductRecord
    - Use `^PW832` for 203 DPI, `^PW1248` for 300 DPI
    - Respect label content configuration (Product Name, SKU toggles)
    - _Requirements: 7.2, 7.3, 7.4_

  - [ ]\* 7.2 Write property tests for ZPL generation (Properties 9–10)
    - **Property 9: ZPL record count** — generate random ProductRecord arrays, verify ZPL output contains exactly one label block per record
    - **Validates: Requirements 7.2**
    - **Property 10: ZPL DPI print width command** — generate random DPI selection (203 or 300), verify correct `^PW` command in output
    - **Validates: Requirements 7.3, 7.4**

- [x] 8. Implement barcode validation and error handling
  - [x] 8.1 Add invalid barcode handling to label generation
    - In the PDF and ZPL generation flows, attempt to encode each barcode value with jsbarcode
    - Skip labels with unencodable barcode values and collect warnings with affected row numbers
    - Surface row-level warnings to the UI alongside successful output
    - _Requirements: 8.2_

  - [ ]\* 8.2 Write property test for invalid barcode handling (Property 11)
    - **Property 11: Invalid barcode handling** — generate ProductRecords with invalid barcode values, verify they are skipped with appropriate warnings referencing row numbers
    - **Validates: Requirements 8.2**

- [x] 9. Implement job history persistence
  - [x] 9.1 Set up database schema and Neon connection
    - Create database migration or setup script for the `jobs` table (UUID id, file_name, row_count, created_at) with index on `created_at DESC`
    - Configure Neon serverless driver connection using environment variable `DATABASE_URL`
    - _Requirements: 9.1_

  - [x] 9.2 Create API routes for job persistence
    - Build `app/api/jobs/route.ts` with POST handler (accepts `CreateJobRequest`, inserts into `jobs` table, returns created `JobRecord`)
    - Build GET handler (fetches jobs ordered by `created_at DESC`, returns array of `JobRecord`)
    - Handle database errors gracefully: POST failure is non-blocking (warning), GET failure returns empty list with message
    - _Requirements: 9.1, 9.2_

  - [ ]\* 9.3 Write property test for job metadata round trip (Property 12)
    - **Property 12: Job metadata persistence round trip** — generate random job metadata, POST then GET via API routes, verify equality of file name, row count, and timestamp
    - **Validates: Requirements 9.1**

  - [x] 9.4 Create the JobHistory component
    - Build `src/components/JobHistory.tsx` displaying a list of previous jobs with file name, row count, and timestamp
    - Fetch jobs from GET `/api/jobs` on mount
    - Handle fetch errors gracefully with "Unable to load job history" message
    - _Requirements: 9.2, 9.3_

  - [ ]\* 9.5 Write property test for job metadata display (Property 13)
    - **Property 13: Job metadata display completeness** — generate random JobRecords, verify rendered output contains file name, row count, and timestamp
    - **Validates: Requirements 9.3**

- [x] 10. Checkpoint — ZPL, error handling, and persistence
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Wire everything together in the main page
  - [x] 11.1 Build the main application page
    - Create `app/page.tsx` as the single-page application
    - Wire FileUploader → fileProcessor → LabelConfigPanel → PDF/ZPL generation flow
    - Display parsed record count and any warnings/errors after file upload
    - Add generate button that triggers PDF or ZPL output based on config
    - On successful generation, POST job metadata to `/api/jobs` (non-blocking)
    - Provide PDF download link and ZPL copy/download action
    - _Requirements: 1.1, 1.2, 2.1, 3.1, 3.2, 5.5, 7.1, 8.1, 8.2, 8.3, 9.1_

  - [x] 11.2 Add the PrintReminder component
    - Build `src/components/PrintReminder.tsx` as a non-dismissible banner
    - Display after PDF generation with instructions: set Margins: None and Scale: 100%
    - Show only when output mode is PDF
    - _Requirements: 6.1, 6.2_

- [x] 12. Final checkpoint — Full integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests use `fast-check` with a minimum of 100 iterations per property
- All file parsing and PDF generation happens client-side; only job metadata goes to the server
