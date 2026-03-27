import * as XLSX from 'xlsx';
import { validateColumns } from './validateColumns';
import type { LabelRow, ParseResult } from './types';

export async function parseExcel(file: File): Promise<ParseResult> {
  try {
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
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to parse Excel file' };
  }
}
