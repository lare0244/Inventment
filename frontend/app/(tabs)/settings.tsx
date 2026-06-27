import React, { useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useColors, useT, useApp } from "@/src/appsettings";
import { CURRENCIES } from "@/src/currency";
import { F, S, R, Palette } from "@/src/theme";
import { Card, Btn } from "@/src/components/ui";

type Kind = "warehouses" | "categories" | "suppliers";

export default function Settings() {
  const insets = useSafeAreaInsets();
  const { user, signOut, currency, setCurrency } = useAuth();
  const { themeName, setThemeName, lang, setLang } = useApp();
  const C = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [modal, setModal] = useState<Kind | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [f1, setF1] = useState(""); const [f2, setF2] = useState("");

  const load = useCallback(async () => {
    const [w, c, s] = await Promise.all([api("/warehouses"), api("/categories"), api("/suppliers")]);
    setWarehouses(w); setCategories(c); setSuppliers(s);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function save() {
    if (!f1.trim()) return;
    const e = editId ? `/${editId}` : "";
    const m = editId ? "PUT" : "POST";
    if (modal === "warehouses") await api(`/warehouses${e}`, { method: m, body: { name: f1, address: f2 } });
    if (modal === "categories") await api(`/categories${e}`, { method: m, body: { name: f1 } });
    if (modal === "suppliers") await api(`/suppliers${e}`, { method: m, body: { name: f1, email: f2 } });
    setF1(""); setF2(""); setEditId(null); setModal(null); load();
  }
  async function del(kind: Kind, id: string) {
    await api(`/${kind}/${id}`, { method: "DELETE" }); load();
  }

  const Section = ({ kind, title, icon, items, sub }: any) => (
    <Card style={{ marginBottom: S.lg }}>
      <View style={styles.secHead}>
        <View style={styles.secTitleRow}>
          <MaterialCommunityIcons name={icon} size={20} color={C.brand} />
          <Text style={styles.secTitle}>{title}</Text>
        </View>
        <Pressable testID={`add-${kind}`} onPress={() => { setModal(kind); setEditId(null); setF1(""); setF2(""); }}>
          <MaterialCommunityIcons name="plus-circle" size={24} color={C.brand} />
        </Pressable>
      </View>
      {items.length === 0 ? (
        <Text style={styles.emptyTxt}>{t("noneYet")}</Text>
      ) : (
        items.map((it: any) => (
          <View key={it.id} style={styles.itemRow}>
            <Text style={styles.itemName}>{it.name}{sub && it[sub] ? `  ·  ${it[sub]}` : ""}</Text>
            <Pressable testID={`edit-${kind}-${it.id}`} onPress={() => { setModal(kind); setEditId(it.id); setF1(it.name || ""); setF2((sub && it[sub]) || ""); }} style={{ marginRight: S.md }}>
              <MaterialCommunityIcons name="pencil-outline" size={18} color={C.info} />
            </Pressable>
            <Pressable testID={`del-${kind}-${it.id}`} onPress={() => del(kind, it.id)}>
              <MaterialCommunityIcons name="trash-can-outline" size={18} color={C.error} />
            </Pressable>
          </View>
        ))
      )}
    </Card>
  );

  const Pill = ({ active, label, onPress, testID }: any) => (
    <Pressable testID={testID} onPress={onPress} style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.pillTxt, active && { color: C.onBrand }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + S.md }]}>
        <Text style={styles.title}>{t("settings").toUpperCase()}</Text>
        <Text style={styles.sub}>{user?.email}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 40 }}>
        <Card style={{ marginBottom: S.lg }}>
          <View style={styles.secTitleRow}><MaterialCommunityIcons name="theme-light-dark" size={20} color={C.brand} /><Text style={styles.secTitle}>{t("appearance")}</Text></View>
          <View style={styles.pillRow}>
            <Pill testID="theme-dark" active={themeName === "dark"} label={t("dark")} onPress={() => setThemeName("dark")} />
            <Pill testID="theme-light" active={themeName === "light"} label={t("light")} onPress={() => setThemeName("light")} />
          </View>
        </Card>

        <Card style={{ marginBottom: S.lg }}>
          <View style={styles.secTitleRow}><MaterialCommunityIcons name="translate" size={20} color={C.brand} /><Text style={styles.secTitle}>{t("language")}</Text></View>
          <View style={styles.pillRow}>
            <Pill testID="lang-en" active={lang === "en"} label={t("english")} onPress={() => setLang("en")} />
            <Pill testID="lang-sv" active={lang === "sv"} label={t("swedish")} onPress={() => setLang("sv")} />
          </View>
        </Card>

        <Card style={{ marginBottom: S.lg }}>
          <View style={styles.secTitleRow}><MaterialCommunityIcons name="cash-multiple" size={20} color={C.brand} /><Text style={styles.secTitle}>{t("currency")}</Text></View>
          <View style={styles.currencyRow}>
            {CURRENCIES.map((c) => (
              <Pressable key={c.code} testID={`currency-${c.code}`} onPress={() => setCurrency(c.code)}
                style={[styles.curChip, currency === c.code && styles.curChipActive]}>
                <Text style={[styles.curCode, currency === c.code && { color: C.onBrand }]}>{c.code}</Text>
                <Text style={[styles.curName, currency === c.code && { color: C.onBrand }]}>{c.name}</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        <Section kind="warehouses" title={t("warehouses")} icon="warehouse" items={warehouses} sub="address" />
        <Section kind="categories" title={t("categories")} icon="shape-outline" items={categories} />
        <Section kind="suppliers" title={t("suppliers")} icon="truck-outline" items={suppliers} sub="email" />
        <Btn testID="logout-btn" title={t("signOut")} variant="ghost" icon="logout" onPress={signOut} />
      </ScrollView>

      <Modal visible={!!modal} transparent animationType="fade" onRequestClose={() => setModal(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editId ? t("edit") : t("add")}</Text>
            <TextInput testID="modal-field-1" placeholder={t("name")} placeholderTextColor={C.onSurfaceTertiary} value={f1} onChangeText={setF1} style={styles.input} />
            {modal !== "categories" && (
              <TextInput testID="modal-field-2" placeholder={modal === "suppliers" ? t("email") : t("address")} placeholderTextColor={C.onSurfaceTertiary} value={f2} onChangeText={setF2} keyboardType={modal === "suppliers" ? "email-address" : "default"} autoCapitalize="none" style={styles.input} />
            )}
            <Btn testID="modal-save" title={t("save")} onPress={save} />
            <Pressable onPress={() => { setModal(null); setEditId(null); }} style={{ alignItems: "center", paddingVertical: S.md }}>
              <Text style={{ color: C.onSurfaceTertiary, fontFamily: F.textBold }}>{t("cancel")}</Text>
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
  secHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: S.md },
  secTitleRow: { flexDirection: "row", alignItems: "center", gap: S.sm, marginBottom: S.md },
  secTitle: { color: C.onSurface, fontFamily: F.textBold, fontSize: 16 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: S.sm, borderTopWidth: 1, borderTopColor: C.divider },
  itemName: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 14, flex: 1 },
  emptyTxt: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13 },
  pillRow: { flexDirection: "row", gap: S.sm },
  pill: { flex: 1, height: 44, borderRadius: R.md, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", backgroundColor: C.surface },
  pillActive: { backgroundColor: C.brand, borderColor: C.brand },
  pillTxt: { color: C.onSurfaceSecondary, fontFamily: F.textBold, fontSize: 14 },
  currencyRow: { flexDirection: "row", flexWrap: "wrap", gap: S.sm },
  curChip: { width: "47.5%", borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: S.md, backgroundColor: C.surface },
  curChipActive: { backgroundColor: C.brand, borderColor: C.brand },
  curCode: { color: C.onSurface, fontFamily: F.display, fontSize: 18 },
  curName: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 11, marginTop: 2 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: S.xl },
  modalCard: { backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, padding: S.lg },
  modalTitle: { color: C.onSurface, fontFamily: F.display, fontSize: 22, marginBottom: S.lg },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, height: 50, color: C.onSurface, fontFamily: F.text, fontSize: 15, marginBottom: S.md },
});
