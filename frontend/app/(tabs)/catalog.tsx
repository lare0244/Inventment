import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { api } from "@/src/api";
import { C, F, S, R, stockColor } from "@/src/theme";
import { StatusDot } from "@/src/components/ui";

export default function Catalog() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [products, setProducts] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([api("/products"), api("/categories")]);
      setProducts(p); setCats(c);
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = products.filter((p) =>
    (!activeCat || p.category_id === activeCat) &&
    (!search || p.name?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + S.md }]}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>CATALOG</Text>
          <Pressable testID="add-product-btn" onPress={() => router.push("/product/new")} style={styles.addBtn}>
            <MaterialCommunityIcons name="plus" size={22} color={C.onBrand} />
          </Pressable>
        </View>
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={18} color={C.onSurfaceTertiary} />
          <TextInput
            testID="catalog-search"
            placeholder="Search products"
            placeholderTextColor={C.onSurfaceTertiary}
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Chip label="All" active={!activeCat} onPress={() => setActiveCat(null)} />
          {cats.map((c) => (
            <Chip key={c.id} label={c.name} active={activeCat === c.id} onPress={() => setActiveCat(c.id)} />
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: S.lg, paddingBottom: 40 }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <MaterialCommunityIcons name="package-variant-closed" size={56} color={C.surfaceTertiary} />
            <Text style={styles.emptyTxt}>No products yet</Text>
            <Text style={styles.emptySub}>Tap + or scan a barcode to add stock</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            testID={`product-row-${item.id}`}
            onPress={() => router.push(`/product/${item.id}`)}
            style={styles.card}
          >
            {item.image ? (
              <Image source={{ uri: item.image }} style={styles.thumb} contentFit="cover" />
            ) : (
              <View style={[styles.thumb, styles.thumbPh]}>
                <MaterialCommunityIcons name="cube-outline" size={24} color={C.onSurfaceTertiary} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.pName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.pSku}>{item.sku || item.barcode || "No SKU"} · ${item.price}</Text>
            </View>
            <View style={styles.qtyWrap}>
              <StatusDot color={stockColor(item.quantity, item.low_stock_threshold)} />
              <Text style={styles.qty}>{item.quantity}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={C.onSurfaceTertiary} />
          </Pressable>
        )}
      />
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: S.lg, paddingBottom: S.sm, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.divider },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: S.md },
  title: { color: C.onSurface, fontFamily: F.display, fontSize: 26, letterSpacing: 1 },
  addBtn: { width: 40, height: 40, borderRadius: R.md, backgroundColor: C.brand, alignItems: "center", justifyContent: "center" },
  searchBox: { flexDirection: "row", alignItems: "center", gap: S.sm, backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, height: 44 },
  searchInput: { flex: 1, color: C.onSurface, fontFamily: F.text, fontSize: 15 },
  chipRow: { gap: S.sm, paddingVertical: S.md, paddingRight: S.lg },
  chip: { height: 36, paddingHorizontal: S.lg, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", flexShrink: 0, backgroundColor: C.surfaceSecondary },
  chipActive: { backgroundColor: C.brand, borderColor: C.brand },
  chipTxt: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 13 },
  chipTxtActive: { color: C.onBrand },
  card: { flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: S.md, marginBottom: S.sm },
  thumb: { width: 48, height: 48, borderRadius: R.sm, backgroundColor: C.surfaceTertiary },
  thumbPh: { alignItems: "center", justifyContent: "center" },
  pName: { color: C.onSurface, fontFamily: F.textBold, fontSize: 15 },
  pSku: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, marginTop: 2 },
  qtyWrap: { alignItems: "center", gap: 2, marginRight: S.xs },
  qty: { color: C.onSurface, fontFamily: F.display, fontSize: 18 },
  emptyWrap: { alignItems: "center", marginTop: 80, gap: S.sm },
  emptyTxt: { color: C.onSurface, fontFamily: F.textBold, fontSize: 16 },
  emptySub: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13 },
});
