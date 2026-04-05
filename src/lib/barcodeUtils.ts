import JsBarcode from "jsbarcode";

/**
 * Checks whether a barcode value can be encoded by jsbarcode (CODE128).
 * Returns true if the value is encodable, false otherwise.
 */
export function validateBarcodeValue(value: string): boolean {
  try {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, value, {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      width: 1.5,
      height: 40,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Generates a barcode as a PNG data URL using jsbarcode and an offscreen canvas.
 *
 * @param value - The string to encode as a barcode
 * @returns A data URL string (image/png) of the rendered barcode
 * @throws If the barcode value cannot be encoded
 */
export function generateBarcodeDataUrl(value: string): string {
  const canvas = document.createElement("canvas");

  JsBarcode(canvas, value, {
    format: "CODE128",
    displayValue: false,
    margin: 0,
    width: 1.5,
    height: 40,
  });

  return canvas.toDataURL("image/png");
}
