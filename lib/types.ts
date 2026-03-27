/** One row of parsed input data */
export interface LabelRow {
  Left_Value: string;
  Right_Value: string;
}

/** Result returned by all parser functions */
export type ParseResult =
  | { ok: true; rows: LabelRow[] }
  | { ok: false; error: string };
