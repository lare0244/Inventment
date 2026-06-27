import React, { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable, Modal, TextInput, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api";
import { storage } from "@/src/utils/storage";
import { useColors, useT } from "@/src/appsettings";
import { F, S, R, Palette } from "@/src/theme";
import { ProductEditor } from "@/src/components/ProductEditor";
import { Btn } from "@/src/components/ui";

const ACTIVE_WH_KEY = "active_warehouse";

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const C = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [product, setProduct] = useState<any>(null);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [activeWh, setActiveWh] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [receive, setReceive] = useState(false);
  const [qty, setQty] = useState("");
  const [bb, setBb] = useState("");

  async function load() {
    try {
      const [p, w] = await Promise.all([api(`/products/${id}`), api<any[]>("/warehouses")]);
      setProduct(p); setWarehouses(w);
      const saved = await storage.getItem<string>(ACTIVE_WH_KEY, "");
      const stockKeys = Object.keys(p?.stock || {});
      setActiveWh((cur) => cur || saved || p?.warehouse_id || stockKeys[0] || w[0]?.id || null);
    } catch {} finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [id]);

  async function pickWarehouse(wid: string) {
    setActiveWh(wid);
    await storage.setItem(ACTIVE_WH_KEY, wid);
  }

  async function doReceive() {
    const n = parseInt(qty); if (!n) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await api("/movements", { method: "POST", body: { product_id: id, type: "receive", quantity: n, warehouse_id: activeWh, best_before_date: bb || null } });
    setReceive(false); setQty(""); setBb(""); load();
  }

  async function del() {
    await api(`/products/${id}`, { method: "DELETE" });
    router.back();
  }

  if (loading) return <View style={styles.c}><ActivityIndicator color={C.brand} /></View>;
  if (!product) return <View style={styles.c}><Text style={{ color: C.onSurface }}>{t("notFound")}</Text></View>;

  return (
    <View style={{ flex: 1 }}>
      <ProductEditor
        title={product.name}
        initial={{
          ...product,
          price: String(product.price ?? 0), cost: String(product.cost ?? 0),
          quantity: String(product.quantity ?? 0), low_stock_threshold: String(product.low_stock_threshold ?? 5),
          barcode: product.barcode || "", sku: product.sku || "", brand: product.brand || "",
          image: product.image || "", purchase_date: product.purchase_date || "",
          best_before_date: product.best_before_date || "", notes: product.notes || "",
        }}
        onSave={async (body) => { await api(`/products/${id}`, { method: "PUT", body }); }}
        onDelete={del}
      />
      <Pressable testID="quick-receive-btn" onPress={() => setReceive(true)} style={[styles.fab, { bottom: insets.bottom + 84 }]}>
        <MaterialCommunityIcons name="arrow-down-bold-circle" size={22} color={C.onBrand} />
        <Text style={styles.fabTxt}>{t("receiveBtn")}</Text>
      </Pressable>

      <Modal visible={receive} transparent animationType="fade" onRequestClose={() => setReceive(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("receiveStock")}</Text>
            <Text style={styles.modalSub}>{t("current")}: {product.quantity} {t("units")}</Text>
            {warehouses.length > 0 && (
              <>
                <Text style={styles.whLabel}>{t("warehouse")}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm, paddingBottom: S.md }}>
                  {warehouses.map((w) => (
                    <Pressable key={w.id} testID={`receive-wh-${w.id}`} onPress={() => pickWarehouse(w.id)}
                      style={[styles.whChip, activeWh === w.id && styles.whChipActive]}>
                      <Text style={[styles.whTxt, activeWh === w.id && { color: C.onBrand }]}>{w.name}</Text>
                      <Text style={[styles.whQty, activeWh === w.id && { color: C.onBrand }]}>{(product.stock?.[w.id] ?? 0)}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}
            <TextInput testID="receive-qty" placeholder={t("qtyReceived")} placeholderTextColor={C.onSurfaceTertiary} value={qty} onChangeText={setQty} keyboardType="number-pad" style={styles.input} />
            <TextInput testID="receive-bb" placeholder={t("bestBeforeOptional")} placeholderTextColor={C.onSurfaceTertiary} value={bb} onChangeText={setBb} style={styles.input} />
            <Btn testID="confirm-receive" title={t("addToStock")} icon="check" onPress={doReceive} />
            <Pressable onPress={() => setReceive(false)} style={{ alignItems: "center", paddingVertical: S.md }}>
              <Text style={{ color: C.onSurfaceTertiary, fontFamily: F.textBold }}>{t("cancel")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  c: { flex: 1, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", right: S.lg, flexDirection: "row", alignItems: "center", gap: S.xs, backgroundColor: C.brand, paddingHorizontal: S.lg, height: 48, borderRadius: R.pill },
  fabTxt: { color: C.onBrand, fontFamily: F.textBold, fontSize: 14 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: S.xl },
  modalCard: { backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, padding: S.lg },
  modalTitle: { color: C.onSurface, fontFamily: F.display, fontSize: 22 },
  modalSub: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13, marginBottom: S.lg },
  whLabel: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 12, marginBottom: S.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  whChip: { flexDirection: "row", alignItems: "center", gap: S.sm, height: 38, paddingHorizontal: S.md, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, flexShrink: 0 },
  whChipActive: { backgroundColor: C.brand, borderColor: C.brand },
  whTxt: { color: C.onSurfaceSecondary, fontFamily: F.textBold, fontSize: 13 },
  whQty: { color: C.onSurfaceTertiary, fontFamily: F.display, fontSize: 14 },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, height: 50, color: C.onSurface, fontFamily: F.text, fontSize: 15, marginBottom: S.md },
});
