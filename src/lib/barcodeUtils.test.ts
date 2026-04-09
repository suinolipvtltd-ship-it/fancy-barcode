import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock canvas for jsdom environment (no native canvas support)
function createMockCanvas() {
  const mockCtx = {
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(0) })),
    putImageData: vi.fn(),
    createImageData: vi.fn(() => []),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    fillText: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    transform: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    textAlign: "start",
    textBaseline: "alphabetic",
    canvas: { width: 200, height: 100 },
  };

  return {
    getContext: vi.fn(() => mockCtx),
    toDataURL: vi.fn(() => "data:image/png;base64,mockdata"),
    width: 200,
    height: 100,
    style: {},
  };
}

let originalCreateElement: typeof document.createElement;

beforeEach(() => {
  originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "canvas") {
      return createMockCanvas() as unknown as HTMLElement;
    }
    return originalCreateElement(tag);
  });
});

describe("generateBarcodeDataUrl", () => {
  it("returns a data URL string for a valid barcode value", async () => {
    const { generateBarcodeDataUrl } = await import("@/lib/barcodeUtils");
    const result = generateBarcodeDataUrl("1234567890");
    expect(result).toMatch(/^data:image\/png/);
  });

  it("throws for an empty barcode value", async () => {
    const { generateBarcodeDataUrl } = await import("@/lib/barcodeUtils");
    expect(() => generateBarcodeDataUrl("")).toThrow();
  });
});

describe("validateBarcodeValue", () => {
  it("returns true for a valid barcode value", async () => {
    const { validateBarcodeValue } = await import("@/lib/barcodeUtils");
    expect(validateBarcodeValue("1234567890")).toBe(true);
  });

  it("returns false for an empty barcode value", async () => {
    const { validateBarcodeValue } = await import("@/lib/barcodeUtils");
    expect(validateBarcodeValue("")).toBe(false);
  });
});
