import { View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { ProductRecord, LabelConfig, LabelElement } from "@/lib/types";
import { generateBarcodeDataUrl } from "@/lib/barcodeUtils";

export interface LabelCanvasProps {
  record: ProductRecord;
  config: LabelConfig;
  widthPt: number;
  heightPt: number;
  barcodeDataUrl?: string;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "column",
    justifyContent: "space-between",
    alignItems: "center",
    overflow: "hidden",
    padding: 2,
  },
  productName: {
    fontSize: 6,
    textAlign: "center",
    maxLines: 1,
    textOverflow: "ellipsis",
    width: "100%",
  },
  barcodeImage: {
    objectFit: "contain",
  },
  barcodeNumber: {
    fontSize: 5,
    textAlign: "center",
    width: "100%",
  },
  sku: {
    fontSize: 5,
    textAlign: "center",
    width: "100%",
  },
  mrp: {
    fontSize: 6,
    fontWeight: "bold",
    textAlign: "center",
    width: "100%",
  },
});

export function LabelCanvas({
  record,
  config,
  widthPt,
  heightPt,
  barcodeDataUrl: preGeneratedUrl,
}: LabelCanvasProps) {
  const barcodeDataUrl =
    preGeneratedUrl ?? generateBarcodeDataUrl(record.barcodeValue);

  // Use layout ordering if available, otherwise fall back to legacy behavior
  const visibleElements = config.layout
    ? config.layout.filter((el) => el.visible)
    : buildLegacyLayout(config);

  // Count non-barcode text rows to calculate barcode height
  const textRows = visibleElements.filter((el) => el.type !== "barcode").length;
  const barcodeHeight = Math.max(heightPt - 4 - textRows * 10, 20);

  return (
    <View style={[styles.container, { width: widthPt, height: heightPt }]}>
      {visibleElements.map((el, i) => renderElement(el, i, record, barcodeDataUrl, widthPt, barcodeHeight))}
    </View>
  );
}

function renderElement(
  el: LabelElement,
  key: number,
  record: ProductRecord,
  barcodeDataUrl: string,
  widthPt: number,
  barcodeHeight: number,
) {
  switch (el.type) {
    case "productName":
      return (
        <Text key={key} style={styles.productName}>
          {record.productName}
        </Text>
      );
    case "barcode":
      return (
        <Image
          key={key}
          src={barcodeDataUrl}
          style={[
            styles.barcodeImage,
            { width: widthPt - 8, height: barcodeHeight },
          ]}
        />
      );
    case "barcodeNumber":
      return (
        <Text key={key} style={styles.barcodeNumber}>
          {record.barcodeValue}
        </Text>
      );
    case "sku":
      return (
        <Text key={key} style={styles.sku}>
          {record.sku}
        </Text>
      );
    case "mrp":
      return (
        <Text key={key} style={styles.mrp}>
          Rs.{record.mrp}
        </Text>
      );
    default:
      return null;
  }
}

/** Backward-compatible layout from boolean flags */
function buildLegacyLayout(config: LabelConfig): LabelElement[] {
  const elements: LabelElement[] = [];
  if (config.includeProductName)
    elements.push({ type: "productName", visible: true });
  elements.push({ type: "barcode", visible: true });
  elements.push({ type: "barcodeNumber", visible: true });
  if (config.includeSku) elements.push({ type: "sku", visible: true });
  elements.push({ type: "mrp", visible: true });
  return elements;
}
