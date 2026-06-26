import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { money } from "@/src/currency";
import { C, F, S, R, stockColor } from "@/src/theme";
import { Card, StatusDot } from "@/src/components/ui";

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const { user, currency } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setData(await api("/dashboard")); } catch {} finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const stats = [
    { label: "Stock Value", value: data ? money(data.stock_value, currency) : "—", icon: "cash-multiple", color: C.success },
    { label: "Total Units", value: data ? data.total_units : "—", icon: "cube-outline", color: C.info },
    { label: "Products", value: data ? data.total_products : "—", icon: "package-variant", color: C.brand },
    { label: "Low Stock", value: data ? data.low_stock_count : "—", icon: "alert", color: C.warning },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + S.md }]}>
        <Text style={styles.hi}>Welcome back</Text>
        <Text style={styles.name}>{user?.name || "Operator"}</Text>
      </View>
      {loading ? (
        <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: S.lg, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={C.brand} />}
          testID="dashboard-scroll"
        >
          <View style={styles.grid}>
            {stats.map((s) => (
              <Card key={s.label} style={styles.statCard}>
                <MaterialCommunityIcons name={s.icon as any} size={22} color={s.color} />
                <Text style={styles.statVal}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </Card>
            ))}
          </View>

          <Text style={styles.section}>LOW STOCK ALERTS</Text>
          {data.low_stock_items.length === 0 ? (
            <Card><Text style={styles.empty}>All stock levels healthy ✓</Text></Card>
          ) : (
            data.low_stock_items.map((p: any) => (
              <Card key={p.id} style={styles.row} >
                <StatusDot color={stockColor(p.quantity, p.low_stock_threshold)} />
                <Text style={styles.rowName} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.rowQty}>{p.quantity} left</Text>
              </Card>
            ))
          )}

          {data.expiring_count > 0 && (
            <>
              <Text style={styles.section}>EXPIRING SOON</Text>
              {data.expiring_items.map((p: any) => (
                <Card key={p.id} style={styles.row}>
                  <MaterialCommunityIcons name="clock-alert-outline" size={16} color={C.warning} />
                  <Text style={styles.rowName} numberOfLines={1}>{p.name}</Text>
                  <Text style={[styles.rowQty, { color: C.warning }]}>{p.best_before_date?.slice(0, 10)}</Text>
                </Card>
              ))}
            </>
          )}

          <Text style={styles.section}>RECENT ACTIVITY</Text>
          {data.recent_movements.length === 0 ? (
            <Card><Text style={styles.empty}>No recent movements</Text></Card>
          ) : (
            data.recent_movements.map((m: any) => (
              <Card key={m.id} style={styles.row}>
                <MaterialCommunityIcons
                  name={m.type === "receive" ? "arrow-down-bold-circle" : m.type === "remove" ? "arrow-up-bold-circle" : "sync"}
                  size={16} color={m.type === "receive" ? C.success : C.brand} />
                <Text style={styles.rowName} numberOfLines={1}>{m.product_name}</Text>
                <Text style={styles.rowQty}>{m.type} · {m.resulting_qty}</Text>
              </Card>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: S.lg, paddingBottom: S.md, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.divider },
  hi: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13 },
  name: { color: C.onSurface, fontFamily: F.display, fontSize: 26, letterSpacing: 0.5 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: S.md },
  statCard: { width: "47.5%", gap: S.xs },
  statVal: { color: C.onSurface, fontFamily: F.display, fontSize: 28 },
  statLabel: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, textTransform: "uppercase" },
  section: { color: C.onSurfaceSecondary, fontFamily: F.textBold, fontSize: 13, letterSpacing: 1, marginTop: S.xl, marginBottom: S.sm },
  row: { flexDirection: "row", alignItems: "center", gap: S.md, marginBottom: S.sm, paddingVertical: S.md },
  rowName: { flex: 1, color: C.onSurface, fontFamily: F.text, fontSize: 15 },
  rowQty: { color: C.onSurfaceTertiary, fontFamily: F.textBold, fontSize: 13 },
  empty: { color: C.onSurfaceTertiary, fontFamily: F.text },
});
