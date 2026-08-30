import React, { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useColors, useT } from "@/src/appsettings";
import { currencySymbol } from "@/src/currency";
import { useAuth } from "@/src/auth";
import { F, S, R, Palette } from "@/src/theme";
import { Field, Btn, Dropdown } from "@/src/components/ui";
import { useUpgradePrompt } from "@/src/components/UpgradePrompt";

const MEASURE_UNITS = ["ml", "litre", "g", "kilo", "mm", "meter"];

export type ProductForm = {
  name: string; barcode: string; sku: string; brand: string; image: string;
  price: string; cost: string; quantity: string; low_stock_threshold: string;
  category_id: string | null; warehouse_id: string | null; supplier_id: string | null;
  purchase_date: string; best_before_date: string; notes: string;
  measure_value: string; measure_unit: string | null; headline: string; description: string;
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
  const C = useColors();
  const t = useT();
  const { showUpgrade } = useUpgradePrompt();
  const { currency } = useAuth();
  const sym = currencySymbol(currency);
  const styles = useMemo(() => makeStyles(C), [C]);
  const [form, setForm] = useState<ProductForm>({
    name: "", barcode: "", sku: "", brand: "", image: "", price: "0", cost: "0",
    quantity: "0", low_stock_threshold: "5", category_id: null, warehouse_id: null,
    supplier_id: null, purchase_date: "", best_before_date: "", notes: "",
    measure_value: "", measure_unit: null, headline: "", description: "", ...initial,
  } as ProductForm);
  const stock: Record<string, number> = (initial as any)?.stock || {};
  const [cats, setCats] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const [c, w, s] = await Promise.all([api("/categories"), api("/warehouses"), api("/suppliers")]);
      setCats(c); setWarehouses(w); setSuppliers(s);
      setForm((f) => {
        const wid = f.warehouse_id || w[0]?.id || null;
        const q = wid && wid in stock ? String(stock[wid]) : f.quantity;
        return { ...f, warehouse_id: wid, quantity: q };
      });
    })();
  }, []);

  const set = (k: keyof ProductForm, v: any) => setForm((f) => ({ ...f, [k]: v }));
  // when warehouse changes, reflect that warehouse's stock in the quantity field
  const selectWarehouse = (wid: string | null) =>
    setForm((f) => ({ ...f, warehouse_id: wid, quantity: wid && wid in stock ? String(stock[wid]) : "0" }));

  async function save() {
    if (!form.name.trim()) { setErr(t("nameRequired")); return; }
    setErr(""); setSaving(true);
    try {
      await onSave({
        name: form.name, barcode: form.barcode || null, sku: form.sku || null,
        brand: form.brand || null, image: form.image || null,
        price: parseFloat(form.price) || 0, cost: parseFloat(form.cost) || 0,
        quantity: parseInt(form.quantity) || 0, low_stock_threshold: parseInt(form.low_stock_threshold) || 5,
        category_id: form.category_id, warehouse_id: form.warehouse_id, supplier_id: form.supplier_id,
        purchase_date: form.purchase_date || null, best_before_date: form.best_before_date || null,
        measure_value: form.measure_value ? parseFloat(form.measure_value) : null,
        measure_unit: form.measure_unit || null,
        headline: form.headline || null, description: form.description || null,
        notes: form.notes || null,
      });
      router.back();
    } catch (e: any) {
      if (e.message?.includes("limit_reached")) showUpgrade({ kind: "products" });
      else setErr(e.message || t("saveFailed"));
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
            <Text style={[styles.chipTxt, value === it.id && { color: C.onBrand }]}>{it.name}</Text>
          </Pressable>
        ))}
        {items.length === 0 && <Text style={styles.noneTxt}>{t("addInSettings")}</Text>}
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
        <Field label={t("productName")} testID="f-name" value={form.name} onChangeText={(v) => set("name", v)} placeholder="e.g. Steel Bolts M8" />
        <Field label={t("headline")} testID="f-headline" value={form.headline} onChangeText={(v) => set("headline", v)} placeholder={t("headlineHint")} />
        <Field label={t("description")} testID="f-description" value={form.description} onChangeText={(v) => set("description", v)} placeholder={t("descriptionHint")} multiline />
        <View style={styles.two}>
          <View style={styles.half}><Field label={t("barcode")} testID="f-barcode" value={form.barcode} onChangeText={(v) => set("barcode", v)} placeholder="UPC" /></View>
          <View style={styles.half}><Field label={t("sku")} testID="f-sku" value={form.sku} onChangeText={(v) => set("sku", v)} placeholder="SKU" /></View>
        </View>
        <View style={styles.two}>
          <View style={styles.half}><Field label={`${t("price")} (${sym})`} testID="f-price" value={form.price} onChangeText={(v) => set("price", v)} keyboardType="decimal-pad" /></View>
          <View style={styles.half}><Field label={`${t("cost")} (${sym})`} testID="f-cost" value={form.cost} onChangeText={(v) => set("cost", v)} keyboardType="decimal-pad" /></View>
        </View>
        <View style={styles.two}>
          <View style={styles.half}><Field label={`${t("quantity")} (${t("warehouse")})`} testID="f-qty" value={form.quantity} onChangeText={(v) => set("quantity", v)} keyboardType="number-pad" /></View>
          <View style={styles.half}><Field label={t("lowStockAt")} testID="f-threshold" value={form.low_stock_threshold} onChangeText={(v) => set("low_stock_threshold", v)} keyboardType="number-pad" /></View>
        </View>
        <Field label={t("purchaseDate")} testID="f-purchase" value={form.purchase_date} onChangeText={(v) => set("purchase_date", v)} placeholder="YYYY-MM-DD" />
        <Field label={t("bestBefore")} testID="f-bestbefore" value={form.best_before_date} onChangeText={(v) => set("best_before_date", v)} placeholder="YYYY-MM-DD" />
        <View style={styles.two}>
          <View style={styles.half}><Field label={t("measure")} testID="f-measure-value" value={form.measure_value} onChangeText={(v) => set("measure_value", v)} keyboardType="decimal-pad" placeholder="0" /></View>
          <View style={styles.half}>
            <Text style={styles.label}>{t("unit")}</Text>
            <Dropdown testID="f-measure-unit" value={form.measure_unit} placeholder={t("selectUnit")}
              onChange={(v) => set("measure_unit", v)}
              options={MEASURE_UNITS.map((u) => ({ value: u, label: u }))} />
          </View>
        </View>
        <Picker label={t("warehouse")} items={warehouses} value={form.warehouse_id} onSelect={(v: any) => selectWarehouse(v || warehouses[0]?.id || null)} />
        <Picker label={t("category")} items={cats} value={form.category_id} onSelect={(v: any) => set("category_id", v)} />
        <Picker label={t("supplier")} items={suppliers} value={form.supplier_id} onSelect={(v: any) => set("supplier_id", v)} />
        <Field label={t("notes")} testID="f-notes" value={form.notes} onChangeText={(v) => set("notes", v)} placeholder={t("optionalNotes")} multiline />
        {!!err && <Text style={styles.err}>{err}</Text>}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + S.sm }]}>
        <Btn testID="save-product-btn" title={t("saveChanges")} icon="content-save" loading={saving} onPress={save} />
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingBottom: S.md, borderBottomWidth: 1, borderBottomColor: C.divider },
  title: { flex: 1, color: C.onSurface, fontFamily: F.display, fontSize: 22, marginHorizontal: S.sm },
  two: { flexDirection: "row", gap: S.md },
  half: { flex: 1 },
  label: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 13, marginBottom: S.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  chip: { height: 36, paddingHorizontal: S.lg, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", flexShrink: 0, backgroundColor: C.surfaceSecondary },
  chipActive: { backgroundColor: C.brand, borderColor: C.brand },
  chipTxt: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 13 },
  noneTxt: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13 },
  err: { color: C.error, fontFamily: F.text, marginTop: S.sm },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: S.lg, paddingTop: S.sm, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.divider },
});
