import { describe, it, expect } from "vitest";
import {
  extractSkuFromScan,
  isValidSku,
  normalizeSku,
  parseQty,
} from "@/lib/inventory";

describe("normalizeSku", () => {
  it("trims and uppercases", () => {
    expect(normalizeSku("  drs-1024\n")).toBe("DRS-1024");
  });
});

describe("extractSkuFromScan", () => {
  it("reads the SKU from a product URL", () => {
    expect(extractSkuFromScan("https://shop.example.com/p/drs-1024?size=M")).toEqual({
      sku: "DRS-1024",
      fromUrl: true,
    });
  });

  it("reads a sku query parameter", () => {
    expect(extractSkuFromScan("https://shop.example.com/scan?sku=TSH-BLK-001")).toEqual({
      sku: "TSH-BLK-001",
      fromUrl: true,
    });
  });

  it("reads a bare path segment", () => {
    expect(extractSkuFromScan("https://shop.example.com/products/JNS-BLU-042")).toEqual({
      sku: "JNS-BLU-042",
      fromUrl: true,
    });
  });

  it("reads JSON payloads", () => {
    expect(extractSkuFromScan('{"sku":"SHO-RED-118"}')).toEqual({
      sku: "SHO-RED-118",
      fromUrl: false,
    });
  });

  it("accepts a raw SKU or barcode value", () => {
    expect(extractSkuFromScan("8901234560012")).toEqual({
      sku: "8901234560012",
      fromUrl: false,
    });
  });

  it("returns null for unusable payloads", () => {
    expect(extractSkuFromScan("")).toBeNull();
    expect(extractSkuFromScan("   ")).toBeNull();
    expect(extractSkuFromScan("hello world!")).toBeNull();
  });
});

describe("isValidSku", () => {
  it("rejects values with spaces or symbols", () => {
    expect(isValidSku("DRS 1024")).toBe(false);
    expect(isValidSku("-DRS")).toBe(false);
    expect(isValidSku("DRS_1024.v2")).toBe(true);
  });
});

describe("parseQty", () => {
  it("defaults to 1 and clamps nonsense", () => {
    expect(parseQty(undefined)).toBe(1);
    expect(parseQty("0")).toBe(1);
    expect(parseQty("-4")).toBe(1);
    expect(parseQty("12")).toBe(12);
    expect(parseQty(3.9)).toBe(3);
  });
});
