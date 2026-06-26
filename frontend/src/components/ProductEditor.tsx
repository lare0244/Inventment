import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { C, F, S, R } from "@/src/theme";
import { Field, Btn } from "@/src/components/ui";

export type ProductForm = {
  name: string; barcode: string; sku: string; brand: string; image: string;
  price: string; cost: string; quantity: string; low_stock_threshold: string;
  category_id: string | null; warehouse_id: string | null; supplier_id: string | null;
  purchase_date: string; best_before_date: string; notes: string;
};

export function ProductEditor({
  initial, title, onSave, onDelete,
}: {
  initial: Partial<ProductForm>;
  title: string;
  onSave: (body: any) => Promise<void>;
  onDelete?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [form, setForm] = useState<ProductForm>({
    name: "", barcode: "", sku: "", brand: "", image: "", price: "0", cost: "0",
    quantity: "0", low_stock_threshold: "5", category_id: null, warehouse_id: null,
    supplier_id: null, purchase_date: "", best_before_date: "", notes: "", ...initial,
  } as ProductForm);
  const [cats, setCats] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const [c, w, s] = await Promise.all([api("/categories"), api("/warehouses"), api("/suppliers")]);
      setCats(c); setWarehouses(w); setSuppliers(s);
      setForm((f) => ({ ...f, warehouse_id: f.warehouse_id || w[0]?.id || null }));
    })();
  }, []);

  const set = (k: keyof ProductForm, v: any) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.name.trim()) { setErr("Product name is required"); return; }
    setErr(""); setSaving(true);
    try {
      await onSave({
        name: form.name, barcode: form.barcode || null, sku: form.sku || null,
        brand: form.brand || null, image: form.image || null,
        price: parseFloat(form.price) || 0, cost: parseFloat(form.cost) || 0,
        quantity: parseInt(form.quantity) || 0, low_stock_threshold: parseInt(form.low_stock_threshold) || 5,
        category_id: form.category_id, warehouse_id: form.warehouse_id, supplier_id: form.supplier_id,
        purchase_date: form.purchase_date || null, best_before_date: form.best_before_date || null,
        notes: form.notes || null,
      });
      router.back();
    } catch (e: any) {
      setErr(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const Picker = ({ label, items, value, onSelect }: any) => (
    <View style={{ marginBottom: S.lg }}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
        {items.map((it: any) => (
          <Pressable key={it.id} onPress={() => onSelect(value === it.id ? null : it.id)}
            style={[styles.chip, value === it.id && styles.chipActive]}>
            <Text style={[styles.chipTxt, value === it.id && styles.chipTxtActive]}>{it.name}</Text>
          </Pressable>
        ))}
        {items.length === 0 && <Text style={styles.noneTxt}>Add in Settings</Text>}
      </ScrollView>
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Pressable testID="back-btn" onPress={() => router.back()} hitSlop={10}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={C.onSurface} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {onDelete ? (
          <Pressable testID="delete-product-btn" onPress={onDelete} hitSlop={10}>
            <MaterialCommunityIcons name="trash-can-outline" size={22} color={C.error} />
          </Pressable>
        ) : <View style={{ width: 22 }} />}
      </View>

      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <Field label="Product Name" testID="f-name" value={form.name} onChangeText={(v) => set("name", v)} placeholder="e.g. Steel Bolts M8" />
        <View style={styles.two}>
          <View style={styles.half}><Field label="Barcode" testID="f-barcode" value={form.barcode} onChangeText={(v) => set("barcode", v)} placeholder="UPC" /></View>
          <View style={styles.half}><Field label="SKU" testID="f-sku" value={form.sku} onChangeText={(v) => set("sku", v)} placeholder="SKU" /></View>
        </View>
        <View style={styles.two}>
          <View style={styles.half}><Field label="Price ($)" testID="f-price" value={form.price} onChangeText={(v) => set("price", v)} keyboardType="decimal-pad" /></View>
          <View style={styles.half}><Field label="Cost ($)" testID="f-cost" value={form.cost} onChangeText={(v) => set("cost", v)} keyboardType="decimal-pad" /></View>
        </View>
        <View style={styles.two}>
          <View style={styles.half}><Field label="Quantity" testID="f-qty" value={form.quantity} onChangeText={(v) => set("quantity", v)} keyboardType="number-pad" /></View>
          <View style={styles.half}><Field label="Low Stock At" testID="f-threshold" value={form.low_stock_threshold} onChangeText={(v) => set("low_stock_threshold", v)} keyboardType="number-pad" /></View>
        </View>
        <Field label="Purchase Date" testID="f-purchase" value={form.purchase_date} onChangeText={(v) => set("purchase_date", v)} placeholder="YYYY-MM-DD" />
        <Field label="Best Before Date" testID="f-bestbefore" value={form.best_before_date} onChangeText={(v) => set("best_before_date", v)} placeholder="YYYY-MM-DD" />
        <Picker label="Warehouse" items={warehouses} value={form.warehouse_id} onSelect={(v: any) => set("warehouse_id", v)} />
        <Picker label="Category" items={cats} value={form.category_id} onSelect={(v: any) => set("category_id", v)} />
        <Picker label="Supplier" items={suppliers} value={form.supplier_id} onSelect={(v: any) => set("supplier_id", v)} />
        <Field label="Notes" testID="f-notes" value={form.notes} onChangeText={(v) => set("notes", v)} placeholder="Optional notes" multiline />
        {!!err && <Text style={styles.err}>{err}</Text>}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + S.sm }]}>
        <Btn testID="save-product-btn" title="Save Changes" icon="content-save" loading={saving} onPress={save} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingBottom: S.md, borderBottomWidth: 1, borderBottomColor: C.divider },
  title: { flex: 1, color: C.onSurface, fontFamily: F.display, fontSize: 22, marginHorizontal: S.sm },
  two: { flexDirection: "row", gap: S.md },
  half: { flex: 1 },
  label: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 13, marginBottom: S.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  chip: { height: 36, paddingHorizontal: S.lg, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", flexShrink: 0, backgroundColor: C.surfaceSecondary },
  chipActive: { backgroundColor: C.brand, borderColor: C.brand },
  chipTxt: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 13 },
  chipTxtActive: { color: C.onBrand },
  noneTxt: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13 },
  err: { color: C.error, fontFamily: F.text, marginTop: S.sm },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: S.lg, paddingTop: S.sm, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.divider },
});
