import React, { useState, useEffect, useMemo, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, useWindowDimensions, Platform, Alert, TextInput } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useColors, useT } from "@/src/appsettings";
import { money } from "@/src/currency";
import { LOGO_DATA_URI } from "@/src/logoBase64";
import { F, S, R, stockColor, Palette } from "@/src/theme";
import { Card } from "@/src/components/ui";
import { StockLineChart } from "@/src/components/StockLineChart";

type Mode = "value" | "units" | "products" | "low";

export default function WarehouseOverview() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currency, user, company } = useAuth();
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
  const [asOfDate, setAsOfDate] = useState("");
  const [filterCat, setFilterCat] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

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
        const m = mode === "units" ? "metric=units" : "";
        const validD = /^\d{4}-\d{2}-\d{2}$/.test(asOfDate) && !isNaN(Date.parse(asOfDate));
        const e = mode === "value" && validD ? `end=${asOfDate}` : "";
        const qs = [m, e].filter(Boolean).join("&");
        reqs.push(api<{ history: any[] }>(`/reports/stock-history${wq}${qs ? (wq ? "&" : "?") + qs : ""}`));
      }
      const [d, w, p, cats, hist] = await Promise.all(reqs);
      setData(d); setWarehouses(w); setProducts(p); setCategories(cats);
      setHistory(hist?.history || []);
    } catch {} finally { setLoading(false); }
  }, [activeWh, mode, asOfDate]);
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

  const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
  function guardDate(): boolean {
    if (asOfDate && !validDate(asOfDate)) {
      if (Platform.OS === "web" && typeof window !== "undefined") window.alert(t("invalidDate"));
      else Alert.alert(t("invalidDate"), "");
      return false;
    }
    return true;
  }
  async function buildRows() {
    const [prods, cats, sups] = await Promise.all([
      asOfDate ? api<any>(`/reports/stock-at-date?date=${asOfDate}`).then((r) => r.products || []) : api<any[]>("/products"),
      api<any[]>("/categories"), api<any[]>("/suppliers"),
    ]);
    const catMap: Record<string, string> = Object.fromEntries(cats.map((c: any) => [c.id, c.name]));
    const supMap: Record<string, string> = Object.fromEntries(sups.map((s: any) => [s.id, s.name]));
    const whMap: Record<string, string> = Object.fromEntries(warehouses.map((w: any) => [w.id, w.name]));
    const rows: any[] = [];
    prods.forEach((p: any) => {
      if (filterCat && p.category_id !== filterCat) return;
      const stock: Record<string, number> = p.stock || {};
      let wids = Object.keys(stock);
      if (activeWh) wids = wids.includes(activeWh) ? [activeWh] : [];
      if (wids.length === 0 && !activeWh) wids = [""];
      wids.forEach((wid) => {
        const qty = wid ? Number(stock[wid] || 0) : 0;
        rows.push({ name: p.name, sku: p.sku || "", barcode: p.barcode || "", category: catMap[p.category_id] || "", supplier: supMap[p.supplier_id] || "", warehouse: wid ? (whMap[wid] || "") : "", quantity: qty, measure: (p.measure_value != null && p.measure_unit) ? `${p.measure_value} ${p.measure_unit}` : "", threshold: p.low_stock_threshold ?? 5, cost: p.cost ?? 0, price: p.price ?? 0, value: (p.cost || 0) * qty, purchase_date: (p.purchase_date || "").slice(0, 10), best_before_date: (p.best_before_date || "").slice(0, 10) });
      });
    });
    return rows;
  }
  async function exportPdf() {
    if (!guardDate()) return;
    setExporting(true);
    try {
      const rows = await buildRows();
      const reportDate = asOfDate || new Date().toISOString().slice(0, 10);
      const dateLabel = asOfDate ? `${t("asOf")} ${reportDate}` : reportDate;
      const mx = Math.max(1, ...history.map((h) => h.value));
      const pts = history.map((h, i) => `${40 + (i / Math.max(1, history.length - 1)) * 700},${250 - (h.value / mx) * 200}`).join(" ");
      const totalVal = rows.reduce((s, r) => s + r.value, 0);
      const whLabel = activeWh ? (warehouses.find((w) => w.id === activeWh)?.name || "") : t("allWarehouses");
      const catLabel = filterCat ? (categories.find((c) => c.id === filterCat)?.name || "") : t("all");
      const tableRows = rows.map((r) => `<tr><td>${r.name}</td><td>${r.sku || r.barcode || "-"}</td><td>${r.warehouse || "-"}</td><td>${r.measure || "-"}</td><td style="text-align:right">${r.quantity}</td><td style="text-align:right">${money(r.cost, currency)}</td><td style="text-align:right">${money(r.value, currency)}</td></tr>`).join("");
      const html = `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"/><style>body{font-family:-apple-system,Helvetica,Arial;padding:24px;color:#111}h1{color:#E64A19;margin-bottom:0}.sub{color:#666;margin-top:4px}.kpi{font-size:28px;font-weight:700;margin:8px 0}table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}th,td{border-bottom:1px solid #ddd;padding:6px;text-align:left}th{background:#f4f4f4}svg{background:#fafafa;border:1px solid #eee;border-radius:8px}</style></head><body>
        <h1>INVENTMENT — ${t("stockValue")}</h1><div class="sub">${dateLabel} · ${user?.name || ""}</div>
        ${company?.company_name ? `<div style="font-size:18px;font-weight:700;color:#111;margin-top:8px">${company.company_name}</div>${[company.street1, company.street2, company.postcode, company.city, company.state, company.county].filter(Boolean).join(", ") ? `<div class="sub">${[company.street1, company.street2, company.postcode, company.city, company.state, company.county].filter(Boolean).join(", ")}</div>` : ""}` : ""}
        <div class="sub">${t("warehouse")}: ${whLabel} · ${t("category")}: ${catLabel}</div>
        ${asOfDate ? `<div class="sub" style="font-style:italic">${t("asOfNote")}</div>` : ""}
        <div class="kpi">${t("stockValue")}: ${money(totalVal, currency)}</div>
        <h3>${t("stockValue15")}</h3>
        <svg width="780" height="280" viewBox="0 0 780 280"><line x1="40" y1="250" x2="740" y2="250" stroke="#ccc"/><polyline points="${pts}" fill="none" stroke="#E64A19" stroke-width="3"/>${history.map((h, i) => { const x = 40 + (i / Math.max(1, history.length - 1)) * 700; return `<text x="${x}" y="270" font-size="9" text-anchor="middle" fill="#888">${h.month.slice(2)}</text>`; }).join("")}</svg>
        <h3>${t("products")}</h3><table><tr><th>${t("productName")}</th><th>${t("sku")}</th><th>${t("warehouse")}</th><th>${t("measure")}</th><th>${t("quantity")}</th><th>${t("cost")}</th><th>${t("stockValue")}</th></tr>${tableRows}</table><div style="text-align:center;margin-top:32px;border-top:1px solid #eee;padding-top:14px"><img src="${LOGO_DATA_URI}" style="height:64px"/></div></body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "INVENTMENT Report" });
    } catch {} finally { setExporting(false); }
  }
  async function exportCsv() {
    if (!guardDate()) return;
    setExportingCsv(true);
    try {
      const rows = await buildRows();
      const esc = (v: any) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const headers = [t("productName"), t("sku"), t("barcode"), t("category"), t("supplier"), t("warehouse"), t("measure"), t("quantity"), t("cost"), t("price"), t("stockValue"), t("purchaseDate"), t("bestBefore")];
      const lines = [headers.join(",")];
      rows.forEach((r) => lines.push([r.name, r.sku, r.barcode, r.category, r.supplier, r.warehouse, r.measure, r.quantity, r.cost, r.price, r.value, r.purchase_date, r.best_before_date].map(esc).join(",")));
      const csv = "\uFEFF" + lines.join("\n");
      const filename = `INVENTMENT_stock_${asOfDate || new Date().toISOString().slice(0, 10)}.csv`;
      if (Platform.OS === "web") {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
      } else {
        const uri = FileSystem.cacheDirectory + filename;
        await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "INVENTMENT Stock CSV" });
      }
    } catch {} finally { setExportingCsv(false); }
  }

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
