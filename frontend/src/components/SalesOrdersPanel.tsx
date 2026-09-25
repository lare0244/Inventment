import React, { useState, useCallback, useMemo, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, useWindowDimensions } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useColors, useT } from "@/src/appsettings";
import { F, S, R, Palette } from "@/src/theme";
import { Card, Btn } from "@/src/components/ui";
import { StatusLineChart } from "@/src/components/StatusLineChart";

const STATUSES = ["saved", "picked", "shipped", "returned"] as const;
const STATUS_COLORS: Record<string, string> = { saved: "#29B6F6", picked: "#FFB300", shipped: "#66BB6A", returned: "#EF5350" };
const INITIAL = 10;
const PAGE = 25;

export function SalesOrdersPanel() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const C = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const isDesktop = width >= 900;
  const [chart, setChart] = useState<{ months: string[]; series: Record<string, number[]> } | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [status, setStatus] = useState<typeof STATUSES[number]>("saved");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"date" | "order_number" | "field1" | "field2">("date");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(INITIAL);

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

  useFocusEffect(useCallback(() => { loadChart(); loadList(); }, [loadChart, loadList]));
  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { setVisible(INITIAL); }, [status, q, sort, dir]);

  const series = chart ? STATUSES.map((s) => ({ key: s, label: statusLabel[s], color: STATUS_COLORS[s], data: chart.series[s] || [] })) : [];

  const sortVal = (o: any) => {
    if (sort === "date") return o.order_date || "";
    if (sort === "order_number") return o.order_number || "";
    if (sort === "field1") return (o.field1 || "").toLowerCase();
    return (o.field2 || "").toLowerCase();
  };
  const sortedOrders = useMemo(() => {
    const a = [...orders];
    a.sort((x, y) => {
      const vx = sortVal(x), vy = sortVal(y);
      const c = vx < vy ? -1 : vx > vy ? 1 : 0;
      return dir === "asc" ? c : -c;
    });
    return a;
  }, [orders, sort, dir]);
  const shown = sortedOrders.slice(0, visible);

  const onSort = (k: string) => {
    if (sort === k) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSort(k as any); setDir(k === "date" ? "desc" : "asc"); }
  };

  const SortTh = ({ label, k, flex }: { label: string; k: string; flex: number }) => {
    const active = sort === k;
    return (
      <Pressable testID={`so-col-${k}`} onPress={() => onSort(k)} style={{ flex, flexDirection: "row", alignItems: "center", gap: 2 }}>
        <Text style={[styles.th, active && { color: C.brand }]} numberOfLines={1}>{label}</Text>
        <MaterialCommunityIcons name={active ? (dir === "asc" ? "menu-up" : "menu-down") : "unfold-more-horizontal"}
          size={16} color={active ? C.brand : C.onSurfaceTertiary} />
      </Pressable>
    );
  };

  const showMore = orders.length > visible ? (
    <Btn testID="so-show-more" title={`${t("showMore")} (${Math.min(PAGE, orders.length - visible)})`} variant="secondary"
      icon="chevron-down" style={{ marginTop: S.sm }} onPress={() => setVisible((v) => v + PAGE)} />
  ) : null;

  return (
    <View>
      <Text style={styles.section}>{t("ordersByStatus")}</Text>
      <Card style={{ marginBottom: S.lg }}>
        {chart ? <StatusLineChart months={chart.months} series={series} width={(isDesktop ? Math.min(width - 248, 1160) : width) - 4 * S.lg} /> : <ActivityIndicator color={C.brand} />}
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

      {!isDesktop && (
        <>
          <Text style={styles.sortLabel}>{t("sortLabel")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortRow}>
            {[{ k: "date", l: t("sortByDate") }, { k: "order_number", l: t("sortByNumber") }, { k: "field1", l: label1 }, { k: "field2", l: label2 }].map((o) => (
              <Pressable key={o.k} testID={`so-sort-${o.k}`} onPress={() => onSort(o.k)} style={[styles.sortChip, sort === o.k && styles.sortChipActive]}>
                <Text style={[styles.sortTxt, sort === o.k && { color: C.onBrand }]}>{o.l}</Text>
                {sort === o.k && <MaterialCommunityIcons name={dir === "asc" ? "menu-up" : "menu-down"} size={15} color={C.onBrand} />}
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}

      {loading ? (
        <ActivityIndicator color={C.brand} style={{ marginTop: 24 }} />
      ) : orders.length === 0 ? (
        <Card><Text style={styles.empty}>{t("noOrders")}</Text></Card>
      ) : isDesktop ? (
        <>
          <View style={styles.thead}>
            <Text style={[styles.th, { width: 120 }]}>{t("status")}</Text>
            <SortTh label={t("sortByNumber")} k="order_number" flex={2} />
            <SortTh label={t("sortByDate")} k="date" flex={1.5} />
            <SortTh label={label1} k="field1" flex={2} />
            <SortTh label={label2} k="field2" flex={2} />
            <View style={{ width: 28 }} />
          </View>
          {shown.map((o, i) => (
            <Pressable key={o.id} testID={`so-row-${o.id}`} onPress={() => router.push(`/sales-order/${o.id}`)}
              style={[styles.trow, i % 2 === 1 && { backgroundColor: C.surfaceSecondary }]}>
              <View style={{ width: 120, flexDirection: "row", alignItems: "center", gap: S.sm }}>
                <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[o.status] }]} />
                <Text style={styles.tcellMuted} numberOfLines={1}>{statusLabel[o.status]}</Text>
              </View>
              <Text style={[styles.tcellBold, { flex: 2 }]} numberOfLines={1}>{o.order_number}</Text>
              <Text style={[styles.tcell, { flex: 1.5 }]} numberOfLines={1}>{o.order_date}</Text>
              <Text style={[styles.tcell, { flex: 2 }]} numberOfLines={1}>{o.field1 || "—"}</Text>
              <Text style={[styles.tcell, { flex: 2 }]} numberOfLines={1}>{o.field2 || o.shipping_ref || "—"}</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={C.onSurfaceTertiary} style={{ width: 28, textAlign: "right" }} />
            </Pressable>
          ))}
          {showMore}
        </>
      ) : (
        <>
          {shown.map((o) => (
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
          ))}
          {showMore}
        </>
      )}
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  section: { color: C.onSurfaceSecondary, fontFamily: F.textBold, fontSize: 13, letterSpacing: 1, marginBottom: S.sm },
  tabRow: { gap: S.sm, paddingBottom: S.md },
  tab: { height: 36, paddingHorizontal: S.md, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", flexShrink: 0, backgroundColor: C.surface },
  tabTxt: { color: C.onSurfaceSecondary, fontFamily: F.textBold, fontSize: 13 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: S.sm, backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, height: 46, marginBottom: S.sm },
  searchInput: { flex: 1, color: C.onSurface, fontFamily: F.text, fontSize: 15 },
  sortLabel: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 11, letterSpacing: 0.5, marginBottom: S.xs },
  sortRow: { gap: S.sm, paddingBottom: S.md },
  sortChip: { flexDirection: "row", gap: 2, height: 32, paddingHorizontal: S.md, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", flexShrink: 0, backgroundColor: C.surface },
  sortChipActive: { backgroundColor: C.brand, borderColor: C.brand },
  sortTxt: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 12 },
  empty: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 14, textAlign: "center", paddingVertical: S.md },
  row: { flexDirection: "row", alignItems: "center", gap: S.md, marginBottom: S.sm, paddingVertical: S.md },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  thead: { flexDirection: "row", alignItems: "center", gap: S.md, paddingVertical: S.sm, paddingHorizontal: S.md, borderBottomWidth: 2, borderBottomColor: C.border },
  th: { color: C.onSurfaceTertiary, fontFamily: F.textBold, fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase" },
  trow: { flexDirection: "row", alignItems: "center", gap: S.md, paddingVertical: S.md, paddingHorizontal: S.md, borderRadius: R.sm },
  tcell: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 14 },
  tcellBold: { color: C.onSurface, fontFamily: F.textBold, fontSize: 14 },
  tcellMuted: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 13, flexShrink: 1 },
  orderNo: { color: C.onSurface, fontFamily: F.textBold, fontSize: 15 },
  meta: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, marginTop: 2 },
});
