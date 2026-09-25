import React, { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Pressable, ActivityIndicator, Linking, Alert, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";
import * as ImagePicker from "expo-image-picker";
import { api, uploadImage } from "@/src/api";
import { useColors, useT } from "@/src/appsettings";
import { currencySymbol } from "@/src/currency";
import { useAuth } from "@/src/auth";
import { F, S, R, Palette } from "@/src/theme";
import { Field, Btn, Dropdown } from "@/src/components/ui";
import { ProductImage } from "@/src/components/ProductImage";
import { ProductPicker } from "@/src/components/ProductPicker";
import { useUpgradePrompt } from "@/src/components/UpgradePrompt";

const MEASURE_UNITS = ["ml", "litre", "g", "kilo", "mm", "meter"];

export type ProductForm = {
  name: string; barcode: string; sku: string; brand: string; image: string;
  price: string; cost: string; quantity: string; low_stock_threshold: string;
  category_id: string | null; warehouse_id: string | null; supplier_id: string | null;
  purchase_date: string; best_before_date: string; notes: string;
  measure_value: string; measure_unit: string | null; headline: string; description: string;
  location: string;
  is_production_unit: boolean; bom: { product_id: string; name?: string; qty: number }[];
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
    measure_value: "", measure_unit: null, headline: "", description: "", location: "",
    is_production_unit: false, bom: [], ...initial,
  } as ProductForm);
  const stock: Record<string, number> = (initial as any)?.stock || {};
  const [cats, setCats] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [uploading, setUploading] = useState(false);
  const [bomPicker, setBomPicker] = useState(false);

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

  // Resolve BOM part names for an existing production-unit product.
  useEffect(() => {
    const bom = form.bom || [];
    if (!bom.length || bom.every((b) => b.name)) return;
    (async () => {
      try {
        const prods = await api<any[]>("/products");
        const map: Record<string, string> = {};
        prods.forEach((p) => { map[p.id] = p.name; });
        setForm((f) => ({ ...f, bom: f.bom.map((b) => ({ ...b, name: b.name || map[b.product_id] })) }));
      } catch {}
    })();
  }, []);

  const set = (k: keyof ProductForm, v: any) => setForm((f) => ({ ...f, [k]: v }));
  // when warehouse changes, reflect that warehouse's stock in the quantity field
  const selectWarehouse = (wid: string | null) =>
    setForm((f) => ({ ...f, warehouse_id: wid, quantity: wid && wid in stock ? String(stock[wid]) : "0" }));

  function permDenied() {
    const openIt = () => Linking.openSettings();
    if (Platform.OS === "web" && typeof window !== "undefined") { window.alert(t("photoPermNeeded")); return; }
    Alert.alert(t("photoPermNeeded"), "", [{ text: t("cancel"), style: "cancel" }, { text: t("openSettings"), onPress: openIt }]);
  }

  async function pickImage(fromCamera: boolean) {
    try {
      let res;
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { permDenied(); return; }
        res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.6, allowsEditing: true });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { permDenied(); return; }
        res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6, allowsEditing: true });
      }
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      setUploading(true);
      const path = await uploadImage(asset.uri, asset.fileName || "photo.jpg");
      set("image", path);
    } catch (e: any) {
      setErr(e?.message === "storage_quota" ? t("storageQuota") : (e?.message || t("saveFailed")));
    } finally {
      setUploading(false);
    }
  }

  function addPart(p: any) {
    setForm((f) => f.bom.some((b) => b.product_id === p.id) ? f : { ...f, bom: [...f.bom, { product_id: p.id, name: p.name, qty: 1 }] });
  }
  function removePart(pid: string) {
    setForm((f) => ({ ...f, bom: f.bom.filter((b) => b.product_id !== pid) }));
  }
  function setBomQty(pid: string, delta: number) {
    setForm((f) => ({ ...f, bom: f.bom.map((b) => b.product_id === pid ? { ...b, qty: Math.max(1, (parseInt(String(b.qty), 10) || 1) + delta) } : b) }));
  }

  async function save() {    if (!form.name.trim()) { setErr(t("nameRequired")); return; }
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
        notes: form.notes || null, location: form.location || null,
        is_production_unit: !!form.is_production_unit,
        bom: form.is_production_unit ? (form.bom || []).map((b) => ({ product_id: b.product_id, qty: Math.max(1, parseInt(String(b.qty), 10) || 1) })) : [],
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
        <View style={styles.photoRow}>
          <View style={styles.photoBox}>
            {uploading ? (
              <ActivityIndicator color={C.brand} />
            ) : form.image ? (
              <ProductImage path={form.image} style={styles.photoImg} />
            ) : (
              <MaterialCommunityIcons name="image-outline" size={34} color={C.onSurfaceTertiary} />
            )}
          </View>
          <View style={{ flex: 1, gap: S.sm }}>
            <View style={{ flexDirection: "row", gap: S.sm }}>
              <View style={{ flex: 1 }}><Btn testID="photo-camera" title={t("takePhoto")} icon="camera-outline" variant="secondary" onPress={() => pickImage(true)} /></View>
              <View style={{ flex: 1 }}><Btn testID="photo-gallery" title={t("choosePhoto")} icon="image-multiple-outline" variant="secondary" onPress={() => pickImage(false)} /></View>
            </View>
            {!!form.image && (
              <Pressable testID="photo-remove" onPress={() => set("image", "")} hitSlop={8} style={{ alignSelf: "flex-start" }}>
                <Text style={styles.removePhoto}>{t("removePhoto")}</Text>
              </Pressable>
            )}
          </View>
        </View>
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
        <Field label={t("binLocation")} testID="f-location" value={form.location} onChangeText={(v) => set("location", v)} placeholder={t("binLocationHint")} />
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

        <View style={styles.bomToggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bomToggleTitle}>{t("productionUnit")}</Text>
            <Text style={styles.bomToggleSub}>{t("productionUnitHint")}</Text>
          </View>
          <Switch testID="f-production-unit" value={!!form.is_production_unit}
            onValueChange={(v) => set("is_production_unit", v as any)}
            trackColor={{ true: C.brand, false: C.surfaceTertiary }} thumbColor="#fff" />
        </View>

        {form.is_production_unit && (
          <View style={styles.bomBox}>
            <Text style={styles.bomHead}>{t("productionParts")}</Text>
            {(form.bom || []).length === 0 ? (
              <Text style={styles.bomEmpty}>{t("noParts")}</Text>
            ) : (
              (form.bom || []).map((part, idx) => (
                <View key={part.product_id} style={styles.partRow}>
                  <Text style={styles.partName} numberOfLines={1}>{part.name || part.product_id}</Text>
                  <View style={styles.partStepper}>
                    <Pressable testID={`bom-minus-${idx}`} onPress={() => setBomQty(part.product_id, -1)} style={styles.partStepBtn}><MaterialCommunityIcons name="minus" size={15} color={C.onSurface} /></Pressable>
                    <Text style={styles.partQty}>{part.qty}</Text>
                    <Pressable testID={`bom-plus-${idx}`} onPress={() => setBomQty(part.product_id, 1)} style={styles.partStepBtn}><MaterialCommunityIcons name="plus" size={15} color={C.onSurface} /></Pressable>
                  </View>
                  <Pressable testID={`bom-remove-${idx}`} onPress={() => removePart(part.product_id)} hitSlop={6}>
                    <MaterialCommunityIcons name="close" size={18} color={C.error} />
                  </Pressable>
                </View>
              ))
            )}
            <Text style={styles.bomQtyHint}>{t("qtyPerUnit")}</Text>
            <Btn testID="bom-add" title={t("addPart")} icon="plus" variant="secondary" onPress={() => setBomPicker(true)} style={{ marginTop: S.sm }} />
          </View>
        )}

        {!!err && <Text style={styles.err}>{err}</Text>}
      </ScrollView>

      <ProductPicker visible={bomPicker} onClose={() => setBomPicker(false)} title={t("addPart")}
        excludeIds={[...(form.bom || []).map((b) => b.product_id), (initial as any)?.id].filter(Boolean)}
        onSelect={(p) => { addPart(p); setBomPicker(false); }} />

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
  photoRow: { flexDirection: "row", gap: S.md, marginBottom: S.lg, alignItems: "center" },
  photoBox: { width: 90, height: 90, borderRadius: R.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  photoImg: { width: 90, height: 90 },
  removePhoto: { color: C.error, fontFamily: F.textBold, fontSize: 13 },
  bomToggleRow: { flexDirection: "row", alignItems: "center", gap: S.md, marginTop: S.lg, paddingVertical: S.sm },
  bomToggleTitle: { color: C.onSurface, fontFamily: F.textBold, fontSize: 15 },
  bomToggleSub: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, marginTop: 2 },
  bomBox: { backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: S.md, marginTop: S.sm },
  bomHead: { color: C.onSurfaceSecondary, fontFamily: F.textBold, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", marginBottom: S.sm },
  bomEmpty: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13 },
  bomQtyHint: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 11, marginTop: S.sm },
  partRow: { flexDirection: "row", alignItems: "center", gap: S.sm, paddingVertical: S.sm, borderBottomWidth: 1, borderBottomColor: C.divider },
  partName: { flex: 1, color: C.onSurface, fontFamily: F.text, fontSize: 14 },
  partStepper: { flexDirection: "row", alignItems: "center", gap: S.xs },
  partStepBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", backgroundColor: C.surface },
  partQty: { color: C.onSurface, fontFamily: F.textBold, fontSize: 15, minWidth: 26, textAlign: "center" },
  label: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 13, marginBottom: S.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  chip: { height: 36, paddingHorizontal: S.lg, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", flexShrink: 0, backgroundColor: C.surfaceSecondary },
  chipActive: { backgroundColor: C.brand, borderColor: C.brand },
  chipTxt: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 13 },
  noneTxt: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13 },
  err: { color: C.error, fontFamily: F.text, marginTop: S.sm },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: S.lg, paddingTop: S.sm, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.divider },
});
