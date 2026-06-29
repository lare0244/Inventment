import React, { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useColors, useT } from "@/src/appsettings";
import { F, S, Palette } from "@/src/theme";
import { Btn } from "@/src/components/ui";
import { SalesOrderEditor, SOValue } from "@/src/components/SalesOrderEditor";

export default function NewSalesOrder() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const C = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState<SOValue>({
    field1: "", field2: "", comment: "", shipping_ref: "",
    order_date: new Date().toISOString().slice(0, 10), warehouse_id: null, items: [],
  });

  useEffect(() => {
    (async () => {
      try {
        const [p, w] = await Promise.all([api<any[]>("/products"), api<any[]>("/warehouses")]);
        setProducts(p); setWarehouses(w);
        setValue((v) => ({ ...v, warehouse_id: w[0]?.id || null }));
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  async function save() {
    setSaving(true);
    try {
      await api("/sales-orders", { method: "POST", body: { ...value, items: value.items.map((i) => ({ product_id: i.product_id, name: i.name, quantity: i.quantity })) } });
      router.replace("/sales-orders");
    } catch {} finally { setSaving(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Pressable testID="so-new-back" onPress={() => router.back()} hitSlop={10}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={C.onSurface} />
        </Pressable>
        <Text style={styles.title}>{t("createSalesOrder").toUpperCase()}</Text>
        <View style={{ width: 28 }} />
      </View>
      {loading ? (
        <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 80 }}>
          <SalesOrderEditor value={value} onChange={setValue} products={products} warehouses={warehouses}
            label1={user?.so_field1_label || "Field 1"} label2={user?.so_field2_label || "Field 2"} />
          <Btn testID="so-save" title={t("saveSalesOrder")} icon="content-save-outline" loading={saving} onPress={save} style={{ marginTop: S.md }} />
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingBottom: S.md, borderBottomWidth: 1, borderBottomColor: C.divider },
  title: { color: C.onSurface, fontFamily: F.display, fontSize: 18, letterSpacing: 0.5 },
});
