"use client";

import Link from "next/link";
import type { LabelConfig } from "@/lib/types";

export interface LabelConfigPanelProps {
  config: LabelConfig;
  onChange: (config: LabelConfig) => void;
  zplEnabled: boolean;
}

export default function LabelConfigPanel({
  config,
  onChange,
  zplEnabled,
}: LabelConfigPanelProps) {
  const visibleElements = config.layout
    ? config.layout.filter((el) => el.visible).map((el) => el.type)
    : [];

  return (
    <fieldset data-testid="label-config-panel" className="space-y-4">
      <legend className="text-sm font-semibold text-gray-700 mb-2">
        Label Configuration
      </legend>

      {/* Show current layout summary */}
      {config.layout && (
        <div className="rounded border border-blue-100 bg-blue-50 p-3">
          <p className="text-xs font-medium text-blue-700 mb-1">
            Label layout (top → bottom):
          </p>
          <p className="text-xs text-blue-600">
            {visibleElements.length > 0
              ? visibleElements
                  .map((t) => {
                    const names: Record<string, string> = {
                      productName: "Product Name",
                      barcode: "Barcode",
                      barcodeNumber: "Barcode Number",
                      sku: "SKU",
                      mrp: "MRP",
                      mrpSku: "MRP/SKU",
                    };
                    return names[t] ?? t;
                  })
                  .join(" → ")
              : "No elements visible"}
          </p>
          <Link
            href="/designer"
            className="mt-2 inline-block text-xs text-blue-600 underline hover:text-blue-800"
          >
            Edit in Label Designer →
          </Link>
        </div>
      )}

      {zplEnabled && (
        <>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-gray-700">
              Output Mode
            </legend>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <input
                  id="output-pdf"
                  type="radio"
                  name="outputMode"
                  value="pdf"
                  checked={config.outputMode === "pdf"}
                  onChange={() => onChange({ ...config, outputMode: "pdf" })}
                />
                <label htmlFor="output-pdf" className="text-sm text-gray-700">
                  PDF
                </label>
              </div>
              <div className="flex items-center gap-1">
                <input
                  id="output-zpl"
                  type="radio"
                  name="outputMode"
                  value="zpl"
                  checked={config.outputMode === "zpl"}
                  onChange={() => onChange({ ...config, outputMode: "zpl" })}
                />
                <label htmlFor="output-zpl" className="text-sm text-gray-700">
                  ZPL
                </label>
              </div>
            </div>
          </fieldset>

          {config.outputMode === "zpl" && (
            <div className="space-y-1">
              <label
                htmlFor="dpi-select"
                className="text-sm font-medium text-gray-700"
              >
                DPI
              </label>
              <select
                id="dpi-select"
                value={config.dpi}
                onChange={(e) =>
                  onChange({
                    ...config,
                    dpi: Number(e.target.value) as 203 | 300,
                  })
                }
                className="block w-full rounded border-gray-300 text-sm"
              >
                <option value={203}>203 DPI</option>
                <option value={300}>300 DPI</option>
              </select>
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}
