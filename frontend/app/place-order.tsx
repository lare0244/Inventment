import React, { useState, useEffect, useMemo, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useColors, useT } from "@/src/appsettings";
import { money } from "@/src/currency";
import { F, S, R, stockColor, Palette } from "@/src/theme";
import { Btn } from "@/src/components/ui";

export default function PlaceOrder() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = useColors();
  const t = useT();
  const { currency } = useAuth();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [sortMode, setSortMode] = useState<"stock" | "name">("stock");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [selWarehouse, setSelWarehouse] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const suggestQty = (p: any) => Math.max((p.low_stock_threshold || 5) * 2 - (p.quantity || 0), p.low_stock_threshold || 5);

  const load = useCallback(async () => {
    try {
      const [p, w] = await Promise.all([api<any[]>("/products"), api<any[]>("/warehouses")]);
      setProducts(p); setWarehouses(w);
      setSelWarehouse((prev) => prev || w[0]?.id || null);
    } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const sorted = useMemo(() => {
    const arr = [...products];
    if (sortMode === "name") arr.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    else arr.sort((a, b) => (a.quantity || 0) - (b.quantity || 0));
    return arr;
  }, [products, sortMode]);

  const groups = useMemo(() => {
    if (sortMode !== "stock") return [{ key: "all", label: "", items: sorted }];
    const out = sorted.filter((p) => p.quantity <= 0);
    const low = sorted.filter((p) => p.quantity > 0 && p.quantity <= p.low_stock_threshold);
    const ok = sorted.filter((p) => p.quantity > p.low_stock_threshold);
    return [
      { key: "out", label: t("outOfStock"), items: out },
      { key: "low", label: t("lowGroup"), items: low },
      { key: "ok", label: t("inStockGroup"), items: ok },
    ].filter((g) => g.items.length > 0);
  }, [sorted, sortMode, t]);

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);

  async function createOrder() {
    if (selectedIds.length === 0) return;
    setCreating(true);
    try {
      const items = selectedIds.map((id) => ({ product_id: id, qty: qtys[id] ?? suggestQty(products.find((p) => p.id === id) || {}) }));
      await api("/purchase-orders", { method: "POST", body: { items, warehouse_id: selWarehouse || warehouses[0]?.id || null } });
      router.replace("/(tabs)/orders");
    } catch {} finally { setCreating(false); }
  }

  function toggle(p: any) {
    setSelected((s) => ({ ...s, [p.id]: !s[p.id] }));
    setQtys((q) => (q[p.id] != null ? q : { ...q, [p.id]: suggestQty(p) }));
  }
  const setQty = (id: string, n: number) => setQtys((q) => ({ ...q, [id]: Math.max(1, n) }));

  const Row = ({ p }: { p: any }) => {
    const isSel = !!selected[p.id];
    const q = qtys[p.id] ?? suggestQty(p);
    return (
      <Pressable testID={`po-product-${p.id}`} onPress={() => toggle(p)}
        style={[styles.row, isSel && styles.rowSel]}>
        <MaterialCommunityIcons name={isSel ? "checkbox-marked" : "checkbox-blank-outline"} size={22} color={isSel ? C.brand : C.onSurfaceTertiary} />
        <View style={[styles.dot, { backgroundColor: stockColor(p.quantity, p.low_stock_threshold, C) }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
          <Text style={styles.meta}>{p.sku || p.barcode || ""} · {money(p.price, currency)} · {t("inStock")}: {p.quantity}</Text>
        </View>
        {isSel ? (
          <View style={styles.stepper}>
            <Pressable testID={`po-minus-${p.id}`} hitSlop={8} onPress={() => setQty(p.id, q - 1)} style={styles.stepBtn}>
              <MaterialCommunityIcons name="minus" size={18} color={C.onSurface} />
            </Pressable>
            <Text style={styles.stepVal}>{q}</Text>
            <Pressable testID={`po-plus-${p.id}`} hitSlop={8} onPress={() => setQty(p.id, q + 1)} style={styles.stepBtn}>
              <MaterialCommunityIcons name="plus" size={18} color={C.onSurface} />
            </Pressable>
          </View>
        ) : (
          <Text style={styles.qty}>{p.quantity}</Text>
        )}
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Pressable testID="po-back" onPress={() => router.back()} hitSlop={10}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={C.onSurface} />
        </Pressable>
        <Text style={styles.title}>{t("placeOrderTitle")}</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.sortBar}>
        <Text style={styles.sortLabel}>{t("sortBy")}:</Text>
        <Pressable testID="sort-stock" onPress={() => setSortMode("stock")} style={[styles.sortChip, sortMode === "stock" && styles.sortChipActive]}>
          <Text style={[styles.sortTxt, sortMode === "stock" && { color: C.onBrand }]}>{t("sortStock")}</Text>
        </Pressable>
        <Pressable testID="sort-name" onPress={() => setSortMode("name")} style={[styles.sortChip, sortMode === "name" && styles.sortChipActive]}>
          <Text style={[styles.sortTxt, sortMode === "name" && { color: C.onBrand }]}>{t("sortName")}</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 120 }}>
          <Text style={styles.hint}>{t("selectToOrder")}</Text>
          {groups.map((g) => (
            <View key={g.key}>
              {!!g.label && <Text style={styles.group}>{g.label} ({g.items.length})</Text>}
              {g.items.map((p) => <Row key={p.id} p={p} />)}
            </View>
          ))}
        </ScrollView>
      )}

      {selectedIds.length > 0 && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + S.sm }]}>
          {warehouses.length > 0 && (
            <>
              <Text style={styles.deliverLabel}>{t("deliverTo")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.whRow}>
                {warehouses.map((w) => (
                  <Pressable key={w.id} testID={`po-wh-${w.id}`} onPress={() => setSelWarehouse(w.id)}
                    style={[styles.whChip, selWarehouse === w.id && styles.whChipActive]}>
                    <Text style={[styles.whTxt, selWarehouse === w.id && { color: C.onBrand }]}>{w.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}
          <Btn testID="po-create-btn" title={`${t("createOrder")} (${selectedIds.length} ${t("selected")})`} icon="clipboard-check" loading={creating} onPress={createOrder} />
        </View>
      )}
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingBottom: S.md, borderBottomWidth: 1, borderBottomColor: C.divider },
  title: { color: C.onSurface, fontFamily: F.display, fontSize: 22, letterSpacing: 1 },
  sortBar: { flexDirection: "row", alignItems: "center", gap: S.sm, paddingHorizontal: S.lg, paddingVertical: S.md, borderBottomWidth: 1, borderBottomColor: C.divider },
  sortLabel: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13 },
  sortChip: { height: 34, paddingHorizontal: S.md, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", backgroundColor: C.surfaceSecondary },
  sortChipActive: { backgroundColor: C.brand, borderColor: C.brand },
  sortTxt: { color: C.onSurfaceSecondary, fontFamily: F.textBold, fontSize: 13 },
  hint: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13, marginBottom: S.md },
  group: { color: C.onSurfaceSecondary, fontFamily: F.textBold, fontSize: 13, letterSpacing: 1, marginTop: S.lg, marginBottom: S.sm },
  row: { flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: S.md, marginBottom: S.sm },
  rowSel: { borderColor: C.brand },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { color: C.onSurface, fontFamily: F.textBold, fontSize: 15 },
  meta: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, marginTop: 2 },
  qty: { color: C.onSurface, fontFamily: F.display, fontSize: 18 },
  stepper: { flexDirection: "row", alignItems: "center", gap: S.sm },
  stepBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", backgroundColor: C.surface },
  stepVal: { color: C.onSurface, fontFamily: F.display, fontSize: 17, minWidth: 28, textAlign: "center" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: S.lg, paddingTop: S.sm, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.divider },
  deliverLabel: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 11, letterSpacing: 0.5, marginBottom: S.xs },
  whRow: { gap: S.sm, paddingBottom: S.sm },
  whChip: { height: 34, paddingHorizontal: S.md, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", flexShrink: 0, backgroundColor: C.surfaceSecondary },
  whChipActive: { backgroundColor: C.brand, borderColor: C.brand },
  whTxt: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 13 },
});
