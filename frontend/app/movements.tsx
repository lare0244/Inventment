import React, { useState, useEffect, useMemo, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useColors, useT } from "@/src/appsettings";
import { F, S, R, Palette } from "@/src/theme";

const TYPE_ICON: Record<string, any> = {
  receive: "arrow-down-bold-circle",
  adjust: "tune-variant",
  remove: "minus-circle",
  transfer: "swap-horizontal",
};

export default function Movements() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [items, setItems] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [wh, setWh] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs: string[] = [];
      if (wh) qs.push(`warehouse_id=${wh}`);
      if (type) qs.push(`type=${type}`);
      const [m, w] = await Promise.all([
        api<any[]>(`/movements${qs.length ? `?${qs.join("&")}` : ""}`),
        api<any[]>("/warehouses"),
      ]);
      setItems(m); setWarehouses(w);
    } catch {} finally { setLoading(false); }
  }, [wh, type]);
  useEffect(() => { load(); }, [load]);

  const TYPES = [
    { v: null, label: t("allTypes") },
    { v: "receive", label: t("receiveType") },
    { v: "adjust", label: t("adjustType") },
    { v: "remove", label: t("removeType") },
    { v: "transfer", label: t("transferType") },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Pressable testID="mv-back" onPress={() => router.back()} hitSlop={10}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={C.onSurface} />
        </Pressable>
        <Text style={styles.title}>{t("movementsTitle")}</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {TYPES.map((ty) => (
            <Pressable key={ty.label} testID={`mv-type-${ty.v || "all"}`} onPress={() => setType(ty.v)}
              style={[styles.chip, type === ty.v && styles.chipActive]}>
              <Text style={[styles.chipTxt, type === ty.v && { color: C.onBrand }]}>{ty.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {warehouses.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            <Pressable testID="mv-wh-all" onPress={() => setWh(null)} style={[styles.chip, !wh && styles.chipActive]}>
              <Text style={[styles.chipTxt, !wh && { color: C.onBrand }]}>{t("allWarehouses")}</Text>
            </Pressable>
            {warehouses.map((w) => (
              <Pressable key={w.id} testID={`mv-wh-${w.id}`} onPress={() => setWh(w.id)} style={[styles.chip, wh === w.id && styles.chipActive]}>
                <Text style={[styles.chipTxt, wh === w.id && { color: C.onBrand }]}>{w.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />
      ) : items.length === 0 ? (
        <Text style={styles.empty}>{t("noMovements")}</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 40 }}>
          {items.map((m) => (
            <View key={m.id} style={styles.row}>
              <MaterialCommunityIcons name={TYPE_ICON[m.type] || "history"} size={22} color={C.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{m.product_name}</Text>
                <Text style={styles.meta}>
                  {t(`${m.type}Type`)}
                  {m.type === "transfer" && m.from_warehouse_name ? `  ·  ${m.from_warehouse_name} → ${m.warehouse_name}` : (m.warehouse_name ? `  ·  ${m.warehouse_name}` : "")}
                  {`  ·  ${new Date(m.created_at).toLocaleDateString()}`}
                </Text>
              </View>
              <Text style={[styles.qty, m.type === "remove" && { color: C.error }]}>
                {m.type === "remove" ? "−" : m.type === "receive" || m.type === "transfer" ? "+" : ""}{m.quantity}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingBottom: S.md, borderBottomWidth: 1, borderBottomColor: C.divider },
  title: { color: C.onSurface, fontFamily: F.display, fontSize: 22, letterSpacing: 1 },
  filters: { paddingHorizontal: S.lg, paddingTop: S.md, gap: S.sm, borderBottomWidth: 1, borderBottomColor: C.divider, paddingBottom: S.sm },
  filterRow: { gap: S.sm, paddingBottom: S.sm },
  chip: { height: 32, paddingHorizontal: S.md, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", flexShrink: 0, backgroundColor: C.surfaceSecondary },
  chipActive: { backgroundColor: C.brand, borderColor: C.brand },
  chipTxt: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 13 },
  empty: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 14, textAlign: "center", marginTop: 40 },
  row: { flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: S.md, marginBottom: S.sm },
  name: { color: C.onSurface, fontFamily: F.textBold, fontSize: 15 },
  meta: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, marginTop: 2 },
  qty: { color: C.onSurface, fontFamily: F.display, fontSize: 18 },
});
