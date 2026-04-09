"use client";

import type { LabelElement } from "@/lib/types";

interface LabelPreviewProps {
  layout: LabelElement[];
  widthPx: number;
  heightPx: number;
}

/** HTML-based live preview of the label layout (not react-pdf). */
export default function LabelPreview({
  layout,
  widthPx,
  heightPx,
}: LabelPreviewProps) {
  const visible = layout.filter((el) => el.visible);

  return (
    <div
      className="relative flex flex-col items-center justify-between overflow-hidden border border-gray-400 bg-white"
      style={{ width: widthPx, height: heightPx, padding: 4 }}
    >
      {visible.length === 0 && (
        <span className="text-[10px] text-gray-300">No elements</span>
      )}
      {visible.map((el) => {
        switch (el.type) {
          case "productName":
            return (
              <span
                key={el.type}
                className="w-full truncate text-center text-[11px] leading-tight text-gray-800"
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
                className="text-[9px] text-gray-600"
              >
                1234567890
              </span>
            );
          case "sku":
            return (
              <span
                key={el.type}
                className="text-[9px] text-gray-500"
              >
                SKU-12345
              </span>
            );
          case "mrp":
            return (
              <span
                key={el.type}
                className="text-[11px] font-bold text-gray-900"
              >
                Rs.299
              </span>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
