import React, { useState, useEffect, useMemo, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useColors, useT } from "@/src/appsettings";
import { money } from "@/src/currency";
import { F, S, R, stockColor, Palette } from "@/src/theme";
import { Card } from "@/src/components/ui";
import { StockLineChart } from "@/src/components/StockLineChart";

type Mode = "value" | "units" | "products" | "low";

export default function WarehouseOverview() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currency } = useAuth();
  const C = useColors();
  const t = useT();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ warehouse_id?: string; mode?: string }>();
  const styles = useMemo(() => makeStyles(C), [C]);

  const mode: Mode = (["value", "units", "products", "low"].includes(params.mode || "") ? params.mode : "value") as Mode;
  const [activeWh, setActiveWh] = useState<string | null>(params.warehouse_id || null);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [data, setData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const wq = activeWh ? `?warehouse_id=${activeWh}` : "";
      const reqs: Promise<any>[] = [
        api(`/dashboard${wq}`),
        api<any[]>("/warehouses"),
        api<any[]>("/products"),
        api<any[]>("/categories"),
      ];
      // Only the value/units modes need a time-series graph.
      if (mode === "value" || mode === "units") {
        const m = mode === "units" ? `${wq ? "&" : "?"}metric=units` : "";
        reqs.push(api<{ history: any[] }>(`/reports/stock-history${wq}${m}`));
      }
      const [d, w, p, cats, hist] = await Promise.all(reqs);
      setData(d); setWarehouses(w); setProducts(p); setCategories(cats);
      setHistory(hist?.history || []);
    } catch {} finally { setLoading(false); }
  }, [activeWh, mode]);
  useEffect(() => { load(); }, [load]);

  // Products for the chosen warehouse (with the per-warehouse quantity)
  const visibleProducts = useMemo(() => {
    if (!activeWh) {
      return products.map((p) => ({ ...p, whQty: p.quantity ?? Object.values(p.stock || {}).reduce((a: any, b: any) => a + b, 0) }));
    }
    return products
      .filter((p) => p.stock && Object.prototype.hasOwnProperty.call(p.stock, activeWh))
      .map((p) => ({ ...p, whQty: (p.stock || {})[activeWh] || 0 }));
  }, [products, activeWh]);

  const lowProducts = useMemo(
    () => visibleProducts.filter((p) => p.whQty <= (p.low_stock_threshold ?? 5)),
    [visibleProducts]
  );

  // Top 5 categories — by product count or by total units (reflecting chosen warehouse)
  const [catMetric, setCatMetric] = useState<"count" | "units">("count");
  const catChart = useMemo(() => {
    const agg: Record<string, number> = {};
    for (const p of visibleProducts) {
      const cid = p.category_id || "__none";
      agg[cid] = (agg[cid] || 0) + (catMetric === "units" ? (p.whQty || 0) : 1);
    }
    return Object.entries(agg)
      .map(([cid, count]) => ({ name: cid === "__none" ? "—" : (categories.find((c) => c.id === cid)?.name || "—"), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [visibleProducts, categories, catMetric]);

  const titleKey = mode === "units" ? "totalUnits" : mode === "products" ? "products" : mode === "low" ? "lowStock" : "stockValue";
  const headlineValue = !data ? "—"
    : mode === "value" ? money(data.stock_value, currency)
    : mode === "units" ? `${data.total_units}`
    : mode === "products" ? `${data.total_products}`
    : `${data.low_stock_count}`;

  const chartW = width - S.lg * 2 - S.lg * 2;
  const fmtAxis = (v: number) => (v >= 1000 ? `${+(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `${Math.round(v)}`);
  const list = mode === "low" ? lowProducts : visibleProducts;

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Pressable testID="wo-back" onPress={() => router.back()} hitSlop={10}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={C.onSurface} />
        </Pressable>
        <Text style={styles.title}>{t(titleKey)}</Text>
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
          {/* Headline total */}
          <Card style={styles.totalCard}>
            <Text style={styles.totalLabel}>{t(titleKey)}</Text>
            <Text testID="wo-total" style={styles.totalVal}>{headlineValue}</Text>
          </Card>

          {/* Time-series graph for value & units */}
          {(mode === "value" || mode === "units") && (
            <>
              <Text style={styles.section}>{mode === "units" ? t("totalUnits") : t("stockValue15")}</Text>
              <Card>
                <StockLineChart data={history} width={chartW} height={200} showGrid formatValue={fmtAxis} />
                <Text style={styles.chartLatest}>
                  {t("latest")}: {mode === "value" ? money(history[history.length - 1]?.value || 0, currency) : `${history[history.length - 1]?.value || 0}`}
                </Text>
              </Card>
            </>
          )}

          {/* Top categories bar chart for products mode */}
          {mode === "products" && (
            <>
              <View style={styles.catHeaderRow}>
                <Text style={[styles.section, { marginBottom: 0 }]}>{t("categories")}</Text>
                <View style={styles.toggle}>
                  <Pressable testID="cat-toggle-count" onPress={() => setCatMetric("count")} style={[styles.toggleBtn, catMetric === "count" && styles.toggleBtnActive]}>
                    <Text style={[styles.toggleTxt, catMetric === "count" && { color: C.onBrand }]}>{t("products")}</Text>
                  </Pressable>
                  <Pressable testID="cat-toggle-units" onPress={() => setCatMetric("units")} style={[styles.toggleBtn, catMetric === "units" && styles.toggleBtnActive]}>
                    <Text style={[styles.toggleTxt, catMetric === "units" && { color: C.onBrand }]}>{t("totalUnits")}</Text>
                  </Pressable>
                </View>
              </View>
              <Card>
                {catChart.length === 0 ? (
                  <Text style={styles.empty}>{t("noProducts")}</Text>
                ) : (
                  catChart.map((c, i) => {
                    const maxC = Math.max(1, ...catChart.map((x) => x.count));
                    return (
                      <View key={i} style={styles.barRow}>
                        <Text style={styles.barLabel} numberOfLines={1}>{c.name}</Text>
                        <View style={styles.barTrack}>
                          <View style={[styles.barFill, { width: `${(c.count / maxC) * 100}%` }]} />
                        </View>
                        <Text style={styles.barVal}>{c.count}</Text>
                      </View>
                    );
                  })
                )}
              </Card>
            </>
          )}

          {/* Product rows (everything except value mode) */}
          {mode !== "value" && (
            <>
              <Text style={styles.section}>{mode === "low" ? t("lowStockAlerts") : `${t("allProducts")} · ${list.length}`}</Text>
              {list.length === 0 ? (
                <Card><Text style={styles.empty}>{mode === "low" ? t("allHealthy") : t("noProducts")}</Text></Card>
              ) : (
                list.map((p) => (
                  <Pressable key={p.id} testID={`wo-product-${p.id}`} onPress={() => router.push(`/product/${p.id}`)}>
                    <Card style={styles.row}>
                      <View style={[styles.dot, { backgroundColor: stockColor(p.whQty, p.low_stock_threshold, C) }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowName} numberOfLines={1}>{p.name}</Text>
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          {money((p.cost || 0) * p.whQty, currency)}{p.sku ? `  ·  ${p.sku}` : ""}
                        </Text>
                      </View>
                      <Text style={styles.rowQty}>{p.whQty} {t("left")}</Text>
                    </Card>
                  </Pressable>
                ))
              )}
            </>
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
  totalCard: { alignItems: "center", gap: S.xs, paddingVertical: S.lg },
  totalLabel: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, textTransform: "uppercase", letterSpacing: 1 },
  totalVal: { color: C.onSurface, fontFamily: F.display, fontSize: 40 },
  section: { color: C.onSurfaceSecondary, fontFamily: F.textBold, fontSize: 13, letterSpacing: 1, marginTop: S.xl, marginBottom: S.sm },
  catHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: S.xl, marginBottom: S.sm },
  toggle: { flexDirection: "row", borderWidth: 1, borderColor: C.border, borderRadius: R.pill, overflow: "hidden" },
  toggleBtn: { paddingHorizontal: S.md, paddingVertical: 5, backgroundColor: C.surfaceSecondary },
  toggleBtnActive: { backgroundColor: C.brand },
  toggleTxt: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 11 },
  chartLatest: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, marginTop: S.sm },
  barRow: { flexDirection: "row", alignItems: "center", gap: S.sm, marginVertical: S.xs },
  barLabel: { width: 80, color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 12 },
  barTrack: { flex: 1, height: 16, borderRadius: R.sm, backgroundColor: C.surfaceSecondary, overflow: "hidden" },
  barFill: { height: 16, borderRadius: R.sm, backgroundColor: C.brand },
  barVal: { width: 28, textAlign: "right", color: C.onSurface, fontFamily: F.textBold, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: S.md, marginBottom: S.sm, paddingVertical: S.md },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowName: { color: C.onSurface, fontFamily: F.text, fontSize: 15 },
  rowMeta: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, marginTop: 2 },
  rowQty: { color: C.onSurface, fontFamily: F.textBold, fontSize: 14 },
  empty: { color: C.onSurfaceTertiary, fontFamily: F.text },
});
