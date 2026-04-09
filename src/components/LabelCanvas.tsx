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
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    padding: 2,
  },
  mrpSku: {
    fontSize: 8,
    fontWeight: "bold",
    textAlign: "center",
    width: "100%",
    marginBottom: 2,
  },
  productName: {
    fontSize: 7,
    fontWeight: "bold",
    textAlign: "center",
    maxLines: 1,
    textOverflow: "ellipsis",
    width: "100%",
    marginBottom: 1,
  },
  barcodeImage: {
    objectFit: "contain",
  },
  barcodeNumber: {
    fontSize: 7,
    fontWeight: "bold",
    textAlign: "center",
    width: "100%",
    marginTop: 2,
  },
  sku: {
    fontSize: 6,
    fontWeight: "bold",
    textAlign: "center",
    width: "100%",
  },
  mrp: {
    fontSize: 7,
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

  const visibleElements = config.layout
    ? config.layout.filter((el) => el.visible)
    : buildLegacyLayout(config);

  // Calculate barcode height from remaining space after text rows
  const textRows = visibleElements.filter((el) => el.type !== "barcode").length;
  const barcodeHeight = Math.max(heightPt - 4 - textRows * 12, 20);

  return (
    <View style={[styles.container, { width: widthPt, height: heightPt }]}>
      {visibleElements.map((el, i) =>
        renderElement(el, i, record, config, barcodeDataUrl, widthPt, barcodeHeight),
      )}
    </View>
  );
}

function renderElement(
  el: LabelElement,
  key: number,
  record: ProductRecord,
  config: LabelConfig,
  barcodeDataUrl: string,
  widthPt: number,
  barcodeHeight: number,
) {
  switch (el.type) {
    case "mrpSku": {
      const showMrp = config.showMrp !== false;
      const text = showMrp
        ? `MRP ${record.mrp}/${record.sku}`
        : record.sku;
      return (
        <Text key={key} style={styles.mrpSku}>
          {text}
        </Text>
      );
    }
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
          MRP {record.mrp}
        </Text>
      );
    default:
      return null;
  }
}

/** Backward-compatible layout from boolean flags */
function buildLegacyLayout(config: LabelConfig): LabelElement[] {
  const elements: LabelElement[] = [];
  elements.push({ type: "mrpSku", visible: true });
  elements.push({ type: "barcode", visible: true });
  elements.push({ type: "barcodeNumber", visible: true });
  return elements;
}
