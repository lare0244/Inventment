import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, Modal, ScrollView, FlatList } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors, useT } from "@/src/appsettings";
import { F, S, R, Palette } from "@/src/theme";
import { Card } from "@/src/components/ui";

export type SOValue = {
  field1: string; field2: string; comment: string; shipping_ref: string;
  order_date: string; warehouse_id: string | null; items: { product_id: string; name: string; quantity: number; picked?: number }[];
};

export function SalesOrderEditor({ value, onChange, products, warehouses, label1, label2, editable = true }: {
  value: SOValue; onChange: (v: SOValue) => void;
  products: any[]; warehouses: any[]; label1: string; label2: string; editable?: boolean;
}) {
  const C = useColors();
  const t = useT();
  const styles = makeStyles(C);
  const [picker, setPicker] = useState(false);
  const set = (patch: Partial<SOValue>) => onChange({ ...value, ...patch });

  function addProduct(p: any) {
    if (value.items.find((it) => it.product_id === p.id)) { setPicker(false); return; }
    set({ items: [...value.items, { product_id: p.id, name: p.name, quantity: 1, picked: 0 }] });
    setPicker(false);
  }
  const setQty = (idx: number, n: number) =>
    set({ items: value.items.map((it, i) => (i === idx ? { ...it, quantity: Math.max(1, n) } : it)) });
  const removeItem = (idx: number) => set({ items: value.items.filter((_, i) => i !== idx) });

  return (
    <View>
      <Card style={{ marginBottom: S.md }}>
        <Text style={styles.lbl}>{label1}</Text>
        <TextInput testID="so-field1" editable={editable} value={value.field1} onChangeText={(x) => set({ field1: x })}
          placeholder={label1} placeholderTextColor={C.onSurfaceTertiary} style={styles.input} />
        <Text style={styles.lbl}>{label2}</Text>
        <TextInput testID="so-field2" editable={editable} value={value.field2} onChangeText={(x) => set({ field2: x })}
          placeholder={label2} placeholderTextColor={C.onSurfaceTertiary} style={styles.input} />
        <Text style={styles.lbl}>{t("shippingRef")}</Text>
        <TextInput testID="so-shipref" editable={editable} value={value.shipping_ref} onChangeText={(x) => set({ shipping_ref: x })}
          placeholder={t("shippingRef")} placeholderTextColor={C.onSurfaceTertiary} style={styles.input} />
        <Text style={styles.lbl}>{t("comment")}</Text>
        <TextInput testID="so-comment" editable={editable} value={value.comment} onChangeText={(x) => set({ comment: x })}
          placeholder={t("comment")} placeholderTextColor={C.onSurfaceTertiary} style={[styles.input, { height: 70 }]} multiline />
        <Text style={styles.lbl}>{t("orderDate")}</Text>
        <View style={styles.dateRow}>
          <TextInput testID="so-date" editable={editable} value={value.order_date} onChangeText={(x) => set({ order_date: x })}
            placeholder="YYYY-MM-DD" placeholderTextColor={C.onSurfaceTertiary} autoCapitalize="none" style={[styles.input, { flex: 1, marginBottom: 0 }]} />
          {editable && (
            <Pressable testID="so-today" onPress={() => set({ order_date: new Date().toISOString().slice(0, 10) })} style={styles.todayChip}>
              <Text style={styles.todayTxt}>{t("today")}</Text>
            </Pressable>
          )}
        </View>
      </Card>

      <Card style={{ marginBottom: S.md }}>
        <Text style={styles.lbl}>{t("shipFrom")}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {warehouses.map((w) => (
            <Pressable key={w.id} testID={`so-wh-${w.id}`} disabled={!editable}
              onPress={() => set({ warehouse_id: w.id })}
              style={[styles.chip, value.warehouse_id === w.id && styles.chipActive]}>
              <Text style={[styles.chipTxt, value.warehouse_id === w.id && { color: C.onBrand }]}>{w.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </Card>

      <View style={styles.itemHead}>
        <Text style={styles.section}>{t("orderItems")} · {value.items.length}</Text>
        {editable && (
          <Pressable testID="so-add-product" onPress={() => setPicker(true)} style={styles.addBtn}>
            <MaterialCommunityIcons name="plus" size={16} color={C.brand} />
            <Text style={styles.addTxt}>{t("addProductRow")}</Text>
          </Pressable>
        )}
      </View>
      {value.items.length === 0 ? (
        <Card><Text style={styles.empty}>{t("emptyItems")}</Text></Card>
      ) : value.items.map((it, idx) => (
        <Card key={it.product_id} style={styles.itemRow}>
          <View style={{ flex: 1, marginRight: S.sm }}>
            <Text style={styles.itemName} numberOfLines={1}>{it.name}</Text>
            {typeof it.picked === "number" && (
              <Text style={[styles.pickedTxt, { color: it.picked >= it.quantity ? C.success : C.onSurfaceTertiary }]}>
                {t("picked")}: {it.picked}/{it.quantity}
              </Text>
            )}
          </View>
          {editable ? (
            <View style={styles.stepper}>
              <Pressable onPress={() => setQty(idx, it.quantity - 1)} style={styles.stepBtn}><MaterialCommunityIcons name="minus" size={16} color={C.onSurface} /></Pressable>
              <Text style={styles.qty}>{it.quantity}</Text>
              <Pressable onPress={() => setQty(idx, it.quantity + 1)} style={styles.stepBtn}><MaterialCommunityIcons name="plus" size={16} color={C.onSurface} /></Pressable>
              <Pressable onPress={() => removeItem(idx)} style={{ marginLeft: S.sm }}><MaterialCommunityIcons name="close" size={18} color={C.error} /></Pressable>
            </View>
          ) : (
            <Text style={styles.qty}>× {it.quantity}</Text>
          )}
        </Card>
      ))}

      <Modal visible={picker} transparent animationType="slide" onRequestClose={() => setPicker(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{t("selectProduct")}</Text>
              <Pressable onPress={() => setPicker(false)}><MaterialCommunityIcons name="close" size={24} color={C.onSurface} /></Pressable>
            </View>
            {products.length === 0 ? (
              <Text style={styles.empty}>{t("noProductsToAdd")}</Text>
            ) : (
              <FlatList data={products} keyExtractor={(p) => p.id} style={{ maxHeight: 420 }}
                renderItem={({ item: p }) => (
                  <Pressable testID={`so-pick-${p.id}`} onPress={() => addProduct(p)} style={styles.pickRow}>
                    <Text style={styles.itemName} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.pickQty}>{p.quantity} {t("left")}</Text>
                  </Pressable>
                )} />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  lbl: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 11, letterSpacing: 0.5, marginBottom: S.xs, marginTop: S.sm },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, minHeight: 46, paddingVertical: 10, color: C.onSurface, fontFamily: F.text, fontSize: 15, marginBottom: S.sm },
  dateRow: { flexDirection: "row", alignItems: "center", gap: S.sm },
  todayChip: { height: 46, paddingHorizontal: S.md, borderRadius: R.md, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", backgroundColor: C.surface },
  todayTxt: { color: C.onSurfaceSecondary, fontFamily: F.textBold, fontSize: 13 },
  chipRow: { gap: S.sm, paddingVertical: S.xs },
  chip: { height: 34, paddingHorizontal: S.md, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", flexShrink: 0, backgroundColor: C.surface },
  chipActive: { backgroundColor: C.brand, borderColor: C.brand },
  chipTxt: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 13 },
  itemHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: S.sm },
  section: { color: C.onSurfaceSecondary, fontFamily: F.textBold, fontSize: 13, letterSpacing: 0.5 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  addTxt: { color: C.brand, fontFamily: F.textBold, fontSize: 13 },
  empty: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13, textAlign: "center", paddingVertical: S.sm },
  itemRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: S.sm, paddingVertical: S.md },
  itemName: { color: C.onSurface, fontFamily: F.textBold, fontSize: 15, flex: 1, marginRight: S.sm },
  pickedTxt: { fontFamily: F.text, fontSize: 12, marginTop: 2 },
  stepper: { flexDirection: "row", alignItems: "center", gap: S.sm },
  stepBtn: { width: 30, height: 30, borderRadius: R.sm, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  qty: { color: C.onSurface, fontFamily: F.textBold, fontSize: 15, minWidth: 28, textAlign: "center" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: C.surfaceSecondary, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, padding: S.lg, paddingBottom: S.xl },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: S.md },
  modalTitle: { color: C.onSurface, fontFamily: F.display, fontSize: 20 },
  pickRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: S.md, borderBottomWidth: 1, borderBottomColor: C.divider },
  pickQty: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13 },
});
