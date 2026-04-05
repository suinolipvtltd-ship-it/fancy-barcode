import { View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { ProductRecord, LabelConfig } from "@/lib/types";
import { generateBarcodeDataUrl } from "@/lib/barcodeUtils";

export interface LabelCanvasProps {
  record: ProductRecord;
  config: LabelConfig;
  widthPt: number; // 144 (2 inches × 72 pt/inch)
  heightPt: number; // 72  (1 inch × 72 pt/inch)
  barcodeDataUrl?: string; // Pre-generated barcode image data URL
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
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  sku: {
    fontSize: 5,
    textAlign: "left",
  },
  mrp: {
    fontSize: 6,
    fontWeight: "bold",
    textAlign: "right",
  },
  mrpCentered: {
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
  const barcodeDataUrl = preGeneratedUrl ?? generateBarcodeDataUrl(record.barcodeValue);

  const showName = config.includeProductName;
  const showSku = config.includeSku;

  // Calculate barcode image height based on what else is shown
  let barcodeHeight = heightPt - 4; // padding
  if (showName) barcodeHeight -= 10;
  barcodeHeight -= 10; // bottom row (MRP always shown)

  return (
    <View
      style={[
        styles.container,
        { width: widthPt, height: heightPt },
      ]}
    >
      {showName && (
        <Text style={styles.productName}>{record.productName}</Text>
      )}

      <Image
        src={barcodeDataUrl}
        style={[
          styles.barcodeImage,
          {
            width: widthPt - 8,
            height: Math.max(barcodeHeight, 20),
          },
        ]}
      />

      <View style={styles.bottomRow}>
        {showSku && <Text style={styles.sku}>{record.sku}</Text>}
        <Text style={showSku ? styles.mrp : styles.mrpCentered}>
          ₹{record.mrp}
        </Text>
      </View>
    </View>
  );
}
