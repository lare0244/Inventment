import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { CURRENCIES } from "@/src/currency";
import { C, F, S, R } from "@/src/theme";
import { Card, Btn } from "@/src/components/ui";

type Kind = "warehouses" | "categories" | "suppliers";

export default function Settings() {
  const insets = useSafeAreaInsets();
  const { user, signOut, currency, setCurrency } = useAuth();
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [modal, setModal] = useState<Kind | null>(null);
  const [f1, setF1] = useState(""); const [f2, setF2] = useState("");

  const load = useCallback(async () => {
    const [w, c, s] = await Promise.all([api("/warehouses"), api("/categories"), api("/suppliers")]);
    setWarehouses(w); setCategories(c); setSuppliers(s);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function add() {
    if (!f1.trim()) return;
    if (modal === "warehouses") await api("/warehouses", { method: "POST", body: { name: f1, address: f2 } });
    if (modal === "categories") await api("/categories", { method: "POST", body: { name: f1 } });
    if (modal === "suppliers") await api("/suppliers", { method: "POST", body: { name: f1, email: f2 } });
    setF1(""); setF2(""); setModal(null); load();
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
        <Pressable testID={`add-${kind}`} onPress={() => { setModal(kind); setF1(""); setF2(""); }}>
          <MaterialCommunityIcons name="plus-circle" size={24} color={C.brand} />
        </Pressable>
      </View>
      {items.length === 0 ? (
        <Text style={styles.emptyTxt}>None yet</Text>
      ) : (
        items.map((it: any) => (
          <View key={it.id} style={styles.itemRow}>
            <Text style={styles.itemName}>{it.name}{sub && it[sub] ? `  ·  ${it[sub]}` : ""}</Text>
            <Pressable testID={`del-${kind}-${it.id}`} onPress={() => del(kind, it.id)}>
              <MaterialCommunityIcons name="trash-can-outline" size={18} color={C.error} />
            </Pressable>
          </View>
        ))
      )}
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + S.md }]}>
        <Text style={styles.title}>SETTINGS</Text>
        <Text style={styles.sub}>{user?.email}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 40 }}>
        <Card style={{ marginBottom: S.lg }}>
          <View style={styles.secTitleRow}>
            <MaterialCommunityIcons name="cash-multiple" size={20} color={C.brand} />
            <Text style={styles.secTitle}>Currency</Text>
          </View>
          <View style={styles.currencyRow}>
            {CURRENCIES.map((c) => (
              <Pressable key={c.code} testID={`currency-${c.code}`} onPress={() => setCurrency(c.code)}
                style={[styles.curChip, currency === c.code && styles.curChipActive]}>
                <Text style={[styles.curCode, currency === c.code && styles.curCodeActive]}>{c.code}</Text>
                <Text style={[styles.curName, currency === c.code && { color: C.onBrand }]}>{c.name}</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        <Section kind="warehouses" title="Warehouses" icon="warehouse" items={warehouses} sub="address" />
        <Section kind="categories" title="Categories" icon="shape-outline" items={categories} />
        <Section kind="suppliers" title="Suppliers" icon="truck-outline" items={suppliers} sub="email" />
        <Btn testID="logout-btn" title="Sign Out" variant="ghost" icon="logout" onPress={signOut} />
      </ScrollView>

      <Modal visible={!!modal} transparent animationType="fade" onRequestClose={() => setModal(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add {modal}</Text>
            <TextInput testID="modal-field-1" placeholder="Name" placeholderTextColor={C.onSurfaceTertiary} value={f1} onChangeText={setF1} style={styles.input} />
            {modal !== "categories" && (
              <TextInput testID="modal-field-2" placeholder={modal === "suppliers" ? "Email" : "Location"} placeholderTextColor={C.onSurfaceTertiary} value={f2} onChangeText={setF2} keyboardType={modal === "suppliers" ? "email-address" : "default"} autoCapitalize="none" style={styles.input} />
            )}
            <Btn testID="modal-save" title="Save" onPress={add} />
            <Pressable onPress={() => setModal(null)} style={{ alignItems: "center", paddingVertical: S.md }}>
              <Text style={{ color: C.onSurfaceTertiary, fontFamily: F.textBold }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: S.lg, paddingBottom: S.md, borderBottomWidth: 1, borderBottomColor: C.divider },
  title: { color: C.onSurface, fontFamily: F.display, fontSize: 26, letterSpacing: 1 },
  sub: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13 },
  secHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: S.md },
  secTitleRow: { flexDirection: "row", alignItems: "center", gap: S.sm },
  secTitle: { color: C.onSurface, fontFamily: F.textBold, fontSize: 16 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: S.sm, borderTopWidth: 1, borderTopColor: C.divider },
  itemName: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 14, flex: 1 },
  emptyTxt: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: S.xl },
  modalCard: { backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, padding: S.lg },
  modalTitle: { color: C.onSurface, fontFamily: F.display, fontSize: 22, marginBottom: S.lg, textTransform: "capitalize" },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, height: 50, color: C.onSurface, fontFamily: F.text, fontSize: 15, marginBottom: S.md },
  currencyRow: { flexDirection: "row", flexWrap: "wrap", gap: S.sm },
  curChip: { width: "47.5%", borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: S.md, backgroundColor: C.surface },
  curChipActive: { backgroundColor: C.brand, borderColor: C.brand },
  curCode: { color: C.onSurface, fontFamily: F.display, fontSize: 18 },
  curCodeActive: { color: C.onBrand },
  curName: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 11, marginTop: 2 },
  alertHint: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13, lineHeight: 18 },
  alertBtns: { flexDirection: "row", gap: S.md, marginTop: S.md },
  alertStatus: { color: C.success, fontFamily: F.textBold, fontSize: 13, marginTop: S.md },
});
