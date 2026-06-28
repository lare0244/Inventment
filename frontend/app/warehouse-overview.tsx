import React, { useState, useEffect, useMemo, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useColors, useT } from "@/src/appsettings";
import { money, currencySymbol } from "@/src/currency";
import { F, S, R, stockColor, Palette } from "@/src/theme";
import { Card } from "@/src/components/ui";
import { StockLineChart } from "@/src/components/StockLineChart";

export default function WarehouseOverview() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currency } = useAuth();
  const C = useColors();
  const t = useT();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ warehouse_id?: string }>();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [activeWh, setActiveWh] = useState<string | null>(params.warehouse_id || null);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [data, setData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const wq = activeWh ? `?warehouse_id=${activeWh}` : "";
      const [d, h, w, p] = await Promise.all([
        api(`/dashboard${wq}`),
        api<{ history: any[] }>(`/reports/stock-history${wq}`),
        api<any[]>("/warehouses"),
        api<any[]>("/products"),
      ]);
      setData(d); setHistory(h.history || []); setWarehouses(w); setProducts(p);
    } catch {} finally { setLoading(false); }
  }, [activeWh]);
  useEffect(() => { load(); }, [load]);

  const visibleProducts = useMemo(() => {
    if (!activeWh) {
      return products.map((p) => ({ ...p, whQty: p.quantity ?? Object.values(p.stock || {}).reduce((a: any, b: any) => a + b, 0) }))
        .filter((p) => p.whQty >= 0);
    }
    return products
      .filter((p) => p.stock && Object.prototype.hasOwnProperty.call(p.stock, activeWh))
      .map((p) => ({ ...p, whQty: (p.stock || {})[activeWh] || 0 }));
  }, [products, activeWh]);

  const stats = [
    { label: t("stockValue"), value: data ? money(data.stock_value, currency) : "—", icon: "cash-multiple", color: C.success },
    { label: t("totalUnits"), value: data ? data.total_units : "—", icon: "cube-outline", color: C.info },
    { label: t("products"), value: data ? data.total_products : "—", icon: "package-variant", color: C.brand },
    { label: t("lowStock"), value: data ? data.low_stock_count : "—", icon: "alert", color: C.warning },
  ];

  const sym = currencySymbol(currency);
  const fmtAxis = (v: number) => {
    const a = v >= 1000 ? `${+(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `${Math.round(v)}`;
    return `${a}`;
  };
  const chartW = width - S.lg * 2 - S.lg * 2;

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Pressable testID="wo-back" onPress={() => router.back()} hitSlop={10}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={C.onSurface} />
        </Pressable>
        <Text style={styles.title}>{t("stockOverview")}</Text>
        <View style={{ width: 28 }} />
      </View>

      {warehouses.length > 1 && (
        <View style={styles.filters}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            <Pressable testID="wo-wh-all" onPress={() => setActiveWh(null)} style={[styles.chip, !activeWh && styles.chipActive]}>
              <Text style={[styles.chipTxt, !activeWh && { color: C.onBrand }]}>{t("allWarehouses")}</Text>
            </Pressable>
            {warehouses.map((w) => (
              <Pressable key={w.id} testID={`wo-wh-${w.id}`} onPress={() => setActiveWh(w.id)} style={[styles.chip, activeWh === w.id && styles.chipActive]}>
                <Text style={[styles.chipTxt, activeWh === w.id && { color: C.onBrand }]}>{w.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 40 }} testID="wo-scroll">
          <View style={styles.grid}>
            {stats.map((s) => (
              <Card key={s.label} style={styles.statCard}>
                <MaterialCommunityIcons name={s.icon as any} size={22} color={s.color} />
                <Text style={styles.statVal}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </Card>
            ))}
          </View>

          <Text style={styles.section}>{t("stockValue15")}</Text>
          <Card>
            <StockLineChart data={history} width={chartW} height={200} showGrid formatValue={fmtAxis} />
            <Text style={styles.chartLatest}>
              {t("latest")}: {money(history[history.length - 1]?.value || 0, currency)} ({sym})
            </Text>
          </Card>

          <Text style={styles.section}>{t("allProducts")} · {visibleProducts.length}</Text>
          {visibleProducts.length === 0 ? (
            <Card><Text style={styles.empty}>{t("noProducts")}</Text></Card>
          ) : (
            visibleProducts.map((p) => (
              <Pressable key={p.id} testID={`wo-product-${p.id}`} onPress={() => router.push(`/product/${p.id}`)}>
                <Card style={styles.row}>
                  <View style={[styles.dot, { backgroundColor: stockColor(p.whQty, p.low_stock_threshold, C) }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {money((p.cost || 0) * p.whQty, currency)}
                      {p.sku ? `  ·  ${p.sku}` : ""}
                    </Text>
                  </View>
                  <Text style={styles.rowQty}>{p.whQty} {t("left")}</Text>
                </Card>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingBottom: S.md, borderBottomWidth: 1, borderBottomColor: C.divider },
  title: { color: C.onSurface, fontFamily: F.display, fontSize: 22, letterSpacing: 1 },
  filters: { paddingHorizontal: S.lg, paddingTop: S.md, borderBottomWidth: 1, borderBottomColor: C.divider, paddingBottom: S.sm },
  filterRow: { gap: S.sm, paddingBottom: S.sm },
  chip: { height: 32, paddingHorizontal: S.md, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", flexShrink: 0, backgroundColor: C.surfaceSecondary },
  chipActive: { backgroundColor: C.brand, borderColor: C.brand },
  chipTxt: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 13 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: S.md },
  statCard: { width: "47.5%", gap: S.xs },
  statVal: { color: C.onSurface, fontFamily: F.display, fontSize: 26 },
  statLabel: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, textTransform: "uppercase" },
  section: { color: C.onSurfaceSecondary, fontFamily: F.textBold, fontSize: 13, letterSpacing: 1, marginTop: S.xl, marginBottom: S.sm },
  chartLatest: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, marginTop: S.sm },
  row: { flexDirection: "row", alignItems: "center", gap: S.md, marginBottom: S.sm, paddingVertical: S.md },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowName: { color: C.onSurface, fontFamily: F.text, fontSize: 15 },
  rowMeta: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, marginTop: 2 },
  rowQty: { color: C.onSurface, fontFamily: F.textBold, fontSize: 14 },
  empty: { color: C.onSurfaceTertiary, fontFamily: F.text },
});
