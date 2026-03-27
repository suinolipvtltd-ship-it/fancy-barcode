const REQUIRED = ['Left_Value', 'Right_Value'] as const;

export function validateColumns(fields: string[]): string | null {
  const missing = REQUIRED.filter(col => !fields.includes(col));
  if (missing.length === 0) return null;
  return `Missing required column(s): ${missing.join(', ')}`;
}
