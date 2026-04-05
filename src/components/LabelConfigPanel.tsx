"use client";

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
  return (
    <fieldset data-testid="label-config-panel" className="space-y-4">
      <legend className="text-sm font-semibold text-gray-700 mb-2">
        Label Configuration
      </legend>

      <div className="flex items-center gap-2">
        <input
          id="include-product-name"
          type="checkbox"
          checked={config.includeProductName}
          onChange={(e) =>
            onChange({ ...config, includeProductName: e.target.checked })
          }
          className="h-4 w-4 rounded border-gray-300"
        />
        <label htmlFor="include-product-name" className="text-sm text-gray-700">
          Include Product Name
        </label>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="include-sku"
          type="checkbox"
          checked={config.includeSku}
          onChange={(e) =>
            onChange({ ...config, includeSku: e.target.checked })
          }
          className="h-4 w-4 rounded border-gray-300"
        />
        <label htmlFor="include-sku" className="text-sm text-gray-700">
          Include SKU
        </label>
      </div>

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
                  onChange={() =>
                    onChange({ ...config, outputMode: "pdf" })
                  }
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
                  onChange={() =>
                    onChange({ ...config, outputMode: "zpl" })
                  }
                />
                <label htmlFor="output-zpl" className="text-sm text-gray-700">
                  ZPL
                </label>
              </div>
            </div>
          </fieldset>

          {config.outputMode === "zpl" && (
            <div className="space-y-1">
              <label htmlFor="dpi-select" className="text-sm font-medium text-gray-700">
                DPI
              </label>
              <select
                id="dpi-select"
                value={config.dpi}
                onChange={(e) =>
                  onChange({ ...config, dpi: Number(e.target.value) as 203 | 300 })
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
