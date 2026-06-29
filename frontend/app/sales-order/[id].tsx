import React, { useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Platform, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
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

  const load = useCallback(async () => {
    try {
      const [o, p, w] = await Promise.all([api<any>(`/sales-orders/${id}`), api<any[]>("/products"), api<any[]>("/warehouses")]);
      setOrder(o); setProducts(p); setWarehouses(w);
      setValue({ field1: o.field1 || "", field2: o.field2 || "", comment: o.comment || "", shipping_ref: o.shipping_ref || "",
        order_date: o.order_date || "", warehouse_id: o.warehouse_id || null,
        items: (o.items || []).map((i: any) => ({ product_id: i.product_id, name: i.name, quantity: i.quantity })) });
    } catch {} finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const statusLabel: Record<string, string> = { saved: t("stSaved"), picked: t("stPicked"), shipped: t("stShipped"), returned: t("stReturned") };
  const editable = order && (order.status === "saved" || order.status === "picked");

  async function saveEdits() {
    if (!value) return; setSaving(true);
    try {
      await api(`/sales-orders/${id}`, { method: "PUT", body: { ...value, items: value.items.map((i) => ({ product_id: i.product_id, name: i.name, quantity: i.quantity })) } });
      await load();
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

      {loading || !value ? (
        <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />
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
});
