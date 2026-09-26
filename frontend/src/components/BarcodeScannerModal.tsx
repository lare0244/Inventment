import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, Platform, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useColors, useT } from "@/src/appsettings";
import { F, S, R, Palette } from "@/src/theme";
import { Btn } from "@/src/components/ui";

type Props = {
  visible: boolean;
  title: string;
  onScan: (data: string) => void;
  onClose: () => void;
};

/**
 * Cross-platform barcode capture.
 * - Native: live camera scanner (expo-camera), handles its own permission prompt.
 * - Web: live camera is unreliable in browsers, so we fall back to a manual
 *   barcode entry field that resolves to the same onScan(data) handler.
 */
export function BarcodeScannerModal({ visible, title, onScan, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const C = useColors();
  const t = useT();
  const styles = makeStyles(C);
  const [manual, setManual] = useState("");
  const [perm, requestPerm] = useCameraPermissions();
  const isWeb = Platform.OS === "web";

  if (!visible) return null;

  const submit = () => {
    const v = manual.trim();
    if (v) { setManual(""); onScan(v); }
  };

  if (isWeb) {
    return (
      <Modal visible transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.webBg}>
          <View style={styles.webCard}>
            <View style={styles.webHead}>
              <Text style={styles.webTitle}>{title}</Text>
              <Pressable testID="scanner-close" onPress={onClose} hitSlop={12}>
                <MaterialCommunityIcons name="close" size={24} color={C.onSurface} />
              </Pressable>
            </View>
            <Text style={styles.webHint}>{t("manualEntryHint")}</Text>
            <TextInput testID="scanner-manual" value={manual} onChangeText={setManual} autoFocus
              autoCapitalize="none" placeholder="0000000000000" placeholderTextColor={C.onSurfaceTertiary}
              style={styles.input} onSubmitEditing={submit} returnKeyType="search" />
            <Btn testID="scanner-manual-submit" title={t("lookupBtn")} icon="magnify" onPress={submit} />
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        {perm?.granted ? (
          <CameraView style={StyleSheet.absoluteFill} facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr", "upc_a", "upc_e", "ean13", "ean8", "code128", "code39"] }}
            onBarcodeScanned={({ data }) => onScan(data)} />
        ) : (
          <View style={styles.permWrap}>
            <MaterialCommunityIcons name="camera-off" size={56} color="#90A4AE" />
            <Text style={styles.permTxt}>{t("cameraNeeded")}</Text>
            <Btn testID="scanner-grant" title={t("grantCamera")} icon="camera" onPress={requestPerm} style={{ marginTop: S.lg }} />
          </View>
        )}
        <View style={[styles.scanTop, { paddingTop: insets.top + S.md }]}>
          <Text style={styles.scanTitle}>{title}</Text>
          <Pressable testID="scanner-close" onPress={onClose} hitSlop={12} style={styles.scanClose}>
            <MaterialCommunityIcons name="close" size={26} color="#fff" />
          </Pressable>
        </View>
        {perm?.granted && <View style={styles.scanFrameWrap}><View style={styles.scanFrame} /></View>}
      </View>
    </Modal>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  webBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: S.xl },
  webCard: { backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, padding: S.lg, alignSelf: "center", width: "100%", maxWidth: 480 },
  webHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: S.sm },
  webTitle: { color: C.onSurface, fontFamily: F.display, fontSize: 20 },
  webHint: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 13, marginBottom: S.md },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, height: 50, color: C.onSurface, fontFamily: F.text, fontSize: 15, marginBottom: S.md },
  permWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: S.xl },
  permTxt: { color: "#ECEFF1", fontFamily: F.text, fontSize: 15, textAlign: "center", marginTop: S.md },
  scanTop: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: S.lg, paddingBottom: S.md },
  scanTitle: { color: "#F5F5F5", fontFamily: F.display, fontSize: 20, letterSpacing: 1 },
  scanClose: { padding: S.xs },
  scanFrameWrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  scanFrame: { width: 260, height: 160, borderWidth: 3, borderColor: C.brand, borderRadius: R.md, backgroundColor: "transparent" },
});
