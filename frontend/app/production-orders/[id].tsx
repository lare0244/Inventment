import React, { useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, Platform, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";
import { api } from "@/src/api";
import { useColors, useT } from "@/src/appsettings";
import { F, S, R, Palette } from "@/src/theme";
import { Card, Btn } from "@/src/components/ui";
import { ProductPicker } from "@/src/components/ProductPicker";

export default function ProductionOrderDetail() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const C = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const o = await api<any>(`/production-orders/${id}`);
      setOrder(o); setItems(o.items || []);
    } catch {} finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = order && order.status !== "completed";

  function warn(msg: string) {
    if (Platform.OS === "web" && typeof window !== "undefined") window.alert(msg); else Alert.alert(msg, "");
  }

  async function persist(next: any[]) {
    setItems(next);
    try { await api(`/production-orders/${id}`, { method: "PUT", body: { items: next.map((i) => ({ product_id: i.product_id, quantity: i.quantity, batch_number: i.batch_number, best_before_date: i.best_before_date })) } }); } catch {}
  }
  function addProduct(p: any) {
    setPicker(false);
    if (items.some((i) => i.product_id === p.id)) return;
    persist([...items, { product_id: p.id, name: p.name, quantity: 1, batch_number: "", best_before_date: "" }]);
  }
  function setField(pid: string, field: string, value: any) {
    setItems((arr) => arr.map((i) => i.product_id === pid ? { ...i, [field]: value } : i));
  }
  function commitField() { persist(items); }
  function removeItem(pid: string) { persist(items.filter((i) => i.product_id !== pid)); }
  function stepQty(pid: string, delta: number) {
    const next = items.map((i) => i.product_id === pid ? { ...i, quantity: Math.max(1, (parseInt(i.quantity, 10) || 1) + delta) } : i);
    persist(next);
  }

  function complete() {
    if (items.length === 0) { warn(t("onlyProductionUnits")); return; }
    const run = async () => {
      setBusy(true);
      try {
        const r = await api<any>(`/production-orders/${id}/complete`, { method: "POST" });
        await load();
        if (r.warnings && r.warnings.length) warn(`${t("negativeStockWarn")} ${r.warnings.join(", ")}`);
        else warn(t("productionComplete"));
      } catch (e: any) { warn(e?.message || t("saveFailed")); } finally { setBusy(false); }
    };
    const msg = t("confirmCompleteProduction");
    if (Platform.OS === "web" && typeof window !== "undefined") { if (window.confirm(msg)) run(); return; }
    Alert.alert(t("completeProduction"), msg, [{ text: t("cancel"), style: "cancel" }, { text: t("completeProduction"), onPress: run }]);
  }

  function del() {
    const run = async () => { try { await api(`/production-orders/${id}`, { method: "DELETE" }); router.back(); } catch {} };
    const msg = t("confirmDelete");
    if (Platform.OS === "web" && typeof window !== "undefined") { if (window.confirm(msg)) run(); return; }
    Alert.alert(t("delete"), msg, [{ text: t("cancel"), style: "cancel" }, { text: t("delete"), style: "destructive", onPress: run }]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Pressable testID="pod-back" onPress={() => router.back()} hitSlop={10}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={C.onSurface} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{order?.number || t("productionOrders")}</Text>
        <Pressable testID="pod-delete" onPress={del} hitSlop={10}>
          <MaterialCommunityIcons name="trash-can-outline" size={22} color={C.error} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />
      ) : !order ? (
        <Text style={styles.empty}>{t("notFound")}</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
          <Card style={{ marginBottom: S.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
              <MaterialCommunityIcons name="warehouse" size={18} color={C.brand} />
              <Text style={styles.metaWh}>{order.warehouse_name}</Text>
              <View style={[styles.badge, { backgroundColor: open ? C.warning : C.success }]}>
                <Text style={styles.badgeTxt}>{open ? t("statusDraft") : t("stCompleted")}</Text>
              </View>
            </View>
          </Card>

          {open && (
            <Btn testID="pod-add" title={t("addProduct")} icon="plus" variant="secondary" onPress={() => setPicker(true)} style={{ marginBottom: S.md }} />
          )}

          {items.length === 0 ? (
            <Card><Text style={styles.empty}>{t("onlyProductionUnits")}</Text></Card>
          ) : (
            items.map((it) => (
              <Card key={it.product_id} style={{ marginBottom: S.sm }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={styles.itName} numberOfLines={1}>{it.name}</Text>
                  {open && (
                    <Pressable testID={`pod-remove-${it.product_id}`} onPress={() => removeItem(it.product_id)} hitSlop={8}>
                      <MaterialCommunityIcons name="close" size={18} color={C.onSurfaceTertiary} />
                    </Pressable>
                  )}
                </View>
                <View style={styles.qtyRow}>
                  <Text style={styles.miniLbl}>{t("produceQty")}</Text>
                  {open ? (
                    <View style={styles.stepper}>
                      <Pressable testID={`pod-minus-${it.product_id}`} onPress={() => stepQty(it.product_id, -1)} style={styles.stepBtn}><MaterialCommunityIcons name="minus" size={16} color={C.onSurface} /></Pressable>
                      <Text style={styles.stepVal}>{it.quantity}</Text>
                      <Pressable testID={`pod-plus-${it.product_id}`} onPress={() => stepQty(it.product_id, 1)} style={styles.stepBtn}><MaterialCommunityIcons name="plus" size={16} color={C.onSurface} /></Pressable>
                    </View>
                  ) : <Text style={styles.stepVal}>{it.quantity}</Text>}
                </View>
                {open ? (
                  <>
                    <Text style={styles.miniLbl}>{t("batchNumber")}</Text>
                    <TextInput testID={`pod-batch-${it.product_id}`} value={it.batch_number} onChangeText={(v) => setField(it.product_id, "batch_number", v)} onBlur={commitField}
                      placeholder={t("batchNumber")} placeholderTextColor={C.onSurfaceTertiary} style={styles.input} />
                    <Text style={styles.miniLbl}>{t("bestBefore")}</Text>
                    <TextInput testID={`pod-bb-${it.product_id}`} value={it.best_before_date} onChangeText={(v) => setField(it.product_id, "best_before_date", v)} onBlur={commitField}
                      placeholder="YYYY-MM-DD" placeholderTextColor={C.onSurfaceTertiary} style={styles.input} />
                  </>
                ) : (
                  <Text style={styles.roMeta}>{it.batch_number ? `${t("batchNumber")}: ${it.batch_number}` : ""}{it.best_before_date ? `  ·  ${t("bestBefore")}: ${it.best_before_date}` : ""}</Text>
                )}
              </Card>
            ))
          )}

          {open && items.length > 0 && (
            <Btn testID="pod-complete" title={t("completeProduction")} icon="check-circle-outline" loading={busy} onPress={complete} style={{ marginTop: S.lg }} />
          )}
        </ScrollView>
      )}

      <ProductPicker visible={picker} productionOnly onClose={() => setPicker(false)} onSelect={addProduct}
        excludeIds={items.map((i) => i.product_id)} title={t("addProduct")} />
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingBottom: S.md, borderBottomWidth: 1, borderBottomColor: C.divider },
  title: { color: C.onSurface, fontFamily: F.display, fontSize: 18, letterSpacing: 0.5, flex: 1, textAlign: "center", marginHorizontal: S.sm },
  empty: { color: C.onSurfaceTertiary, fontFamily: F.text, textAlign: "center", marginTop: S.md },
  metaWh: { color: C.onSurface, fontFamily: F.textBold, fontSize: 16, flex: 1 },
  badge: { borderRadius: R.sm, paddingHorizontal: S.sm, paddingVertical: 2 },
  badgeTxt: { color: "#fff", fontFamily: F.textBold, fontSize: 10, letterSpacing: 0.5 },
  itName: { flex: 1, color: C.onSurface, fontFamily: F.textBold, fontSize: 15 },
  qtyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: S.sm, marginBottom: S.sm },
  miniLbl: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", marginTop: S.sm, marginBottom: S.xs },
  stepper: { flexDirection: "row", alignItems: "center", gap: S.sm },
  stepBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", backgroundColor: C.surface },
  stepVal: { color: C.onSurface, fontFamily: F.display, fontSize: 17, minWidth: 32, textAlign: "center" },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, height: 46, color: C.onSurface, fontFamily: F.text, fontSize: 15 },
  roMeta: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 13, marginTop: S.xs },
});
