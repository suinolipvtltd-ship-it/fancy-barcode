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
