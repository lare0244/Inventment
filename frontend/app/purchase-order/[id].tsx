import React, { useState, useEffect, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, Platform, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useColors, useT } from "@/src/appsettings";
import { money } from "@/src/currency";
import { Card, Btn, Dropdown } from "@/src/components/ui";
import { F, S, R, Palette } from "@/src/theme";

export default function PurchaseOrderDetail() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currency } = useAuth();
  const C = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id;

  const [po, setPo] = useState<any>(null);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [whChoice, setWhChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "deliver" | "cancel" | "save">(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, w] = await Promise.all([api<any>(`/purchase-orders/${id}`), api<any[]>("/warehouses")]);
      setPo(p);
      setWarehouses(w);
      setItems((p.items || []).map((it: any) => ({ ...it })));
      setWhChoice(p.warehouse_id || null);
    } catch { router.back(); } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const statusMeta: Record<string, { label: string; color: string; icon: string }> = {
    draft: { label: t("statusDraft"), color: C.onSurfaceTertiary, icon: "file-document-outline" },
    sent: { label: t("statusSent"), color: C.brand, icon: "email-fast-outline" },
    delivered: { label: t("statusDelivered"), color: C.success, icon: "check-decagram" },
    cancelled: { label: t("statusCancelled"), color: C.error, icon: "close-circle-outline" },
  };
  const st = po ? (statusMeta[po.status] || statusMeta.draft) : statusMeta.draft;
  const locked = po && (po.status === "delivered" || po.status === "cancelled");
  const total = items.reduce((s, it) => s + (it.cost || 0) * (it.qty || 0), 0);

  function confirm(msg: string, onYes: () => void) {
    if (Platform.OS === "web" && typeof window !== "undefined") { if (window.confirm(msg)) onYes(); }
    else Alert.alert("INVENTMENT", msg, [{ text: t("cancel"), style: "cancel" }, { text: "OK", onPress: onYes }]);
  }
  function notify(msg: string) {
    if (Platform.OS === "web" && typeof window !== "undefined") window.alert(msg);
    else Alert.alert("INVENTMENT", msg);
  }

  function setQty(pid: string, qty: number) {
    setItems((arr) => arr.map((it) => (it.product_id === pid ? { ...it, qty: Math.max(0, qty) } : it)));
  }
  function removeRow(pid: string) {
    setItems((arr) => arr.filter((it) => it.product_id !== pid));
  }

  async function saveEdits() {
    setBusy("save");
    try {
      const body = { items: items.filter((it) => (it.qty || 0) > 0).map((it) => ({ product_id: it.product_id, qty: it.qty })) };
      const updated = await api<any>(`/purchase-orders/${id}`, { method: "PUT", body });
      setPo(updated); setItems((updated.items || []).map((it: any) => ({ ...it }))); setEditing(false);
    } catch (e: any) { notify(e?.message || "Error"); } finally { setBusy(null); }
  }

  async function markDelivered() {
    const wid = po.warehouse_id || whChoice;
    if (!wid) { notify(t("selectWarehouse")); return; }
    confirm(t("confirmDeliver"), async () => {
      setBusy("deliver");
      try {
        const updated = await api<any>(`/purchase-orders/${id}/received`, { method: "PUT", body: { warehouse_id: wid } });
        setPo(updated); setWhChoice(updated.warehouse_id);
      } catch (e: any) { notify(e?.message || "Error"); } finally { setBusy(null); }
    });
  }

  async function cancelOrder() {
    confirm(t("confirmCancel"), async () => {
      setBusy("cancel");
      try {
        const updated = await api<any>(`/purchase-orders/${id}/cancelled`, { method: "PUT" });
        setPo(updated);
      } catch (e: any) { notify(e?.message || "Error"); } finally { setBusy(null); }
    });
  }

  if (loading || !po) {
    return <View style={{ flex: 1, backgroundColor: C.surface, justifyContent: "center" }}><ActivityIndicator color={C.brand} /></View>;
  }

  const destWh = warehouses.find((w) => w.id === (po.warehouse_id || whChoice));
  const needWarehouse = !po.warehouse_id;

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Pressable testID="po-back" onPress={() => router.back()} hitSlop={10}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={C.onSurface} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>PO-{String(po.id).slice(0, 8).toUpperCase()}</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + 40, alignItems: "center" }} testID="po-scroll">
        <View style={{ width: "100%", maxWidth: 720 }}>
          <View style={[styles.statusPill, { borderColor: st.color }]}>
            <MaterialCommunityIcons name={st.icon as any} size={16} color={st.color} />
            <Text style={[styles.statusTxt, { color: st.color }]}>{st.label}</Text>
          </View>

          <Card style={{ marginTop: S.lg }}>
            <Row label={t("supplier")} value={po.supplier_name || "—"} styles={styles} />
            <Row label={t("deliveredTo")} value={destWh?.name || po.warehouse_name || "—"} styles={styles} />
            {po.delivered_at && <Row label={t("statusDelivered")} value={String(po.delivered_at).slice(0, 10)} styles={styles} />}
          </Card>

          {/* Destination warehouse picker when none set and still actionable */}
          {needWarehouse && !locked && (
            <View style={{ marginTop: S.lg }}>
              <Text style={styles.section}>{t("selectWarehouse")}</Text>
              <Dropdown testID="po-wh" value={whChoice} placeholder={t("selectWarehouse")}
                options={warehouses.map((w) => ({ value: w.id, label: w.name, sub: w.location }))}
                onChange={setWhChoice} />
            </View>
          )}

          <View style={styles.itemsHead}>
            <Text style={[styles.section, { marginBottom: 0 }]}>{t("itemsLabel")} · {items.length}</Text>
            {!locked && (
              <Pressable testID="po-edit-toggle" onPress={() => { if (editing) { setItems((po.items || []).map((it: any) => ({ ...it }))); } setEditing((e) => !e); }} style={styles.editBtn}>
                <MaterialCommunityIcons name={editing ? "close" : "pencil"} size={16} color={C.brand} />
                <Text style={styles.editTxt}>{editing ? t("cancel") : t("editItems")}</Text>
              </Pressable>
            )}
          </View>

          <Card>
            {items.length === 0 ? (
              <Text style={styles.empty}>—</Text>
            ) : items.map((it, i) => (
              <View key={it.product_id} testID={`po-item-${it.product_id}`} style={[styles.itemRow, i > 0 && styles.itemDivider]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName} numberOfLines={1}>{it.name}</Text>
                  <Text style={styles.itemMeta}>{it.sku || it.product_id.slice(0, 6)} · {money(it.cost || 0, currency)}</Text>
                </View>
                {editing ? (
                  <View style={styles.qtyEditor}>
                    <Pressable testID={`po-minus-${it.product_id}`} onPress={() => setQty(it.product_id, (it.qty || 0) - 1)} style={styles.stepBtn}>
                      <MaterialCommunityIcons name="minus" size={18} color={C.onSurface} />
                    </Pressable>
                    <TextInput testID={`po-qty-${it.product_id}`} value={String(it.qty)} keyboardType="number-pad"
                      onChangeText={(v) => setQty(it.product_id, parseInt(v.replace(/[^0-9]/g, "") || "0", 10))}
                      style={styles.qtyInput} />
                    <Pressable testID={`po-plus-${it.product_id}`} onPress={() => setQty(it.product_id, (it.qty || 0) + 1)} style={styles.stepBtn}>
                      <MaterialCommunityIcons name="plus" size={18} color={C.onSurface} />
                    </Pressable>
                    <Pressable testID={`po-remove-${it.product_id}`} onPress={() => removeRow(it.product_id)} style={styles.removeBtn} hitSlop={8}>
                      <MaterialCommunityIcons name="trash-can-outline" size={20} color={C.error} />
                    </Pressable>
                  </View>
                ) : (
                  <Text style={styles.itemQty}>×{it.qty}</Text>
                )}
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t("orderTotal")}</Text>
              <Text style={styles.totalVal}>{money(total, currency)}</Text>
            </View>
          </Card>

          {/* Actions */}
          <View style={{ marginTop: S.xl, gap: S.sm }}>
            {editing ? (
              <Btn testID="po-save" title={t("save")} icon="content-save" loading={busy === "save"} onPress={saveEdits} />
            ) : !locked ? (
              <>
                <Btn testID="po-deliver" title={t("markDelivered")} icon="truck-check" loading={busy === "deliver"} onPress={markDelivered} />
                <Btn testID="po-cancel" title={t("cancelOrder")} icon="close-circle-outline" variant="ghost" loading={busy === "cancel"} onPress={cancelOrder} />
              </>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Row({ label, value, styles }: { label: string; value: string; styles: any }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoVal} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingBottom: S.md, borderBottomWidth: 1, borderBottomColor: C.divider },
  title: { color: C.onSurface, fontFamily: F.display, fontSize: 20, letterSpacing: 1, flex: 1, textAlign: "center" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: S.md, paddingVertical: 6, borderRadius: R.pill, borderWidth: 1.5 },
  statusTxt: { fontFamily: F.textBold, fontSize: 12, letterSpacing: 1 },
  section: { color: C.onSurfaceSecondary, fontFamily: F.textBold, fontSize: 13, letterSpacing: 1, marginTop: S.xl, marginBottom: S.sm },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: S.xs, gap: S.md },
  infoLabel: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13 },
  infoVal: { color: C.onSurface, fontFamily: F.textBold, fontSize: 14, flexShrink: 1 },
  itemsHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: S.xl, marginBottom: S.sm },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  editTxt: { color: C.brand, fontFamily: F.textBold, fontSize: 13 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: S.md, paddingVertical: S.md },
  itemDivider: { borderTopWidth: 1, borderTopColor: C.divider },
  itemName: { color: C.onSurface, fontFamily: F.text, fontSize: 15 },
  itemMeta: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, marginTop: 2 },
  itemQty: { color: C.onSurface, fontFamily: F.textBold, fontSize: 16 },
  qtyEditor: { flexDirection: "row", alignItems: "center", gap: S.sm },
  stepBtn: { width: 34, height: 34, borderRadius: R.sm, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", backgroundColor: C.surface },
  qtyInput: { minWidth: 46, height: 34, textAlign: "center", borderWidth: 1, borderColor: C.border, borderRadius: R.sm, color: C.onSurface, fontFamily: F.textBold, fontSize: 15, paddingHorizontal: 4, backgroundColor: C.surface },
  removeBtn: { padding: 4, marginLeft: 2 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 2, borderTopColor: C.border, marginTop: S.sm, paddingTop: S.md },
  totalLabel: { color: C.onSurfaceSecondary, fontFamily: F.textBold, fontSize: 14, letterSpacing: 0.5 },
  totalVal: { color: C.onSurface, fontFamily: F.display, fontSize: 22 },
  empty: { color: C.onSurfaceTertiary, fontFamily: F.text },
});
