# Requirements Document

## Introduction

A client-side React/Next.js application that allows users to upload a CSV or Excel (.xlsx) file containing two columns of data, then generates a printable layout of side-by-side linear barcode label pairs. Each label pair is sized at 4×1 inches (two 2×1 inch labels side by side). Each label displays a bold human-readable header text at the top, a Code 128 linear barcode in the middle, and the numeric barcode value in small text beneath the barcode. The app provides a print mode that hides all UI chrome and renders only the labels.

## Glossary

- **App**: The Next.js (App Router) application implementing this feature
- **Label_Pair**: A single row in the printed output containing two identical labels side by side, representing one row of input data
- **Left_Value**: The data value from the first column of the uploaded file, displayed as the bold header text on each label (e.g. a price/SKU string such as "₹ 1699.00/AB1241-9")
- **Right_Value**: The data value from the second column of the uploaded file, encoded in the Code 128 barcode and printed as small text beneath the barcode
- **Barcode**: A Code 128 linear barcode generated from the Right_Value string, rendered as SVG
- **File_Parser**: The client-side module responsible for parsing CSV and Excel files into structured row data
- **Label_Renderer**: The React component responsible for rendering Label_Pairs as a printable grid
- **Print_View**: The CSS print media query-controlled layout that hides all UI elements except the Label_Renderer output

## Requirements

### Requirement 1: File Upload

**User Story:** As a user, I want to upload a CSV or Excel file, so that I can generate barcode labels from my data.

#### Acceptance Criteria

1. THE App SHALL accept file uploads via a file input component that restricts accepted file types to `.csv` and `.xlsx`
2. WHEN a user selects a file, THE App SHALL display the selected filename in the UI
3. IF a user selects a file with an unsupported extension, THEN THE App SHALL display an error message indicating the supported formats
4. THE App SHALL perform all file parsing on the client side without sending data to any server

---

### Requirement 2: CSV Parsing

**User Story:** As a user, I want my CSV file to be parsed correctly, so that each row's values are extracted for barcode label generation.

#### Acceptance Criteria

1. WHEN a `.csv` file is uploaded, THE File_Parser SHALL parse it using PapaParse with headers enabled, extracting `Left_Value` and `Right_Value` columns
2. WHEN a CSV file is parsed, THE File_Parser SHALL skip rows where both `Left_Value` and `Right_Value` are empty strings
3. IF a CSV file is missing the `Left_Value` or `Right_Value` header columns, THEN THE File_Parser SHALL display an error message identifying the missing column names
4. THE File_Parser SHALL produce an equivalent data structure when parsing a CSV file that was previously exported from the same data (round-trip property)

---

### Requirement 3: Excel Parsing

**User Story:** As a user, I want my Excel (.xlsx) file to be parsed correctly, so that I can use spreadsheet data to generate labels.

#### Acceptance Criteria

1. WHEN an `.xlsx` file is uploaded, THE File_Parser SHALL parse the first worksheet using the `xlsx` library, treating the first row as headers for `Left_Value` and `Right_Value`
2. WHEN an Excel file is parsed, THE File_Parser SHALL skip rows where both `Left_Value` and `Right_Value` are empty strings
3. IF an Excel file is missing the `Left_Value` or `Right_Value` header columns, THEN THE File_Parser SHALL display an error message identifying the missing column names
4. THE File_Parser SHALL produce an equivalent data structure when parsing an Excel file that was previously exported from the same data (round-trip property)

---

### Requirement 4: Data Preview Table

**User Story:** As a user, I want to preview the parsed data before printing, so that I can verify the correct rows were loaded.

#### Acceptance Criteria

1. WHEN a file is successfully parsed, THE App SHALL display a table showing all extracted rows with `Left_Value` and `Right_Value` columns
2. THE App SHALL display the total row count above or below the preview table
3. WHILE the Print_View is active, THE App SHALL hide the data preview table

---

### Requirement 5: Barcode Label Rendering

**User Story:** As a user, I want each data row rendered as a side-by-side barcode label pair, so that I can print scannable labels.

#### Acceptance Criteria

1. THE Label_Renderer SHALL render one Label_Pair per data row, with both the left and right labels displaying identical content derived from the same row's `Left_Value` and `Right_Value`
2. THE Label_Renderer SHALL render each label with three vertically stacked elements in order: a bold header text displaying `Left_Value` at the top, a Code 128 Barcode encoding `Right_Value` in the middle, and the `Right_Value` string in small text beneath the Barcode
3. THE Label_Renderer SHALL size each Label_Pair to a total width of 4 inches and a height of 1 inch at standard print resolution (96 DPI screen, 1 inch = 96px)
4. THE Label_Renderer SHALL render each individual label at 2 inches wide by 1 inch tall within the Label_Pair
5. THE Label_Renderer SHALL render Barcodes using SVG output for crisp, resolution-independent rendering at any print scale
6. THE Label_Renderer SHALL use the `react-barcode` library to generate Code 128 SVG barcodes

---

### Requirement 6: Print Functionality

**User Story:** As a user, I want to print only the barcode labels without any UI chrome, so that I get clean label sheets.

#### Acceptance Criteria

1. THE App SHALL provide a "Print" button that triggers the browser's native print dialog
2. WHEN the Print_View is active, THE App SHALL hide all UI elements except the Label_Renderer output using CSS `@media print` rules
3. WHEN the Print_View is active, THE App SHALL remove all page margins and padding so labels render flush to the printable area
4. THE Label_Renderer SHALL arrange Label_Pairs in a vertical stack, allowing the browser to paginate across multiple pages as needed
5. IF no data rows have been parsed, THEN THE App SHALL disable the "Print" button

---

### Requirement 7: Error and Empty States

**User Story:** As a user, I want clear feedback when something goes wrong or no data is loaded, so that I understand the app state.

#### Acceptance Criteria

1. WHEN no file has been uploaded, THE App SHALL display an instructional placeholder indicating the expected file format and column names (`Left_Value`, `Right_Value`)
2. IF a file parsing error occurs, THEN THE App SHALL display a descriptive error message and clear any previously rendered labels
3. WHEN a new file is uploaded, THE App SHALL clear all previously parsed data and rendered labels before processing the new file
