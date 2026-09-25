import React, { useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput, Platform, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useColors, useT } from "@/src/appsettings";
import { F, S, R, Palette } from "@/src/theme";
import { Card, Btn, Dropdown } from "@/src/components/ui";
import { buildStocktakePdf } from "@/src/utils/stocktakePdf";

function todayStr() { return new Date().toISOString().slice(0, 10); }

export default function StocktakesList() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const C = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [list, setList] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [wid, setWid] = useState<string | null>(null);
  const [date, setDate] = useState(todayStr());
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, w] = await Promise.all([api<any[]>("/stocktakes"), api<any[]>("/warehouses")]);
      setList(s); setWarehouses(w);
      if (!wid && w.length) setWid(w[0].id);
    } catch {} finally { setLoading(false); }
  }, [wid]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function create() {
    if (!wid) return;
    setCreating(true);
    try {
      const st = await api<any>("/stocktakes", { method: "POST", body: { warehouse_id: wid, date } });
      setModal(false);
      router.push(`/stocktakes/${st.id}`);
    } catch (e: any) {
      const msg = e?.message || "Error";
      if (Platform.OS === "web" && typeof window !== "undefined") window.alert(msg); else Alert.alert(msg, "");
    } finally { setCreating(false); }
  }

  async function exportPdf(st: any) {
    const full = await api<any>(`/stocktakes/${st.id}`);
    await buildStocktakePdf(full, user?.company, {
      title: t("stocktaking"), number: t("orderNumber"), warehouse: t("warehouse"), date: t("stocktakeDate"),
      status: t("status"), productName: t("productName"), articleNo: t("articleNo"), ean: t("ean"),
      system: t("systemQty"), counted: t("countedQty"), diff: t("diff"),
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Pressable testID="st-back" onPress={() => router.back()} hitSlop={10}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={C.onSurface} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{t("stocktaking")}</Text>
        <Pressable testID="st-new" onPress={() => { setDate(todayStr()); setModal(true); }} hitSlop={10}>
          <MaterialCommunityIcons name="plus" size={26} color={C.brand} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 40 }}>
          <Btn testID="st-new-btn" title={t("newStocktake")} icon="clipboard-list-outline" onPress={() => { setDate(todayStr()); setModal(true); }} style={{ marginBottom: S.lg }} />
          {list.length === 0 ? (
            <Card><Text style={styles.empty}>{t("noStocktakes")}</Text></Card>
          ) : (
            list.map((s) => {
              const done = s.status === "completed";
              return (
                <Pressable key={s.id} testID={`st-row-${s.id}`} onPress={() => router.push(`/stocktakes/${s.id}`)}>
                  <Card style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                        <Text style={styles.rowNum}>{s.number}</Text>
                        <View style={[styles.badge, { backgroundColor: done ? C.success : C.warning }]}>
                          <Text style={styles.badgeTxt}>{done ? t("stCompleted") : t("stOpen")}</Text>
                        </View>
                      </View>
                      <Text style={styles.rowSub}>{s.date}  ·  {s.warehouse_name}</Text>
                      <Text style={styles.rowSub2}>{(s.items || []).length} {t("itemsCounted")}</Text>
                    </View>
                    <Pressable testID={`st-pdf-${s.id}`} onPress={() => exportPdf(s)} hitSlop={10} style={styles.pdfBtn}>
                      <MaterialCommunityIcons name="file-pdf-box" size={24} color={C.brand} />
                    </Pressable>
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
            <Text style={styles.modalTitle}>{t("newStocktake")}</Text>
            <Text style={styles.fieldLbl}>{t("chooseWarehouse")}</Text>
            <View style={{ marginBottom: S.md }}>
              <Dropdown testID="st-wh-dd" value={wid} placeholder={t("chooseWarehouse")}
                options={warehouses.map((w) => ({ value: w.id, label: w.name }))} onChange={setWid} />
            </View>
            <Text style={styles.fieldLbl}>{t("stocktakeDate")}</Text>
            <TextInput testID="st-date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD"
              placeholderTextColor={C.onSurfaceTertiary} style={styles.input} />
            <Btn testID="st-create" title={t("createStocktake")} icon="check" loading={creating} onPress={create} />
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
  title: { color: C.onSurface, fontFamily: F.display, fontSize: 18, letterSpacing: 0.5, flex: 1, textAlign: "center", marginHorizontal: S.sm },
  empty: { color: C.onSurfaceTertiary, fontFamily: F.text },
  row: { flexDirection: "row", alignItems: "center", gap: S.md, marginBottom: S.sm },
  rowNum: { color: C.onSurface, fontFamily: F.textBold, fontSize: 15 },
  rowSub: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 13, marginTop: 3 },
  rowSub2: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, marginTop: 2 },
  badge: { borderRadius: R.sm, paddingHorizontal: S.sm, paddingVertical: 2 },
  badgeTxt: { color: "#fff", fontFamily: F.textBold, fontSize: 10, letterSpacing: 0.5 },
  pdfBtn: { padding: 4 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: S.xl },
  modalCard: { backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, padding: S.lg },
  modalTitle: { color: C.onSurface, fontFamily: F.display, fontSize: 20, marginBottom: S.md },
  fieldLbl: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 11, letterSpacing: 0.5, marginBottom: S.xs, textTransform: "uppercase" },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, height: 50, color: C.onSurface, fontFamily: F.text, fontSize: 15, marginBottom: S.md },
});
