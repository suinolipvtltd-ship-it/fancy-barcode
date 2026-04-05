import { describe, it, expect, vi } from "vitest";
import React from "react";
import type { ProductRecord, LabelConfig } from "@/lib/types";
import { LABEL_WIDTH, LABEL_HEIGHT } from "@/lib/constants";

// Mock barcodeUtils to avoid canvas dependency in tests
vi.mock("@/lib/barcodeUtils", () => ({
  generateBarcodeDataUrl: vi.fn(
    () =>
      "data:image/png;base64,mockBarcodeData"
  ),
}));

// Mock @react-pdf/renderer with simple elements
vi.mock("@react-pdf/renderer", () => ({
  View: "View",
  Text: "Text",
  Image: "Image",
  StyleSheet: {
    create: (styles: any) => styles,
  },
}));

import { LabelCanvas } from "./LabelCanvas";

const baseRecord: ProductRecord = {
  productName: "Test Product Name",
  sku: "SKU-12345",
  mrp: "199.00",
  barcodeValue: "1234567890",
  rowNumber: 1,
};

const baseConfig: LabelConfig = {
  includeProductName: true,
  includeSku: true,
  outputMode: "pdf",
  dpi: 203,
};

function renderLabel(record: ProductRecord, config: LabelConfig): React.ReactElement {
  return LabelCanvas({
    record,
    config,
    widthPt: LABEL_WIDTH,
    heightPt: LABEL_HEIGHT,
  });
}

/** Recursively collect all string children from the element tree */
function collectStrings(node: any): string[] {
  const result: string[] = [];
  if (typeof node === "string") {
    result.push(node);
    return result;
  }
  if (!node || !node.props) return result;
  const { children } = node.props;
  if (children == null) return result;
  if (typeof children === "string") {
    result.push(children);
  } else if (Array.isArray(children)) {
    for (const child of children) {
      result.push(...collectStrings(child));
    }
  } else if (typeof children === "object") {
    result.push(...collectStrings(children));
  }
  return result;
}

/** Recursively find all elements matching a type */
function findByType(node: any, type: string): any[] {
  const found: any[] = [];
  if (!node || !node.props) return found;
  if (node.type === type) found.push(node);
  const { children } = node.props;
  if (children == null) return found;
  const childArray = Array.isArray(children) ? children : [children];
  for (const child of childArray) {
    if (typeof child === "object" && child !== null) {
      found.push(...findByType(child, type));
    }
  }
  return found;
}

describe("LabelCanvas", () => {
  it("renders product name when includeProductName is true", () => {
    const el = renderLabel(baseRecord, baseConfig);
    const strings = collectStrings(el);
    expect(strings).toContain("Test Product Name");
  });

  it("omits product name when includeProductName is false", () => {
    const config = { ...baseConfig, includeProductName: false };
    const el = renderLabel(baseRecord, config);
    const strings = collectStrings(el);
    expect(strings).not.toContain("Test Product Name");
  });

  it("renders SKU when includeSku is true", () => {
    const el = renderLabel(baseRecord, baseConfig);
    const strings = collectStrings(el);
    expect(strings).toContain("SKU-12345");
  });

  it("omits SKU when includeSku is false", () => {
    const config = { ...baseConfig, includeSku: false };
    const el = renderLabel(baseRecord, config);
    const strings = collectStrings(el);
    expect(strings).not.toContain("SKU-12345");
  });

  it("always renders MRP regardless of config", () => {
    const config: LabelConfig = {
      ...baseConfig,
      includeProductName: false,
      includeSku: false,
    };
    const el = renderLabel(baseRecord, config);
    const strings = collectStrings(el);
    expect(strings.some((s) => s.includes("199.00"))).toBe(true);
  });

  it("always renders barcode image", () => {
    const el = renderLabel(baseRecord, baseConfig);
    const images = findByType(el, "Image");
    expect(images.length).toBeGreaterThanOrEqual(1);
    expect(images[0].props.src).toContain("data:image/png");
  });

  it("renders container with correct dimensions", () => {
    const el = renderLabel(baseRecord, baseConfig) as any;
    const style = el.props.style;
    const flatStyle = Array.isArray(style)
      ? Object.assign({}, ...style)
      : style;
    expect(flatStyle.width).toBe(LABEL_WIDTH);
    expect(flatStyle.height).toBe(LABEL_HEIGHT);
  });

  it("calls generateBarcodeDataUrl with the record barcode value", async () => {
    const { generateBarcodeDataUrl } = await import("@/lib/barcodeUtils");
    renderLabel(baseRecord, baseConfig);
    expect(generateBarcodeDataUrl).toHaveBeenCalledWith("1234567890");
  });
});
