import React, { useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Modal, useWindowDimensions, Platform } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useColors, useT } from "@/src/appsettings";
import { money } from "@/src/currency";
import { F, S, R, Palette } from "@/src/theme";
import { Card, Btn } from "@/src/components/ui";
import { StockLineChart } from "@/src/components/StockLineChart";

export default function Orders() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { currency, user } = useAuth();
  const C = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [data, setData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [filterWh, setFilterWh] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<string | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [marking, setMarking] = useState(false);
  const [selWarehouse, setSelWarehouse] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [insight, setInsight] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [emailModal, setEmailModal] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [sugg, hist, wh, pos, cats] = await Promise.all([
        api("/reports/reorder-suggestions"), api("/reports/stock-history"),
        api("/warehouses"), api("/purchase-orders"), api("/categories"),
      ]);
      setData(sugg); setHistory(hist.history || []); setWarehouses(wh); setOrders(pos); setCategories(cats);
      setSelWarehouse((w) => w || wh[0]?.id || null);
    } catch {} finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function getAi() {
    setAiLoading(true);
    try { const r = await api("/reports/ai-insights"); setInsight(r.insight); } catch {} finally { setAiLoading(false); }
  }

  // Build flattened per-warehouse rows honoring warehouse + category filters
  async function buildRows() {
    const [products, cats, sups] = await Promise.all([
      api<any[]>("/products"), api<any[]>("/categories"), api<any[]>("/suppliers"),
    ]);
    const catMap: Record<string, string> = Object.fromEntries(cats.map((c) => [c.id, c.name]));
    const supMap: Record<string, string> = Object.fromEntries(sups.map((s) => [s.id, s.name]));
    const whMap: Record<string, string> = Object.fromEntries(warehouses.map((w) => [w.id, w.name]));
    const rows: any[] = [];
    products.forEach((p) => {
      if (filterCat && p.category_id !== filterCat) return;
      const stock: Record<string, number> = p.stock || {};
      let wids = Object.keys(stock);
      if (filterWh) wids = wids.includes(filterWh) ? [filterWh] : [];
      if (wids.length === 0 && !filterWh) wids = [""]; // product with no stock entries
      wids.forEach((wid) => {
        const qty = wid ? Number(stock[wid] || 0) : 0;
        rows.push({
          name: p.name, sku: p.sku || "", barcode: p.barcode || "",
          category: catMap[p.category_id] || "", supplier: supMap[p.supplier_id] || "",
          warehouse: wid ? (whMap[wid] || "") : "", quantity: qty,
          threshold: p.low_stock_threshold ?? 5, cost: p.cost ?? 0, price: p.price ?? 0, value: (p.cost || 0) * qty,
          purchase_date: (p.purchase_date || "").slice(0, 10),
          best_before_date: (p.best_before_date || "").slice(0, 10),
        });
      });
    });
    return rows;
  }

  async function exportPdf() {
    setExporting(true);
    try {
      const rows = await buildRows();
      const today = new Date().toLocaleDateString();
      const max = Math.max(1, ...history.map((h) => h.value));
      const pts = history.map((h, i) => `${40 + (i / Math.max(1, history.length - 1)) * 700},${250 - (h.value / max) * 200}`).join(" ");
      const totalVal = rows.reduce((s, r) => s + r.value, 0);
      const whLabel = filterWh ? (warehouses.find((w) => w.id === filterWh)?.name || "") : t("allWarehouses");
      const catLabel = filterCat ? (categories.find((c) => c.id === filterCat)?.name || "") : t("all");
      const tableRows = rows.map((r) =>
        `<tr><td>${r.name}</td><td>${r.sku || r.barcode || "-"}</td><td>${r.warehouse || "-"}</td><td style="text-align:right">${r.quantity}</td><td style="text-align:right">${money(r.cost, currency)}</td><td style="text-align:right">${money(r.value, currency)}</td></tr>`
      ).join("");
      const reorder = rows.filter((r) => r.warehouse && r.quantity <= r.threshold)
        .sort((a, b) => (a.warehouse + a.name).localeCompare(b.warehouse + b.name));
      const reorderRows = reorder.map((r) => {
        const suggest = Math.max(r.threshold, r.threshold * 2 - r.quantity);
        return `<tr><td>${r.warehouse}</td><td>${r.name}</td><td>${r.supplier || "-"}</td><td style="text-align:right">${r.quantity}</td><td style="text-align:right">${r.threshold}</td><td style="text-align:right;font-weight:700;color:#E64A19">${suggest}</td></tr>`;
      }).join("");
      const reorderSection = reorder.length
        ? `<h3 style="color:#E64A19">${t("needsReordering")} (${reorder.length})</h3>
           <table><tr><th>${t("warehouse")}</th><th>${t("productName")}</th><th>${t("supplier")}</th><th>${t("quantity")}</th><th>${t("threshold")}</th><th>${t("suggestedOrder")}</th></tr>${reorderRows}</table>`
        : "";
      const html = `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"/>
        <style>body{font-family:-apple-system,Helvetica,Arial;padding:24px;color:#111}h1{color:#E64A19;margin-bottom:0}
        .sub{color:#666;margin-top:4px}.kpi{font-size:28px;font-weight:700;margin:8px 0}
        table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}th,td{border-bottom:1px solid #ddd;padding:6px;text-align:left}
        th{background:#f4f4f4}svg{background:#fafafa;border:1px solid #eee;border-radius:8px}</style></head><body>
        <h1>INVENTMENT — ${t("stockValue")}</h1><div class="sub">${today} · ${user?.name || ""}</div>
        <div class="sub">${t("warehouse")}: ${whLabel} · ${t("category")}: ${catLabel}</div>
        <div class="kpi">${t("stockValue")}: ${money(totalVal, currency)}</div>
        <h3>${t("stockValue15")}</h3>
        <svg width="780" height="280" viewBox="0 0 780 280"><line x1="40" y1="250" x2="740" y2="250" stroke="#ccc"/>
        <polyline points="${pts}" fill="none" stroke="#E64A19" stroke-width="3"/>
        ${history.map((h, i) => { const x = 40 + (i / Math.max(1, history.length - 1)) * 700; return `<text x="${x}" y="270" font-size="9" text-anchor="middle" fill="#888">${h.month.slice(2)}</text>`; }).join("")}</svg>
        ${reorderSection}
        <h3>${t("products")}</h3><table><tr><th>${t("productName")}</th><th>${t("sku")}</th><th>${t("warehouse")}</th><th>${t("quantity")}</th><th>${t("cost")}</th><th>${t("stockValue")}</th></tr>${tableRows}</table></body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "INVENTMENT Report" });
    } catch {} finally { setExporting(false); }
  }

  async function exportCsv() {
    setExportingCsv(true);
    try {
      const rows = await buildRows();
      const esc = (v: any) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const headers = [t("productName"), t("sku"), t("barcode"), t("category"), t("supplier"), t("warehouse"), t("quantity"), t("cost"), t("price"), t("stockValue"), t("purchaseDate"), t("bestBefore")];
      const lines = [headers.join(",")];
      rows.forEach((r) => {
        lines.push([r.name, r.sku, r.barcode, r.category, r.supplier, r.warehouse, r.quantity, r.cost, r.price, r.value, r.purchase_date, r.best_before_date].map(esc).join(","));
      });
      const csv = "\uFEFF" + lines.join("\n");
      const filename = `INVENTMENT_stock_${new Date().toISOString().slice(0, 10)}.csv`;
      if (Platform.OS === "web") {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
      } else {
        const uri = FileSystem.cacheDirectory + filename;
        await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "INVENTMENT Stock CSV" });
      }
    } catch {} finally { setExportingCsv(false); }
  }

  async function draftEmail() {
    const ids = data.suggestions.map((s: any) => s.product_id);
    const supplierId = data.suggestions.find((s: any) => s.supplier_id)?.supplier_id;
    const po = await api("/purchase-orders", { method: "POST", body: { product_ids: ids, supplier_id: supplierId, warehouse_id: selWarehouse } });
    setEmailModal(po); setCopied(false); await load();
  }

  async function markSent() {
    if (!emailModal?.id) return;
    setMarking(true);
    try { await api(`/purchase-orders/${emailModal.id}/sent`, { method: "PUT" }); await load(); setEmailModal(null); }
    finally { setMarking(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + S.md }]}>
        <Text style={styles.title}>{t("purchaseOrders")}</Text>
        <Text style={styles.sub}>{t("reorderSubtitle")}</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 120 }}>
          <Card style={{ marginBottom: S.lg }}>
            <View style={styles.chartHead}>
              <Text style={styles.aiTitle}>{t("stockValue15")}</Text>
              <View style={styles.exportRow}>
                <Pressable testID="export-csv-btn" onPress={exportCsv} disabled={exportingCsv} style={styles.pdfBtn}>
                  {exportingCsv ? <ActivityIndicator color={C.brand} size="small" /> : (
                    <><MaterialCommunityIcons name="file-delimited-outline" size={16} color={C.brand} /><Text style={styles.pdfTxt}>{t("exportCsv")}</Text></>
                  )}
                </Pressable>
                <Pressable testID="export-pdf-btn" onPress={exportPdf} disabled={exporting} style={styles.pdfBtn}>
                  {exporting ? <ActivityIndicator color={C.brand} size="small" /> : (
                    <><MaterialCommunityIcons name="file-pdf-box" size={16} color={C.brand} /><Text style={styles.pdfTxt}>{t("exportPdf")}</Text></>
                  )}
                </Pressable>
              </View>
            </View>
            {history.length > 0 && <StockLineChart data={history} width={width - 2 * S.lg - 2 * S.lg} />}
            <Text style={styles.chartLatest}>{t("latest")}: {money(history[history.length - 1]?.value || 0, currency)}</Text>
            {(warehouses.length > 1 || categories.length > 0) && (
              <View style={styles.filterWrap}>
                <Text style={styles.filterLabel}>{t("exportFilters")}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                  <Pressable testID="filter-wh-all" onPress={() => setFilterWh(null)} style={[styles.filterChip, !filterWh && styles.filterChipActive]}>
                    <Text style={[styles.filterTxt, !filterWh && { color: C.onBrand }]}>{t("allWarehouses")}</Text>
                  </Pressable>
                  {warehouses.map((w) => (
                    <Pressable key={w.id} testID={`filter-wh-${w.id}`} onPress={() => setFilterWh(w.id)} style={[styles.filterChip, filterWh === w.id && styles.filterChipActive]}>
                      <Text style={[styles.filterTxt, filterWh === w.id && { color: C.onBrand }]}>{w.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                {categories.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                    <Pressable testID="filter-cat-all" onPress={() => setFilterCat(null)} style={[styles.filterChip, !filterCat && styles.filterChipActive]}>
                      <Text style={[styles.filterTxt, !filterCat && { color: C.onBrand }]}>{t("all")}</Text>
                    </Pressable>
                    {categories.map((c) => (
                      <Pressable key={c.id} testID={`filter-cat-${c.id}`} onPress={() => setFilterCat(c.id)} style={[styles.filterChip, filterCat === c.id && styles.filterChipActive]}>
                        <Text style={[styles.filterTxt, filterCat === c.id && { color: C.onBrand }]}>{c.name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}
          </Card>

          <Card style={{ marginBottom: S.lg }}>
            <View style={styles.aiHead}>
              <MaterialCommunityIcons name="robot-outline" size={20} color={C.brand} />
              <Text style={styles.aiTitle}>{t("aiInsight")}</Text>
            </View>
            {insight ? <Text style={styles.aiTxt}>{insight}</Text> : (
              <Btn testID="ai-insight-btn" title={t("generateAi")} variant="secondary" loading={aiLoading} onPress={getAi} icon="lightning-bolt" />
            )}
          </Card>

          <View style={styles.totalRow}>
            <Text style={styles.section}>{t("suggestedReorders")}</Text>
            <Text style={styles.totalCost}>{t("est")} {money(data.total_estimated_cost, currency)}</Text>
          </View>

          {data.suggestions.length === 0 ? (
            <View style={styles.emptyWrap}>
              <MaterialCommunityIcons name="clipboard-check-outline" size={56} color={C.surfaceTertiary} />
              <Text style={styles.emptyTxt}>{t("noPending")}</Text>
              <Text style={styles.emptySub}>{t("aboveThresholds")}</Text>
            </View>
          ) : (
            data.suggestions.map((s: any) => (
              <Card key={s.product_id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rName}>{s.name}</Text>
                  <Text style={styles.rMeta}>{t("have")} {s.current_qty} · {t("order")} {s.suggested_qty} · {s.supplier_name || t("noSupplier")}</Text>
                </View>
                <Text style={styles.rCost}>{money(s.estimated_cost, currency)}</Text>
              </Card>
            ))
          )}

          <Text style={styles.section}>{t("orderHistory")}</Text>
          {orders.length === 0 ? (
            <Card><Text style={styles.empty}>{t("noPos")}</Text></Card>
          ) : (
            orders.map((po: any) => (
              <Card key={po.id} style={styles.poRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rName}>{po.supplier_name || t("supplier")} · {po.items?.length || 0} {t("items")}</Text>
                  <Text style={styles.rMeta}>{(po.created_at || "").slice(0, 10)} · {money(po.total, currency)}{po.warehouse_name ? ` · ${po.warehouse_name}` : ""}</Text>
                </View>
                <View style={[styles.badge, { borderColor: po.status === "sent" ? C.success : C.warning }]}>
                  <Text style={[styles.badgeTxt, { color: po.status === "sent" ? C.success : C.warning }]}>{po.status === "sent" ? t("statusSent") : t("statusDraft")}</Text>
                </View>
              </Card>
            ))
          )}
        </ScrollView>
      )}

      {data?.suggestions?.length > 0 && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + S.sm }]}>
          {warehouses.length > 0 && (
            <>
              <Text style={styles.deliverLabel}>{t("deliverTo")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.whRow}>
                {warehouses.map((w) => (
                  <Pressable key={w.id} testID={`wh-${w.id}`} onPress={() => setSelWarehouse(w.id)}
                    style={[styles.whChip, selWarehouse === w.id && styles.whChipActive]}>
                    <Text style={[styles.whTxt, selWarehouse === w.id && { color: C.onBrand }]}>{w.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}
          <Btn testID="draft-email-btn" title={t("draftEmailSupplier")} icon="email-outline" onPress={draftEmail} />
        </View>
      )}

      <Modal visible={!!emailModal} transparent animationType="slide" onRequestClose={() => setEmailModal(null)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + S.lg }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>{t("poEmail")}</Text>
            <Text style={styles.emailLabel}>{t("to")}: {emailModal?.supplier_email || t("noSupplierEmail")}</Text>
            <Text style={styles.emailLabel}>{t("subject")}: {emailModal?.email_subject}</Text>
            <ScrollView style={styles.emailBody}>
              <Text style={styles.emailBodyTxt}>{emailModal?.email_body}</Text>
            </ScrollView>
            <Btn testID="copy-email-btn" title={copied ? t("copied") : t("copyEmail")} variant="secondary" icon="content-copy"
              onPress={async () => { await Clipboard.setStringAsync(emailModal?.email_body || ""); setCopied(true); }} />
            {emailModal?.status !== "sent" && (
              <Btn testID="mark-sent-btn" title={t("markAsSent")} icon="check-circle-outline" loading={marking} onPress={markSent} style={{ marginTop: S.sm }} />
            )}
            <Pressable testID="close-email-modal" onPress={() => setEmailModal(null)} style={styles.closeBtn}>
              <Text style={styles.closeTxt}>{t("close")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  header: { paddingHorizontal: S.lg, paddingBottom: S.md, borderBottomWidth: 1, borderBottomColor: C.divider },
  title: { color: C.onSurface, fontFamily: F.display, fontSize: 26, letterSpacing: 1 },
  sub: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13 },
  aiHead: { flexDirection: "row", alignItems: "center", gap: S.sm, marginBottom: S.md },
  chartHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: S.sm },
  exportRow: { flexDirection: "row", alignItems: "center", gap: S.sm },
  pdfBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: C.border, borderRadius: R.sm, paddingHorizontal: S.sm, paddingVertical: 6 },
  pdfTxt: { color: C.brand, fontFamily: F.textBold, fontSize: 12 },
  chartLatest: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, marginTop: S.xs },
  filterWrap: { marginTop: S.md, borderTopWidth: 1, borderTopColor: C.divider, paddingTop: S.md },
  filterLabel: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 11, letterSpacing: 0.5, marginBottom: S.sm },
  filterRow: { gap: S.sm, paddingBottom: S.sm },
  filterChip: { height: 30, paddingHorizontal: S.md, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", flexShrink: 0, backgroundColor: C.surface },
  filterChipActive: { backgroundColor: C.brand, borderColor: C.brand },
  filterTxt: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 12 },
  aiTitle: { color: C.onSurface, fontFamily: F.textBold, fontSize: 15 },
  aiTxt: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 14, lineHeight: 21 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: S.sm },
  section: { color: C.onSurfaceSecondary, fontFamily: F.textBold, fontSize: 13, letterSpacing: 1 },
  totalCost: { color: C.success, fontFamily: F.display, fontSize: 18 },
  row: { flexDirection: "row", alignItems: "center", marginBottom: S.sm },
  rName: { color: C.onSurface, fontFamily: F.textBold, fontSize: 15 },
  rMeta: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, marginTop: 2 },
  rCost: { color: C.brand, fontFamily: F.display, fontSize: 18 },
  poRow: { flexDirection: "row", alignItems: "center", marginBottom: S.sm },
  badge: { paddingHorizontal: S.sm, paddingVertical: 4, borderRadius: R.sm, borderWidth: 1 },
  badgeTxt: { fontFamily: F.textBold, fontSize: 11, letterSpacing: 0.5 },
  empty: { color: C.onSurfaceTertiary, fontFamily: F.text },
  emptyWrap: { alignItems: "center", marginTop: 60, gap: S.sm },
  emptyTxt: { color: C.onSurface, fontFamily: F.textBold, fontSize: 16 },
  emptySub: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: S.lg, paddingTop: S.sm, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.divider },
  deliverLabel: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 11, letterSpacing: 0.5, marginBottom: S.xs },
  whRow: { gap: S.sm, paddingBottom: S.sm },
  whChip: { height: 34, paddingHorizontal: S.md, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", flexShrink: 0, backgroundColor: C.surfaceSecondary },
  whChipActive: { backgroundColor: C.brand, borderColor: C.brand },
  whTxt: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 13 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: C.surfaceSecondary, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, padding: S.lg, maxHeight: "85%" },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.surfaceTertiary, alignSelf: "center", marginBottom: S.md },
  modalTitle: { color: C.onSurface, fontFamily: F.display, fontSize: 22, marginBottom: S.sm },
  emailLabel: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13, marginBottom: 2 },
  emailBody: { maxHeight: 240, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.sm, padding: S.md, marginVertical: S.md },
  emailBodyTxt: { color: C.onSurface, fontFamily: F.text, fontSize: 13, lineHeight: 20 },
  closeBtn: { alignItems: "center", paddingVertical: S.md },
  closeTxt: { color: C.onSurfaceTertiary, fontFamily: F.textBold },
});
