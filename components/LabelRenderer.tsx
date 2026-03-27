import React from 'react';
import type { LabelRow } from '@/lib/types';
import SingleLabel from './SingleLabel';

interface LabelRendererProps {
  rows: LabelRow[];
}

export default function LabelRenderer({ rows }: LabelRendererProps) {
  return (
    <div id="label-renderer">
      {rows.map((row, index) => (
        <div
          key={index}
          className="label-pair"
          style={{ display: 'flex', flexDirection: 'row', width: '4in', height: '1in' }}
        >
          <SingleLabel leftValue={row.Left_Value} rightValue={row.Right_Value} />
          <SingleLabel leftValue={row.Left_Value} rightValue={row.Right_Value} />
        </div>
      ))}
    </div>
  );
}
