"use client";

import { useState, useCallback } from "react";
import type { LabelElement, LabelElementType } from "@/lib/types";
import { DEFAULT_LAYOUT, LABEL_WIDTH, LABEL_HEIGHT } from "@/lib/constants";
import LabelPreview from "@/components/LabelPreview";

const ELEMENT_LABELS: Record<LabelElementType, string> = {
  productName: "Product Name",
  barcode: "Barcode",
  barcodeNumber: "Barcode Number",
  sku: "SKU",
  mrp: "MRP (Price)",
  mrpSku: "MRP / SKU (combined)",
};

export default function DesignerPage() {
  const [layout, setLayout] = useState<LabelElement[]>(
    () => JSON.parse(JSON.stringify(DEFAULT_LAYOUT)),
  );
  const [showMrp, setShowMrp] = useState(true);
  const [saved, setSaved] = useState(false);

  const moveUp = useCallback((index: number) => {
    if (index === 0) return;
    setLayout((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
    setSaved(false);
  }, []);

  const moveDown = useCallback((index: number) => {
    setLayout((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
    setSaved(false);
  }, []);

  const toggleVisibility = useCallback((index: number) => {
    setLayout((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], visible: !next[index].visible };
      return next;
    });
    setSaved(false);
  }, []);

  const handleSave = useCallback(() => {
    localStorage.setItem("labelLayout", JSON.stringify(layout));
    localStorage.setItem("labelShowMrp", JSON.stringify(showMrp));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [layout, showMrp]);

  const handleReset = useCallback(() => {
    const fresh = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
    setLayout(fresh);
    setShowMrp(true);
    localStorage.removeItem("labelLayout");
    localStorage.removeItem("labelShowMrp");
    setSaved(false);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">
          Label Designer
        </h1>
        <p className="mb-8 text-sm text-gray-500">
          Choose which elements appear on your barcode label and arrange their
          order from top to bottom.
        </p>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Element list */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-gray-700">
              Elements
            </h2>
            <div className="space-y-2">
              {layout.map((el, i) => (
                <div
                  key={el.type}
                  className={`flex items-center gap-3 rounded border p-3 ${
                    el.visible
                      ? "border-blue-200 bg-white"
                      : "border-gray-200 bg-gray-50 opacity-60"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={el.visible}
                    onChange={() => toggleVisibility(i)}
                    className="h-4 w-4 rounded border-gray-300"
                    aria-label={`Toggle ${ELEMENT_LABELS[el.type]}`}
                  />
                  <span className="flex-1 text-sm font-medium text-gray-800">
                    {ELEMENT_LABELS[el.type]}
                  </span>
                  <button
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                    aria-label={`Move ${ELEMENT_LABELS[el.type]} up`}
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveDown(i)}
                    disabled={i === layout.length - 1}
                    className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                    aria-label={`Move ${ELEMENT_LABELS[el.type]} down`}
                  >
                    ▼
                  </button>
                </div>
              ))}
            </div>

            {/* Show MRP toggle */}
            <div className="mt-4 flex items-center gap-2 rounded border border-gray-200 bg-white p-3">
              <input
                id="show-mrp"
                type="checkbox"
                checked={showMrp}
                onChange={(e) => {
                  setShowMrp(e.target.checked);
                  setSaved(false);
                }}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="show-mrp" className="text-sm font-medium text-gray-800">
                Show MRP price on label
              </label>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={handleSave}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                {saved ? "Saved ✓" : "Save Layout"}
              </button>
              <button
                onClick={handleReset}
                className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Reset to Default
              </button>
            </div>
          </div>

          {/* Live preview */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-gray-700">
              Preview
            </h2>
            <div className="flex items-start justify-center rounded border border-dashed border-gray-300 bg-white p-6">
              <LabelPreview
                layout={layout}
                widthPx={LABEL_WIDTH * 2}
                heightPx={LABEL_HEIGHT * 2}
                showMrp={showMrp}
              />
            </div>
            <p className="mt-2 text-center text-xs text-gray-400">
              {LABEL_WIDTH / 72}″ × {LABEL_HEIGHT / 72}″ label (scaled 2×)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
