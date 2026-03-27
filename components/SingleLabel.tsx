import React from 'react';
import Barcode from 'react-barcode';

interface SingleLabelProps {
  leftValue: string;
  rightValue: string;
}

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
  border: '1px solid #ccc',
};

export default function SingleLabel({ leftValue, rightValue }: SingleLabelProps) {
  return (
    <div style={labelStyle}>
      <p style={{ fontWeight: 'bold', margin: 0, fontSize: '0.7rem', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
        {leftValue}
      </p>
      <Barcode
        value={rightValue || ' '}
        format="CODE128"
        renderer="svg"
        width={1.2}
        height={40}
        displayValue={false}
        margin={0}
      />
      <p style={{ fontSize: '0.6rem', margin: 0, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
        {rightValue}
      </p>
    </div>
  );
}
