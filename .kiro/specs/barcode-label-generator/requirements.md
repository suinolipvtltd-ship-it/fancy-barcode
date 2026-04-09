# Requirements Document

## Introduction

This feature is a Next.js (App Router) web application that allows users to upload Excel or CSV files containing product data and generate a dimensionally accurate PDF of barcode labels formatted for a 2-up (side-by-side) 1×2 inch label layout, optimized for Zebra thermal printers. The application uses react-pdf for PDF generation, jsbarcode for barcode rendering, and the xlsx library for file parsing. It is hosted on Netlify with a PostgreSQL database on Neon.

## Glossary

- **File_Uploader**: The drag-and-drop UI component that accepts .xlsx or .csv files from the user
- **File_Processor**: The module that parses uploaded Excel/CSV files into structured product data objects
- **Label_Canvas**: The component that renders a single barcode label with product name, barcode image, SKU, and MRP
- **PDF_Generator**: The module that uses react-pdf to compose labels into a 2-column grid PDF document with precise dimensions
- **ZPL_Generator**: The optional module that produces raw Zebra Programming Language code strings for direct thermal printer output
- **Product_Record**: A structured object containing Product Name, SKU, MRP, and Barcode Value extracted from a file row
- **Label_Layout**: The 2-up configuration where two 1×2 inch labels sit side-by-side on a 4.3-inch wide page
- **DPI**: Dots Per Inch — the resolution setting that ensures 1 inch in the PDF maps to 1 physical inch on the printer

## Requirements

### Requirement 1: File Upload

**User Story:** As a user, I want to upload Excel or CSV files via drag-and-drop, so that I can provide product data for label generation.

#### Acceptance Criteria

1. THE File_Uploader SHALL accept files with .xlsx and .csv extensions
2. WHEN a user drags and drops a valid file onto the File_Uploader, THE File_Uploader SHALL display the file name and a success indicator
3. WHEN a user drags and drops a file with an unsupported extension, THE File_Uploader SHALL display an error message stating the accepted file formats
4. THE File_Uploader SHALL also provide a click-to-browse fallback for file selection
5. WHEN no file has been uploaded, THE File_Uploader SHALL display instructional text indicating accepted file types

### Requirement 2: Excel/CSV Parsing

**User Story:** As a user, I want the application to read my spreadsheet columns automatically, so that I don't have to manually map data fields.

#### Acceptance Criteria

1. WHEN a valid file is uploaded, THE File_Processor SHALL parse the file and extract columns: Product Name, SKU, MRP, and Barcode Value
2. WHEN the uploaded file is missing one or more expected columns, THE File_Processor SHALL display an error message listing the missing columns
3. THE File_Processor SHALL produce an array of Product_Record objects from the parsed file data
4. WHEN a row contains an empty Barcode Value, THE File_Processor SHALL skip that row and display a warning indicating the skipped row number
5. WHEN the uploaded file contains zero valid rows after parsing, THE File_Processor SHALL display an error message stating that no valid product data was found

### Requirement 3: Label Content Configuration

**User Story:** As a user, I want to choose which fields appear on my labels, so that I can customize the label content for different use cases.

#### Acceptance Criteria

1. THE application SHALL provide a checkbox labeled "Include Product Name" that is checked by default
2. THE application SHALL provide a checkbox labeled "Include SKU" that is checked by default
3. WHEN the "Include Product Name" checkbox is unchecked, THE Label_Canvas SHALL omit the product name from the rendered label
4. WHEN the "Include SKU" checkbox is unchecked, THE Label_Canvas SHALL omit the SKU from the rendered label
5. THE Label_Canvas SHALL always display the barcode image and MRP on every label regardless of checkbox state

### Requirement 4: Single Label Rendering

**User Story:** As a user, I want each label to display a scannable barcode with product information, so that the labels are useful for inventory and retail purposes.

#### Acceptance Criteria

