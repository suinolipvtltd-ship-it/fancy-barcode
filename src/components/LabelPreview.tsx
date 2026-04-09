"use client";

import type { LabelElement } from "@/lib/types";

interface LabelPreviewProps {
  layout: LabelElement[];
  widthPx: number;
  heightPx: number;
  showMrp?: boolean;
}

/** HTML-based live preview of the label layout (not react-pdf). */
export default function LabelPreview({
  layout,
  widthPx,
  heightPx,
  showMrp = true,
}: LabelPreviewProps) {
  const visible = layout.filter((el) => el.visible);

  return (
    <div
      className="relative flex flex-col items-center justify-center overflow-hidden border border-gray-400 bg-white"
      style={{ width: widthPx, height: heightPx, padding: 4 }}
    >
      {visible.length === 0 && (
        <span className="text-[10px] text-gray-300">No elements</span>
      )}
      {visible.map((el) => {
        switch (el.type) {
          case "mrpSku":
            return (
              <span
                key={el.type}
                className="w-full truncate text-center text-[13px] font-bold leading-tight text-gray-900"
              >
                {showMrp ? "MRP 1199.00/ASF1010AG-4" : "ASF1010AG-4"}
              </span>
            );
          case "productName":
            return (
              <span
                key={el.type}
                className="w-full truncate text-center text-[11px] font-bold leading-tight text-gray-800"
              >
                Sample Product Name
              </span>
            );
          case "barcode":
            return (
              <div
                key={el.type}
                className="flex flex-1 items-center justify-center"
              >
                <div className="flex gap-px">
                  {Array.from({ length: 30 }).map((_, i) => (
                    <div
                      key={i}
                      className="bg-gray-900"
                      style={{
                        width: i % 3 === 0 ? 3 : 1.5,
                        height: 40,
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          case "barcodeNumber":
            return (
              <span
                key={el.type}
                className="text-[12px] font-bold text-gray-900"
              >
                47712174
              </span>
            );
          case "sku":
            return (
              <span
                key={el.type}
                className="text-[10px] font-bold text-gray-700"
              >
                SKU-12345
              </span>
            );
          case "mrp":
            return (
              <span
                key={el.type}
                className="text-[12px] font-bold text-gray-900"
              >
                MRP 299.00
              </span>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
