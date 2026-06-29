import React, { useState, useCallback, useMemo, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useColors, useT } from "@/src/appsettings";
import { F, S, R, Palette } from "@/src/theme";
import { Card } from "@/src/components/ui";
import { StatusLineChart } from "@/src/components/StatusLineChart";

const STATUSES = ["saved", "picked", "shipped", "returned"] as const;
const STATUS_COLORS: Record<string, string> = { saved: "#29B6F6", picked: "#FFB300", shipped: "#66BB6A", returned: "#EF5350" };

export default function SalesOrdersList() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const C = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [chart, setChart] = useState<{ months: string[]; series: Record<string, number[]> } | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [status, setStatus] = useState<typeof STATUSES[number]>("saved");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"date" | "order_number" | "field1" | "field2">("date");
  const [loading, setLoading] = useState(true);

  const label1 = user?.so_field1_label || "Field 1";
  const label2 = user?.so_field2_label || "Field 2";
  const statusLabel: Record<string, string> = { saved: t("stSaved"), picked: t("stPicked"), shipped: t("stShipped"), returned: t("stReturned") };

  const loadChart = useCallback(async () => {
    try { setChart(await api("/sales-orders/chart")); } catch {}
  }, []);
  const loadList = useCallback(async () => {
    try {
      const r = await api<any[]>(`/sales-orders?status=${status}&q=${encodeURIComponent(q)}&sort=${sort}`);
      setOrders(r);
    } catch {} finally { setLoading(false); }
  }, [status, q, sort]);

  useFocusEffect(useCallback(() => { loadChart(); }, [loadChart]));
  useFocusEffect(useCallback(() => { loadList(); }, [loadList]));
  useEffect(() => { loadList(); }, [loadList]);

  const series = chart ? STATUSES.map((s) => ({ key: s, label: statusLabel[s], color: STATUS_COLORS[s], data: chart.series[s] || [] })) : [];

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Pressable testID="so-list-back" onPress={() => router.back()} hitSlop={10}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={C.onSurface} />
        </Pressable>
        <Text style={styles.title}>{t("orders").toUpperCase()}</Text>
        <Pressable testID="so-list-add" onPress={() => router.push("/sales-order/new")} hitSlop={10}>
          <MaterialCommunityIcons name="plus" size={26} color={C.brand} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 80 }} testID="so-list-scroll">
        <Text style={styles.section}>{t("ordersByStatus")}</Text>
        <Card style={{ marginBottom: S.lg }}>
          {chart ? <StatusLineChart months={chart.months} series={series} width={width - 2 * S.lg - 2 * S.lg} /> : <ActivityIndicator color={C.brand} />}
        </Card>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {STATUSES.map((s) => (
            <Pressable key={s} testID={`so-tab-${s}`} onPress={() => setStatus(s)} style={[styles.tab, status === s && { backgroundColor: STATUS_COLORS[s], borderColor: STATUS_COLORS[s] }]}>
              <Text style={[styles.tabTxt, status === s && { color: "#fff" }]}>{statusLabel[s]}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={20} color={C.onSurfaceTertiary} />
          <TextInput testID="so-search" value={q} onChangeText={setQ} placeholder={t("searchOrders")}
            placeholderTextColor={C.onSurfaceTertiary} style={styles.searchInput} autoCapitalize="none" />
          {q.length > 0 && <Pressable onPress={() => setQ("")}><MaterialCommunityIcons name="close-circle" size={18} color={C.onSurfaceTertiary} /></Pressable>}
        </View>

        <Text style={styles.sortLabel}>{t("sortLabel")}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortRow}>
          {[{ k: "date", l: t("sortByDate") }, { k: "order_number", l: t("sortByNumber") }, { k: "field1", l: label1 }, { k: "field2", l: label2 }].map((o) => (
            <Pressable key={o.k} testID={`so-sort-${o.k}`} onPress={() => setSort(o.k as any)} style={[styles.sortChip, sort === o.k && styles.sortChipActive]}>
              <Text style={[styles.sortTxt, sort === o.k && { color: C.onBrand }]}>{o.l}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading ? (
          <ActivityIndicator color={C.brand} style={{ marginTop: 24 }} />
        ) : orders.length === 0 ? (
          <Card><Text style={styles.empty}>{t("noOrders")}</Text></Card>
        ) : (
          orders.map((o) => (
            <Pressable key={o.id} testID={`so-row-${o.id}`} onPress={() => router.push(`/sales-order/${o.id}`)}>
              <Card style={styles.row}>
                <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[o.status] }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderNo}>{o.order_number}</Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {o.order_date}{o.field1 ? `  ·  ${o.field1}` : ""}{o.shipping_ref ? `  ·  ${o.shipping_ref}` : ""}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={C.onSurfaceTertiary} />
              </Card>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingBottom: S.md, borderBottomWidth: 1, borderBottomColor: C.divider },
  title: { color: C.onSurface, fontFamily: F.display, fontSize: 20, letterSpacing: 1 },
  section: { color: C.onSurfaceSecondary, fontFamily: F.textBold, fontSize: 13, letterSpacing: 1, marginBottom: S.sm },
  tabRow: { gap: S.sm, paddingBottom: S.md },
  tab: { height: 36, paddingHorizontal: S.md, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", flexShrink: 0, backgroundColor: C.surface },
  tabTxt: { color: C.onSurfaceSecondary, fontFamily: F.textBold, fontSize: 13 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: S.sm, backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, height: 46, marginBottom: S.sm },
  searchInput: { flex: 1, color: C.onSurface, fontFamily: F.text, fontSize: 15 },
  sortLabel: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 11, letterSpacing: 0.5, marginBottom: S.xs },
  sortRow: { gap: S.sm, paddingBottom: S.md },
  sortChip: { height: 32, paddingHorizontal: S.md, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", flexShrink: 0, backgroundColor: C.surface },
  sortChipActive: { backgroundColor: C.brand, borderColor: C.brand },
  sortTxt: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 12 },
  empty: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 14, textAlign: "center", paddingVertical: S.md },
  row: { flexDirection: "row", alignItems: "center", gap: S.md, marginBottom: S.sm, paddingVertical: S.md },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  orderNo: { color: C.onSurface, fontFamily: F.textBold, fontSize: 15 },
  meta: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, marginTop: 2 },
});