1. THE Label_Canvas SHALL render each label at exactly 2 inches wide by 1 inch high
2. WHEN "Include Product Name" is enabled, THE Label_Canvas SHALL display the product name at the top of the label
3. WHEN a product name exceeds the available label width, THE Label_Canvas SHALL truncate the product name with an ellipsis
4. THE Label_Canvas SHALL render the barcode image in the center of the label using jsbarcode
5. THE Label_Canvas SHALL display the SKU (when enabled) and MRP at the bottom of the label
6. THE Label_Canvas SHALL render barcodes at a resolution that produces crisp edges suitable for thermal scanner readability

### Requirement 5: PDF Generation with 2-Up Layout

**User Story:** As a user, I want to generate a PDF with two labels side-by-side per row, so that I can print on standard 2-up label stock for Zebra printers.

#### Acceptance Criteria

1. THE PDF_Generator SHALL produce a PDF with a total page width of 4.3 inches
2. THE PDF_Generator SHALL arrange labels in a 2-column grid with a 0.125-inch gap between columns
3. THE PDF_Generator SHALL set each label cell to exactly 2 inches wide by 1 inch high
4. WHEN the total number of labels is odd, THE PDF_Generator SHALL place the last label in the left column and leave the right column empty
5. THE PDF_Generator SHALL use react-pdf to ensure dimensional accuracy where 1 inch in the PDF equals 1 inch on the printed output
6. THE PDF_Generator SHALL set the page orientation to portrait, where the 1-inch label height follows the print direction
7. THE PDF_Generator SHALL not apply auto-scaling or fit-to-page transformations to the output

### Requirement 6: Print Guidance

**User Story:** As a user, I want to be reminded about correct browser print settings, so that my labels print at the correct physical dimensions.

#### Acceptance Criteria

1. WHEN the PDF is generated and ready for download, THE application SHALL display a reminder instructing the user to set browser print settings to Margins: None and Scale: 100%
2. THE application SHALL display the print reminder in a visible, non-dismissible banner near the download action

### Requirement 7: ZPL Code Generation (Optional)

**User Story:** As a user, I want the option to generate raw ZPL code, so that I can send label data directly to a Zebra printer without using a PDF.

#### Acceptance Criteria

1. WHERE the ZPL generation option is enabled, THE application SHALL provide a toggle to switch between PDF output and ZPL output
2. WHERE the ZPL generation option is enabled, THE ZPL_Generator SHALL produce ZPL code strings for each Product_Record
3. WHERE the ZPL generation option is enabled AND 203 DPI is selected, THE ZPL_Generator SHALL use ^PW832 for a 4-inch print width
4. WHERE the ZPL generation option is enabled AND 300 DPI is selected, THE ZPL_Generator SHALL use ^PW1248 for a 4-inch print width
5. WHERE the ZPL generation option is enabled, THE application SHALL provide a DPI selector with options for 203 DPI and 300 DPI

### Requirement 8: Error Handling

**User Story:** As a user, I want clear feedback when something goes wrong, so that I can correct issues and successfully generate labels.

#### Acceptance Criteria

1. IF the uploaded file cannot be parsed, THEN THE File_Processor SHALL display a descriptive error message indicating the parsing failure reason
2. IF a Barcode Value in a Product_Record is invalid or cannot be encoded, THEN THE Label_Canvas SHALL skip that label and display a warning listing the affected row
3. IF PDF generation fails, THEN THE PDF_Generator SHALL display an error message and allow the user to retry

### Requirement 9: Data Persistence

**User Story:** As a user, I want my upload history to be stored, so that I can reference previous label generation jobs.

#### Acceptance Criteria

1. WHEN a file is successfully parsed and labels are generated, THE application SHALL store the job metadata (file name, row count, timestamp) in the PostgreSQL database on Neon
2. THE application SHALL display a list of previous jobs on the main page
3. WHEN a user selects a previous job, THE application SHALL display the job metadata (file name, row count, timestamp)
