import React, { useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useColors, useT } from "@/src/appsettings";
import { money } from "@/src/currency";
import { useResponsive } from "@/src/hooks/useResponsive";
import { F, S, R, stockColor, Palette } from "@/src/theme";
import { Card, StatusDot } from "@/src/components/ui";

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const { user, currency } = useAuth();
  const { isDesktop } = useResponsive();
  const C = useColors();
  const t = useT();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [data, setData] = useState<any>(null);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [activeWh, setActiveWh] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const wq = activeWh ? `?warehouse_id=${activeWh}` : "";
      const [d, w] = await Promise.all([api(`/dashboard${wq}`), api<any[]>("/warehouses")]);
      setData(d); setWarehouses(w);
    } catch {} finally { setLoading(false); }
  }, [activeWh]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const stats = [
    { label: t("stockValue"), value: data ? money(data.stock_value, currency) : "—", icon: "cash-multiple", color: C.success, mode: "value" },
    { label: t("totalUnits"), value: data ? data.total_units : "—", icon: "cube-outline", color: C.info, mode: "units" },
    { label: t("products"), value: data ? data.total_products : "—", icon: "package-variant", color: C.brand, mode: "products" },
    { label: t("lowStock"), value: data ? data.low_stock_count : "—", icon: "alert", color: C.warning, mode: "low" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + S.md }]}>
        <Text style={styles.hi}>{t("welcomeBack")}</Text>
        <Text style={styles.name}>{user?.name || t("operator")}</Text>
        {warehouses.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.whChipRow}>
            <Pressable testID="dash-wh-all" onPress={() => setActiveWh(null)} style={[styles.whChip, !activeWh && styles.whChipActive]}>
              <Text style={[styles.whTxt, !activeWh && { color: C.onBrand }]}>{t("allWarehouses")}</Text>
            </Pressable>
            {warehouses.map((w) => (
              <Pressable key={w.id} testID={`dash-wh-${w.id}`} onPress={() => setActiveWh(w.id)} style={[styles.whChip, activeWh === w.id && styles.whChipActive]}>
                <Text style={[styles.whTxt, activeWh === w.id && { color: C.onBrand }]}>{w.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
      {loading ? (
        <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: S.lg, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={C.brand} />}
          testID="dashboard-scroll"
        >
          {data.low_stock_count > 0 && (
            <View testID="low-stock-warning" style={styles.warnBanner}>
              <MaterialCommunityIcons name="alert-octagon" size={22} color={C.warning} />
              <View style={{ flex: 1 }}>
                <Text style={styles.warnTitle}>{t("lowStockWarning")}</Text>
                <Text style={styles.warnText}>{data.low_stock_count} {t("productsAtThreshold")}</Text>
                <Pressable testID="place-order-btn" onPress={() => router.push("/place-order")} style={styles.warnBtn}>
                  <MaterialCommunityIcons name="clipboard-plus-outline" size={16} color={C.onBrand} />
                  <Text style={styles.warnBtnTxt}>{t("placeOrder")}</Text>
                </Pressable>
              </View>
            </View>
          )}
          <View style={styles.grid}>
            {stats.map((s) => (
              <Pressable
                key={s.label}
                testID={`stat-${s.icon}`}
                style={[styles.statCard, isDesktop && styles.statCardDesktop]}
                onPress={() => {
                  const w = activeWh ? `&warehouse_id=${activeWh}` : "";
                  router.push(`/warehouse-overview?mode=${s.mode}${w}`);
                }}>
                <Card style={{ gap: S.xs }}>
                  <MaterialCommunityIcons name={s.icon as any} size={22} color={s.color} />
                  <Text style={styles.statVal}>{s.value}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </Card>
              </Pressable>
            ))}
          </View>

          <Pressable testID="stocktaking-btn" onPress={() => router.push("/stocktakes")} style={styles.actionBtn}>
            <MaterialCommunityIcons name="clipboard-list-outline" size={20} color={C.onBrand} />
            <Text style={styles.actionTxt}>{t("stocktaking")}</Text>
            <MaterialCommunityIcons name="chevron-right" size={22} color={C.onBrand} />
          </Pressable>

          <Text style={styles.section}>{t("lowStockAlerts")}</Text>
          {data.low_stock_items.length === 0 ? (
            <Card><Text style={styles.empty}>{t("allHealthy")}</Text></Card>
          ) : (
            data.low_stock_items.map((p: any) => (
              <Card key={p.id} style={styles.row}>
                <StatusDot color={stockColor(p.quantity, p.low_stock_threshold, C)} />
                <Text style={styles.rowName} numberOfLines={1}>{p.name}{p.warehouse_name ? `  ·  ${p.warehouse_name}` : ""}</Text>
                <Text style={styles.rowQty}>{p.quantity} {t("left")}</Text>
              </Card>
            ))
          )}

          {data.expiring_count > 0 && (
            <>
              <Text style={styles.section}>{t("expiringSoon")}</Text>
              {data.expiring_items.map((p: any) => (
                <Card key={p.id} style={styles.row}>
                  <MaterialCommunityIcons name="clock-alert-outline" size={16} color={C.warning} />
                  <Text style={styles.rowName} numberOfLines={1}>{p.name}</Text>
                  <Text style={[styles.rowQty, { color: C.warning }]}>{p.best_before_date?.slice(0, 10)}</Text>
                </Card>
              ))}
            </>
          )}

          <View style={styles.sectionRow}>
            <Text style={styles.section}>{t("recentActivity")}</Text>
            <Pressable testID="view-all-movements" onPress={() => router.push("/movements")} hitSlop={8}>
              <Text style={styles.viewAll}>{t("viewAll")}</Text>
            </Pressable>
          </View>
          {data.recent_movements.length === 0 ? (
            <Card><Text style={styles.empty}>{t("noMovements")}</Text></Card>
          ) : (
            data.recent_movements.map((m: any) => (
              <Card key={m.id} style={styles.row}>
                <MaterialCommunityIcons
                  name={m.type === "receive" ? "arrow-down-bold-circle" : m.type === "remove" ? "arrow-up-bold-circle" : "sync"}
                  size={16} color={m.type === "receive" ? C.success : C.brand} />
                <Text style={styles.rowName} numberOfLines={1}>{m.product_name}</Text>
                <Text style={styles.rowQty}>{t(m.type)} · {m.resulting_qty}</Text>
              </Card>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  header: { paddingHorizontal: S.lg, paddingBottom: S.md, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.divider },
  hi: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13 },
  name: { color: C.onSurface, fontFamily: F.display, fontSize: 26, letterSpacing: 0.5 },
  whChipRow: { gap: S.sm, paddingTop: S.md },
  whChip: { height: 32, paddingHorizontal: S.md, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", flexShrink: 0, backgroundColor: C.surfaceSecondary },
  whChipActive: { backgroundColor: C.brand, borderColor: C.brand },
  whTxt: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 12 },
  warnBanner: { flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: C.isDark ? "rgba(255,234,0,0.08)" : "rgba(230,149,0,0.12)", borderWidth: 1, borderColor: C.warning, borderRadius: R.md, padding: S.md, marginBottom: S.lg },
  warnTitle: { color: C.warning, fontFamily: F.textBold, fontSize: 14 },
  warnText: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 12, marginTop: 2 },
  warnBtn: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, backgroundColor: C.brand, paddingHorizontal: S.md, paddingVertical: 8, borderRadius: R.md, marginTop: S.sm },
  warnBtnTxt: { color: C.onBrand, fontFamily: F.textBold, fontSize: 13 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: S.md },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: S.sm, backgroundColor: C.brand, borderRadius: R.md, paddingHorizontal: S.lg, height: 54, marginTop: S.lg },
  actionTxt: { flex: 1, color: C.onBrand, fontFamily: F.textBold, fontSize: 16 },
  statCard: { width: "47.5%", gap: S.xs },
  statCardDesktop: { width: "23%" },
  statVal: { color: C.onSurface, fontFamily: F.display, fontSize: 28 },
  statLabel: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, textTransform: "uppercase" },
  section: { color: C.onSurfaceSecondary, fontFamily: F.textBold, fontSize: 13, letterSpacing: 1, marginTop: S.xl, marginBottom: S.sm },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: S.xl, marginBottom: S.sm },
  viewAll: { color: C.brand, fontFamily: F.textBold, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: S.md, marginBottom: S.sm, paddingVertical: S.md },
  rowName: { flex: 1, color: C.onSurface, fontFamily: F.text, fontSize: 15 },
  rowQty: { color: C.onSurfaceTertiary, fontFamily: F.textBold, fontSize: 13 },
  empty: { color: C.onSurfaceTertiary, fontFamily: F.text },
});
