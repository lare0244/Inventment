import React, { useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, Platform, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";
import { api } from "@/src/api";
import { useColors, useT } from "@/src/appsettings";
import { F, S, R, Palette } from "@/src/theme";
import { Card, Btn, Dropdown } from "@/src/components/ui";

export default function ProductionOrders() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [list, setList] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [wid, setWid] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [o, w] = await Promise.all([api<any[]>("/production-orders"), api<any[]>("/warehouses")]);
      setList(o); setWarehouses(w);
      setWid((x) => x || w[0]?.id || null);
    } catch {} finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function create() {
    if (!wid) return;
    setCreating(true);
    try {
      const o = await api<any>("/production-orders", { method: "POST", body: { warehouse_id: wid, items: [] } });
      setModal(false);
      router.push(`/production-orders/${o.id}`);
    } catch (e: any) {
      const msg = e?.message || "Error";
      if (Platform.OS === "web" && typeof window !== "undefined") window.alert(msg); else Alert.alert(msg, "");
    } finally { setCreating(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Pressable testID="po-back" onPress={() => router.back()} hitSlop={10}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={C.onSurface} />
        </Pressable>
        <Text style={styles.title}>{t("productionOrders")}</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 40 }}>
          <Btn testID="po-new-btn" title={t("newProductionOrder")} icon="factory" onPress={() => setModal(true)} style={{ marginBottom: S.lg }} />
          {list.length === 0 ? (
            <Card><Text style={styles.empty}>{t("noProductionOrders")}</Text></Card>
          ) : (
            list.map((o) => {
              const done = o.status === "completed";
              return (
                <Pressable key={o.id} testID={`po-row-${o.id}`} onPress={() => router.push(`/production-orders/${o.id}`)}>
                  <Card style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                        <Text style={styles.rowNum}>{o.number}</Text>
                        <View style={[styles.badge, { backgroundColor: done ? C.success : C.warning }]}>
                          <Text style={styles.badgeTxt}>{done ? t("stCompleted") : t("statusDraft")}</Text>
                        </View>
                      </View>
                      <Text style={styles.rowSub}>{(o.created_at || "").slice(0, 10)}  ·  {o.warehouse_name}</Text>
                      <Text style={styles.rowSub2}>{(o.items || []).length} {t("productName")}</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={22} color={C.onSurfaceTertiary} />
                  </Card>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}

      <Modal visible={modal} transparent animationType="fade" onRequestClose={() => setModal(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("newProductionOrder")}</Text>
            <Text style={styles.lbl}>{t("chooseWarehouse")}</Text>
            <View style={{ marginBottom: S.md }}>
              <Dropdown testID="po-wh-dd" value={wid} placeholder={t("chooseWarehouse")}
                options={warehouses.map((w) => ({ value: w.id, label: w.name }))} onChange={setWid} />
            </View>
            <Btn testID="po-create" title={t("create")} icon="check" loading={creating} onPress={create} />
            <Pressable onPress={() => setModal(false)} style={{ alignItems: "center", paddingVertical: S.md }}>
              <Text style={{ color: C.onSurfaceTertiary, fontFamily: F.textBold }}>{t("cancel")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingBottom: S.md, borderBottomWidth: 1, borderBottomColor: C.divider },
  title: { color: C.onSurface, fontFamily: F.display, fontSize: 18, letterSpacing: 0.5, flex: 1, textAlign: "center" },
  empty: { color: C.onSurfaceTertiary, fontFamily: F.text },
  row: { flexDirection: "row", alignItems: "center", gap: S.md, marginBottom: S.sm },
  rowNum: { color: C.onSurface, fontFamily: F.textBold, fontSize: 15 },
  rowSub: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 13, marginTop: 3 },
  rowSub2: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, marginTop: 2 },
  badge: { borderRadius: R.sm, paddingHorizontal: S.sm, paddingVertical: 2 },
  badgeTxt: { color: "#fff", fontFamily: F.textBold, fontSize: 10, letterSpacing: 0.5 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: S.xl },
  modalCard: { backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, padding: S.lg },
  modalTitle: { color: C.onSurface, fontFamily: F.display, fontSize: 20, marginBottom: S.md },
  lbl: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 11, letterSpacing: 0.5, marginBottom: S.xs, textTransform: "uppercase" },
});
