import React, { useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Platform, Modal, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useColors, useT } from "@/src/appsettings";
import { F, S, R, Palette } from "@/src/theme";
import { Card, Btn } from "@/src/components/ui";
import { SalesOrderEditor, SOValue } from "@/src/components/SalesOrderEditor";
import { LOGO_DATA_URI } from "@/src/logoBase64";

const STATUSES = ["saved", "picked", "shipped", "returned"] as const;
const ALLOWED: Record<string, string[]> = { saved: ["picked", "shipped"], picked: ["shipped"], shipped: ["returned"], returned: [] };
const ICONS: Record<string, any> = { saved: "content-save-outline", picked: "package-variant-closed", shipped: "truck-fast-outline", returned: "keyboard-return" };

export default function SalesOrderDetail() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const C = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [order, setOrder] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [value, setValue] = useState<SOValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [returnModal, setReturnModal] = useState(false);
  const [returnWh, setReturnWh] = useState<string | null>(null);
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [scanOpen, setScanOpen] = useState(false);
  const [pickItem, setPickItem] = useState<{ idx: number; name: string; demanded: number } | null>(null);
  const [pickQty, setPickQty] = useState("");

  const load = useCallback(async () => {
    try {
      const [o, p, w] = await Promise.all([api<any>(`/sales-orders/${id}`), api<any[]>("/products"), api<any[]>("/warehouses")]);
      setOrder(o); setProducts(p); setWarehouses(w);
      setValue({ field1: o.field1 || "", field2: o.field2 || "", comment: o.comment || "", shipping_ref: o.shipping_ref || "",
        order_date: o.order_date || "", warehouse_id: o.warehouse_id || null,
        items: (o.items || []).map((i: any) => ({ product_id: i.product_id, name: i.name, quantity: i.quantity, picked: typeof i.picked === "number" ? i.picked : 0 })) });
    } catch {} finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const statusLabel: Record<string, string> = { saved: t("stSaved"), picked: t("stPicked"), shipped: t("stShipped"), returned: t("stReturned") };
  const editable = order && (order.status === "saved" || order.status === "picked");

  async function saveEdits() {
    if (!value) return; setSaving(true);
    try {
      await api(`/sales-orders/${id}`, { method: "PUT", body: { ...value, items: value.items.map((i) => ({ product_id: i.product_id, name: i.name, quantity: i.quantity, picked: i.picked || 0 })) } });
      await load();
    } catch {} finally { setSaving(false); }
  }

  async function openScanner() {
    if (!camPerm?.granted) { const r = await requestCamPerm(); if (!r.granted) return; }
    setScanOpen(true);
  }

  function onScan({ data }: { data: string }) {
    if (!value || !scanOpen) return;
    setScanOpen(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const prod = products.find((p) => p.barcode && String(p.barcode) === String(data));
    const idx = prod ? value.items.findIndex((it) => it.product_id === prod.id) : -1;
    if (idx < 0) {
      const msg = t("notInOrder");
      if (Platform.OS === "web" && typeof window !== "undefined") window.alert(msg); else Alert.alert(msg, "");
      return;
    }
    const it = value.items[idx];
    setPickItem({ idx, name: it.name, demanded: it.quantity });
    setPickQty(String(it.picked || it.quantity));
  }

  async function savePick() {
    if (!value || !pickItem) return;
    const n = Math.max(0, parseInt(pickQty, 10) || 0);
    const items = value.items.map((it, i) => (i === pickItem.idx ? { ...it, picked: n } : it));
    setSaving(true);
    try {
      await api(`/sales-orders/${id}`, { method: "PUT", body: { ...value, items: items.map((i) => ({ product_id: i.product_id, name: i.name, quantity: i.quantity, picked: i.picked || 0 })) } });
      setPickItem(null); await load();
    } catch {} finally { setSaving(false); }
  }

  function changeStatus(target: string) {
    if (target === "returned") { setReturnWh(order?.warehouse_id || warehouses[0]?.id || null); setReturnModal(true); return; }
    const confirmMsg = target === "picked" ? t("confirmPicked") : target === "shipped" ? t("confirmShipped") : t("confirmReturned");
    const run = async () => {
      try { await api(`/sales-orders/${id}/status`, { method: "POST", body: { status: target } }); await load(); } catch {}
    };
    if (Platform.OS === "web" && typeof window !== "undefined") { if (window.confirm(confirmMsg)) run(); return; }
    Alert.alert(t("confirmStatusTitle"), confirmMsg, [{ text: t("cancel"), style: "cancel" }, { text: statusLabel[target], onPress: run }]);
  }

  function doDelete() {
    const run = async () => { try { await api(`/sales-orders/${id}`, { method: "DELETE" }); router.back(); } catch {} };
    const msg = `${t("deleteOrder")} ${order?.order_number}?`;
    if (Platform.OS === "web" && typeof window !== "undefined") { if (window.confirm(msg)) run(); return; }
    Alert.alert(t("deleteOrder"), msg, [{ text: t("cancel"), style: "cancel" }, { text: t("deleteOrder"), style: "destructive", onPress: run }]);
  }

  const curIdx = order ? STATUSES.indexOf(order.status) : 0;

  async function confirmReturn() {
    try { await api(`/sales-orders/${id}/status`, { method: "POST", body: { status: "returned", warehouse_id: returnWh } }); setReturnModal(false); await load(); } catch {}
  }

  async function buildSoPdf(kind: "pick" | "pack") {
    if (!order) return;
    const whName = (warehouses.find((w) => w.id === order.warehouse_id) || {}).name || "-";
    const pmap: Record<string, any> = Object.fromEntries(products.map((p) => [p.id, p]));
    const label1 = user?.so_field1_label || "Field 1";
    const label2 = user?.so_field2_label || "Field 2";
    const rows = (order.items || []).map((it: any, idx: number) => {
      const p = pmap[it.product_id] || {};
      const ref = p.sku || p.barcode || "-";
      const checkCol = kind === "pick" ? `<td style="width:40px;text-align:center;font-size:18px">&#9744;</td>` : "";
      return `<tr><td>${idx + 1}</td><td>${it.name}</td><td>${ref}</td><td style="text-align:right">${it.quantity}</td>${checkCol}</tr>`;
    }).join("");
    const title = kind === "pick" ? t("pickingList") : t("packingSlip");
    const comp: any = user?.company || {};
    const compBlock = comp.company_name ? `<div style="font-size:16px;font-weight:700">${comp.company_name}</div><div class="sub">${[comp.street1, comp.street2, comp.postcode, comp.city, comp.state, comp.county].filter(Boolean).join(", ")}</div>` : "";
    const extra = kind === "pack"
      ? `<div class="sub">${label2}: ${order.field2 || "-"}</div><div class="sub">${t("shippingRef")}: ${order.shipping_ref || "-"}</div>${order.comment ? `<div class="sub">${t("comment")}: ${order.comment}</div>` : ""}`
      : "";
    const checkHead = kind === "pick" ? `<th style="width:40px">&#10003;</th>` : "";
    const html = `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"/>
      <style>body{font-family:-apple-system,Helvetica,Arial;padding:24px;color:#111}h1{color:#E64A19;margin-bottom:0}
      .sub{color:#555;margin-top:3px;font-size:13px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
      th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}th{background:#f4f4f4}</style></head><body>
      <h1>${title}</h1>
      <div class="sub" style="font-size:16px;color:#111;font-weight:700">${order.order_number}</div>
      ${compBlock}
      <div class="sub">${t("orderDate")}: ${order.order_date}</div>
      <div class="sub">${label1}: ${order.field1 || "-"}</div>
      <div class="sub">${t("shipFrom")}: ${whName}</div>
      ${extra}
      <table><tr><th>#</th><th>${t("productName")}</th><th>${t("sku")}</th><th style="text-align:right">${t("quantity")}</th>${checkHead}</tr>${rows}</table>
      <div style="text-align:center;margin-top:40px;border-top:1px solid #eee;padding-top:14px"><img src="${LOGO_DATA_URI}" style="height:54px"/></div>
      </body></html>`;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: title });
    } catch {}
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Pressable testID="so-detail-back" onPress={() => router.back()} hitSlop={10}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={C.onSurface} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{order?.order_number || t("salesOrders")}</Text>
        <Pressable testID="so-delete" onPress={doDelete} hitSlop={10}>
          <MaterialCommunityIcons name="trash-can-outline" size={22} color={C.error} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />
      ) : !value ? (
        <Text style={styles.locked}>{t("noOrders")}</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 80 }}>
          <Card style={{ marginBottom: S.md }}>
            <Text style={styles.lbl}>{t("status")}</Text>
            <Text style={styles.flowHint}>{t("statusFlow")}</Text>
            {STATUSES.map((st, i) => {
              const checked = i <= curIdx;
              const allowed = ALLOWED[order.status]?.includes(st);
              return (
                <Pressable key={st} testID={`so-status-${st}`} disabled={!allowed} onPress={() => allowed && changeStatus(st)}
                  style={[styles.statusBox, allowed && styles.statusBoxActive]}>
                  <MaterialCommunityIcons name={checked ? "checkbox-marked" : "checkbox-blank-outline"} size={24}
                    color={checked ? C.brand : allowed ? C.onSurface : C.onSurfaceTertiary} />
                  <MaterialCommunityIcons name={ICONS[st]} size={18} color={checked ? C.brand : C.onSurfaceTertiary} style={{ marginLeft: S.sm }} />
                  <Text style={[styles.statusTxt, { color: checked ? C.onSurface : allowed ? C.onSurface : C.onSurfaceTertiary }]}>{statusLabel[st]}</Text>
                  {order.status === st && <View style={styles.curPill}><Text style={styles.curPillTxt}>{t("status")}</Text></View>}
                </Pressable>
              );
            })}
          </Card>

          {(order.status === "saved" || order.status === "shipped") && (
            <Card style={{ marginBottom: S.md }}>
              {order.status === "saved" && (
                <Btn testID="so-pdf-pick" title={t("printPickingList")} icon="clipboard-check-outline" variant="secondary" onPress={() => buildSoPdf("pick")} />
              )}
              {order.status === "saved" && (
                <Btn testID="so-scan-pick" title={t("scanToPick")} icon="barcode-scan" style={{ marginTop: S.sm }} onPress={openScanner} />
              )}
              {order.status === "shipped" && (
                <Btn testID="so-pdf-pack" title={t("printPackingSlip")} icon="file-document-outline" variant="secondary" onPress={() => buildSoPdf("pack")} />
              )}
            </Card>
          )}

          <SalesOrderEditor value={value} onChange={setValue} products={products} warehouses={warehouses}
            label1={user?.so_field1_label || "Field 1"} label2={user?.so_field2_label || "Field 2"} editable={!!editable} />

          {editable ? (
            <Btn testID="so-save-edits" title={t("save")} icon="content-save-outline" loading={saving} onPress={saveEdits} style={{ marginTop: S.md }} />
          ) : (
            <Text style={styles.locked}>{t("errLockedAfterShipped")}</Text>
          )}
        </ScrollView>
      )}

      <Modal visible={returnModal} transparent animationType="fade" onRequestClose={() => setReturnModal(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("stReturned")}</Text>
            <Text style={styles.modalHint}>{t("chooseReturnWarehouse")}</Text>
            <View style={styles.whWrap}>
              {warehouses.map((w) => (
                <Pressable key={w.id} testID={`return-wh-${w.id}`} onPress={() => setReturnWh(w.id)} style={[styles.whChip, returnWh === w.id && styles.whChipActive]}>
                  <Text style={[styles.whTxt, returnWh === w.id && { color: C.onBrand }]}>{w.name}</Text>
                </Pressable>
              ))}
            </View>
            <Btn testID="return-confirm" title={t("moveToReturned")} icon="keyboard-return" onPress={confirmReturn} />
            <Pressable onPress={() => setReturnModal(false)} style={{ alignItems: "center", paddingVertical: S.md }}>
              <Text style={{ color: C.onSurfaceTertiary, fontFamily: F.textBold }}>{t("cancel")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={scanOpen} animationType="slide" onRequestClose={() => setScanOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          {scanOpen && (
            <CameraView style={StyleSheet.absoluteFill} facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr", "upc_a", "upc_e", "ean13", "ean8", "code128", "code39"] }}
              onBarcodeScanned={onScan} />
          )}
          <View style={[styles.scanTop, { paddingTop: insets.top + S.md }]}>
            <Text style={styles.scanTitle}>{t("scanToPick")}</Text>
            <Pressable testID="scan-pick-close" onPress={() => setScanOpen(false)} hitSlop={12} style={styles.scanClose}>
              <MaterialCommunityIcons name="close" size={26} color="#fff" />
            </Pressable>
          </View>
          <View style={styles.scanFrameWrap}><View style={styles.scanFrame} /></View>
        </View>
      </Modal>

      <Modal visible={!!pickItem} transparent animationType="fade" onRequestClose={() => setPickItem(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{pickItem?.name}</Text>
            <Text style={styles.demandTxt}>{t("demanded")}: {pickItem?.demanded}</Text>
            <Text style={styles.fieldLbl}>{t("pickedAmount")}</Text>
            <TextInput testID="pick-qty-input" value={pickQty} onChangeText={setPickQty} keyboardType="number-pad"
              placeholderTextColor={C.onSurfaceTertiary} style={styles.pickInput} autoFocus />
            <Btn testID="pick-save" title={t("save")} icon="check" loading={saving} onPress={savePick} />
            <Pressable onPress={() => setPickItem(null)} style={{ alignItems: "center", paddingVertical: S.md }}>
              <Text style={{ color: C.onSurfaceTertiary, fontFamily: F.textBold }}>{t("cancel")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingBottom: S.md, borderBottomWidth: 1, borderBottomColor: C.divider },
  title: { color: C.onSurface, fontFamily: F.display, fontSize: 18, letterSpacing: 0.5, flex: 1, textAlign: "center", marginHorizontal: S.sm },
  lbl: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 11, letterSpacing: 0.5, marginBottom: 2 },
  flowHint: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, marginBottom: S.sm },
  statusBox: { flexDirection: "row", alignItems: "center", paddingVertical: S.md, paddingHorizontal: S.sm, borderRadius: R.md, borderWidth: 1, borderColor: C.divider, marginTop: S.sm },
  statusBoxActive: { borderColor: C.brand },
  statusTxt: { fontFamily: F.textBold, fontSize: 15, marginLeft: S.sm, flex: 1 },
  curPill: { backgroundColor: C.brand, borderRadius: R.sm, paddingHorizontal: S.sm, paddingVertical: 2 },
  curPillTxt: { color: C.onBrand, fontFamily: F.textBold, fontSize: 10, letterSpacing: 0.5 },
  locked: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13, textAlign: "center", marginTop: S.md },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: S.xl },
  modalCard: { backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, padding: S.lg },
  modalTitle: { color: C.onSurface, fontFamily: F.display, fontSize: 20, marginBottom: S.xs },
  modalHint: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13, marginBottom: S.md },
  whWrap: { flexDirection: "row", flexWrap: "wrap", gap: S.sm, marginBottom: S.md },
  whChip: { paddingHorizontal: S.md, height: 38, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", backgroundColor: C.surface },
  whChipActive: { backgroundColor: C.brand, borderColor: C.brand },
  whTxt: { color: C.onSurfaceSecondary, fontFamily: F.textBold, fontSize: 13 },
  demandTxt: { color: C.brand, fontFamily: F.textBold, fontSize: 15, marginBottom: S.md },
  fieldLbl: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 11, letterSpacing: 0.5, marginBottom: S.xs },
  pickInput: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, height: 52, color: C.onSurface, fontFamily: F.textBold, fontSize: 20, textAlign: "center", marginBottom: S.md },
  scanTop: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingBottom: S.md },
  scanTitle: { color: "#F5F5F5", fontFamily: F.display, fontSize: 20, letterSpacing: 1 },
  scanClose: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  scanFrameWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  scanFrame: { width: 260, height: 160, borderWidth: 3, borderColor: C.brand, borderRadius: R.md, backgroundColor: "transparent" },
});
