import React, { useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useColors, useT } from "@/src/appsettings";
import { F, S, R, Palette } from "@/src/theme";
import { Card, Btn } from "@/src/components/ui";
import { SalesOrderEditor, SOValue } from "@/src/components/SalesOrderEditor";

const STATUSES = ["saved", "picked", "shipped", "returned"] as const;
const ALLOWED: Record<string, string[]> = { saved: ["picked", "shipped"], picked: ["shipped"], shipped: ["returned"], returned: [] };
const ICONS: Record<string, any> = { saved: "content-save-outline", picked: "package-variant-closed", shipped: "truck-fast-outline", returned: "keyboard-return" };

export default function SalesOrderDetail() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const C = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [order, setOrder] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [value, setValue] = useState<SOValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [o, p, w] = await Promise.all([api<any>(`/sales-orders/${id}`), api<any[]>("/products"), api<any[]>("/warehouses")]);
      setOrder(o); setProducts(p); setWarehouses(w);
      setValue({ field1: o.field1 || "", field2: o.field2 || "", comment: o.comment || "", shipping_ref: o.shipping_ref || "",
        order_date: o.order_date || "", warehouse_id: o.warehouse_id || null,
        items: (o.items || []).map((i: any) => ({ product_id: i.product_id, name: i.name, quantity: i.quantity })) });
    } catch {} finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const statusLabel: Record<string, string> = { saved: t("stSaved"), picked: t("stPicked"), shipped: t("stShipped"), returned: t("stReturned") };
  const editable = order && (order.status === "saved" || order.status === "picked");

  async function saveEdits() {
    if (!value) return; setSaving(true);
    try {
      await api(`/sales-orders/${id}`, { method: "PUT", body: { ...value, items: value.items.map((i) => ({ product_id: i.product_id, name: i.name, quantity: i.quantity })) } });
      await load();
    } catch {} finally { setSaving(false); }
  }

  function changeStatus(target: string) {
    const confirmMsg = target === "picked" ? t("confirmPicked") : target === "shipped" ? t("confirmShipped") : t("confirmReturned");
    const run = async () => {
      try { await api(`/sales-orders/${id}/status`, { method: "POST", body: { status: target } }); await load(); } catch {}
    };
    if (Platform.OS === "web" && typeof window !== "undefined") { if (window.confirm(confirmMsg)) run(); return; }
    Alert.alert(t("confirmStatusTitle"), confirmMsg, [{ text: t("cancel"), style: "cancel" }, { text: statusLabel[target], onPress: run }]);
  }

  function doDelete() {
    const run = async () => { try { await api(`/sales-orders/${id}`, { method: "DELETE" }); router.back(); } catch {} };
    const msg = `${t("deleteOrder")} ${order?.order_number}?`;
    if (Platform.OS === "web" && typeof window !== "undefined") { if (window.confirm(msg)) run(); return; }
    Alert.alert(t("deleteOrder"), msg, [{ text: t("cancel"), style: "cancel" }, { text: t("deleteOrder"), style: "destructive", onPress: run }]);
  }

  const curIdx = order ? STATUSES.indexOf(order.status) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Pressable testID="so-detail-back" onPress={() => router.back()} hitSlop={10}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={C.onSurface} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{order?.order_number || t("salesOrders")}</Text>
        <Pressable testID="so-delete" onPress={doDelete} hitSlop={10}>
          <MaterialCommunityIcons name="trash-can-outline" size={22} color={C.error} />
        </Pressable>
      </View>

      {loading || !value ? (
        <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 80 }}>
          <Card style={{ marginBottom: S.md }}>
            <Text style={styles.lbl}>{t("status")}</Text>
            <Text style={styles.flowHint}>{t("statusFlow")}</Text>
            {STATUSES.map((st, i) => {
              const checked = i <= curIdx;
              const allowed = ALLOWED[order.status]?.includes(st);
              return (
                <Pressable key={st} testID={`so-status-${st}`} disabled={!allowed} onPress={() => allowed && changeStatus(st)}
                  style={[styles.statusBox, allowed && styles.statusBoxActive]}>
                  <MaterialCommunityIcons name={checked ? "checkbox-marked" : "checkbox-blank-outline"} size={24}
                    color={checked ? C.brand : allowed ? C.onSurface : C.onSurfaceTertiary} />
                  <MaterialCommunityIcons name={ICONS[st]} size={18} color={checked ? C.brand : C.onSurfaceTertiary} style={{ marginLeft: S.sm }} />
                  <Text style={[styles.statusTxt, { color: checked ? C.onSurface : allowed ? C.onSurface : C.onSurfaceTertiary }]}>{statusLabel[st]}</Text>
                  {order.status === st && <View style={styles.curPill}><Text style={styles.curPillTxt}>{t("status")}</Text></View>}
                </Pressable>
              );
            })}
          </Card>

          <SalesOrderEditor value={value} onChange={setValue} products={products} warehouses={warehouses}
            label1={user?.so_field1_label || "Field 1"} label2={user?.so_field2_label || "Field 2"} editable={!!editable} />

          {editable ? (
            <Btn testID="so-save-edits" title={t("save")} icon="content-save-outline" loading={saving} onPress={saveEdits} style={{ marginTop: S.md }} />
          ) : (
            <Text style={styles.locked}>{t("errLockedAfterShipped")}</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingBottom: S.md, borderBottomWidth: 1, borderBottomColor: C.divider },
  title: { color: C.onSurface, fontFamily: F.display, fontSize: 18, letterSpacing: 0.5, flex: 1, textAlign: "center", marginHorizontal: S.sm },
  lbl: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 11, letterSpacing: 0.5, marginBottom: 2 },
  flowHint: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, marginBottom: S.sm },
  statusBox: { flexDirection: "row", alignItems: "center", paddingVertical: S.md, paddingHorizontal: S.sm, borderRadius: R.md, borderWidth: 1, borderColor: C.divider, marginTop: S.sm },
  statusBoxActive: { borderColor: C.brand },
  statusTxt: { fontFamily: F.textBold, fontSize: 15, marginLeft: S.sm, flex: 1 },
  curPill: { backgroundColor: C.brand, borderRadius: R.sm, paddingHorizontal: S.sm, paddingVertical: 2 },
  curPillTxt: { color: C.onBrand, fontFamily: F.textBold, fontSize: 10, letterSpacing: 0.5 },
  locked: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13, textAlign: "center", marginTop: S.md },
});
