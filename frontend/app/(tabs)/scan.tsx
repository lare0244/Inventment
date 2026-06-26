import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api";
import { C, F, S, R } from "@/src/theme";
import { Btn } from "@/src/components/ui";

export default function Scan() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => {
    setScanning(true); setResult(null);
    return () => setScanning(false);
  }, []));

  async function onScan({ data }: { data: string }) {
    if (!scanning || busy) return;
    setScanning(false);
    setBusy(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      // existing product?
      try {
        const existing = await api(`/products/by-barcode/${data}`);
        setResult({ type: "existing", barcode: data, product: existing });
      } catch {
        const lookup = await api(`/barcode-lookup/${data}`);
        setResult({ type: "new", barcode: data, lookup });
      }
    } finally {
      setBusy(false);
    }
  }

  if (!permission) return <View style={{ flex: 1, backgroundColor: C.surface }} />;

  if (!permission.granted) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <MaterialCommunityIcons name="camera-off" size={56} color={C.surfaceTertiary} />
        <Text style={styles.permTxt}>Camera access needed to scan barcodes</Text>
        <Btn testID="grant-camera" title="Grant Camera Access" onPress={requestPermission} icon="camera" style={{ marginTop: S.lg }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr", "upc_a", "upc_e", "ean13", "ean8", "code128", "code39"] }}
        onBarcodeScanned={scanning ? onScan : undefined}
      />
      <View style={[styles.overlay]}>
        <View style={[styles.topBar, { paddingTop: insets.top + S.sm }]}>
          <Text style={styles.scanTitle}>SCAN BARCODE</Text>
          <Text style={styles.scanHint}>Align the code within the frame</Text>
        </View>
        <View style={styles.frame} />
        <View style={{ flex: 1 }} />
      </View>

      {result && (
        <View testID="scan-result-sheet" style={[styles.sheet, { paddingBottom: insets.bottom + S.lg }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.barcodeTxt}>Barcode: {result.barcode}</Text>
          {result.type === "existing" ? (
            <>
              <Text style={styles.sheetTitle}>{result.product.name}</Text>
              <Text style={styles.sheetSub}>In stock: {result.product.quantity}</Text>
              <Btn testID="receive-stock-btn" title="Receive / Update Stock" icon="arrow-down-bold-circle"
                onPress={() => { router.push(`/product/${result.product.id}`); setResult(null); setScanning(true); }} />
              <Pressable testID="scan-again" onPress={() => { setResult(null); setScanning(true); }} style={styles.again}>
                <Text style={styles.againTxt}>Scan again</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.sheetTitle}>{result.lookup?.found ? result.lookup.name : "New product"}</Text>
              <Text style={styles.sheetSub}>{result.lookup?.found ? "Found in database — review & save" : "Not in database — add manually"}</Text>
              <Btn testID="add-scanned-btn" title="Add This Product" icon="plus"
                onPress={() => {
                  router.push({ pathname: "/product/new", params: {
                    barcode: result.barcode,
                    name: result.lookup?.name || "",
                    brand: result.lookup?.brand || "",
                    image: result.lookup?.image || "",
                  }});
                  setResult(null); setScanning(true);
                }} />
              <Pressable testID="scan-again-2" onPress={() => { setResult(null); setScanning(true); }} style={styles.again}>
                <Text style={styles.againTxt}>Scan again</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", padding: S.xl },
  permTxt: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 15, textAlign: "center", marginTop: S.md },
  overlay: { flex: 1, backgroundColor: "rgba(18,18,18,0.45)", alignItems: "center" },
  topBar: { alignItems: "center", paddingBottom: S.xl },
  scanTitle: { color: "#F5F5F5", fontFamily: F.display, fontSize: 22, letterSpacing: 1 },
  scanHint: { color: "#B0BEC5", fontFamily: F.text, fontSize: 13, marginTop: 2 },
  frame: { width: 260, height: 160, borderWidth: 3, borderColor: C.brand, borderRadius: R.md, backgroundColor: "transparent", marginTop: 40 },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: C.surfaceSecondary, borderTopWidth: 1, borderColor: C.border, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, padding: S.lg, gap: S.sm },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.surfaceTertiary, alignSelf: "center", marginBottom: S.sm },
  barcodeTxt: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12 },
  sheetTitle: { color: C.onSurface, fontFamily: F.display, fontSize: 22 },
  sheetSub: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 14, marginBottom: S.sm },
  again: { alignItems: "center", paddingVertical: S.md },
  againTxt: { color: C.brand, fontFamily: F.textBold },
});
