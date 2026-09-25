import React, { useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Platform, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";
import { api } from "@/src/api";
import { useColors, useT } from "@/src/appsettings";
import { F, S, R, Palette } from "@/src/theme";
import { Card, Btn, Dropdown } from "@/src/components/ui";
import { ProductPicker } from "@/src/components/ProductPicker";

export default function StockMovement() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [product, setProduct] = useState<any>(null);
  const [fromW, setFromW] = useState<string | null>(null);
  const [toW, setToW] = useState<string | null>(null);
  const [qty, setQty] = useState("1");
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, m] = await Promise.all([api<any[]>("/warehouses"), api<any[]>("/movements?type=transfer&limit=50")]);
      setWarehouses(w); setMovements(m);
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  function warn(msg: string) {
    if (Platform.OS === "web" && typeof window !== "undefined") window.alert(msg); else Alert.alert(msg, "");
  }

  async function doTransfer() {
    if (!product || !fromW || !toW) return;
    if (fromW === toW) { warn(t("sameWarehouse")); return; }
    const n = parseInt(qty, 10) || 0;
    if (n <= 0) return;
    setSaving(true);
    try {
      await api("/transfers", { method: "POST", body: { product_id: product.id, from_warehouse_id: fromW, to_warehouse_id: toW, quantity: n } });
      setProduct(null); setQty("1");
      await load();
      warn(t("transferDone"));
    } catch (e: any) {
      warn(e?.message || t("saveFailed"));
    } finally { setSaving(false); }
  }

  const whOpts = warehouses.map((w) => ({ value: w.id, label: w.name }));

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Pressable testID="sm-back" onPress={() => router.back()} hitSlop={10}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={C.onSurface} />
        </Pressable>
        <Text style={styles.title}>{t("stockMovement")}</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Card style={{ marginBottom: S.lg }}>
          <Text style={styles.lbl}>{t("selectProduct")}</Text>
          <Pressable testID="sm-pick-product" onPress={() => setPicker(true)} style={styles.pickBtn}>
            <MaterialCommunityIcons name="cube-outline" size={20} color={product ? C.brand : C.onSurfaceTertiary} />
            <Text style={[styles.pickTxt, product && { color: C.onSurface }]} numberOfLines={1}>{product ? product.name : t("selectProduct")}</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={C.onSurfaceTertiary} />
          </Pressable>

          <Text style={styles.lbl}>{t("fromWarehouse")}</Text>
          <View style={{ marginBottom: S.md }}><Dropdown testID="sm-from" value={fromW} placeholder={t("fromWarehouse")} options={whOpts} onChange={setFromW} /></View>
          <Text style={styles.lbl}>{t("toWarehouse")}</Text>
          <View style={{ marginBottom: S.md }}><Dropdown testID="sm-to" value={toW} placeholder={t("toWarehouse")} options={whOpts} onChange={setToW} /></View>
          <Text style={styles.lbl}>{t("sortByQty")}</Text>
          <TextInput testID="sm-qty" value={qty} onChangeText={setQty} keyboardType="number-pad" style={styles.input} placeholderTextColor={C.onSurfaceTertiary} />

          <Btn testID="sm-transfer" title={t("doTransfer")} icon="swap-horizontal" loading={saving}
            onPress={doTransfer} style={{ marginTop: S.sm }} />
        </Card>

        <Text style={styles.section}>{t("recentMovements")}</Text>
        {movements.length === 0 ? (
          <Card><Text style={styles.empty}>{t("noMovements")}</Text></Card>
        ) : (
          movements.map((m) => (
            <Card key={m.id} style={styles.mvRow}>
              <MaterialCommunityIcons name="swap-horizontal" size={20} color={C.info} />
              <View style={{ flex: 1 }}>
                <Text style={styles.mvName} numberOfLines={1}>{m.product_name}</Text>
                <Text style={styles.mvMeta} numberOfLines={1}>{m.from_warehouse_name} → {m.warehouse_name}</Text>
              </View>
              <Text style={styles.mvQty}>{m.quantity}</Text>
            </Card>
          ))
        )}
      </ScrollView>

      <ProductPicker visible={picker} onClose={() => setPicker(false)} onSelect={(p) => { setProduct(p); setPicker(false); }} />
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingBottom: S.md, borderBottomWidth: 1, borderBottomColor: C.divider },
  title: { color: C.onSurface, fontFamily: F.display, fontSize: 18, letterSpacing: 0.5, flex: 1, textAlign: "center" },
  lbl: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 11, letterSpacing: 0.5, marginBottom: S.xs, textTransform: "uppercase" },
  pickBtn: { flexDirection: "row", alignItems: "center", gap: S.sm, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, height: 50, marginBottom: S.md },
  pickTxt: { flex: 1, color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 15 },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, height: 50, color: C.onSurface, fontFamily: F.textBold, fontSize: 16 },
  section: { color: C.onSurfaceSecondary, fontFamily: F.textBold, fontSize: 13, letterSpacing: 1, marginBottom: S.sm },
  empty: { color: C.onSurfaceTertiary, fontFamily: F.text },
  mvRow: { flexDirection: "row", alignItems: "center", gap: S.md, marginBottom: S.sm },
  mvName: { color: C.onSurface, fontFamily: F.textBold, fontSize: 14 },
  mvMeta: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, marginTop: 2 },
  mvQty: { color: C.info, fontFamily: F.display, fontSize: 18 },
});
