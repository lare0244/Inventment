import React, { useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useColors, useT } from "@/src/appsettings";
import { money } from "@/src/currency";
import { F, S, R, stockColor, Palette } from "@/src/theme";
import { StatusDot, Dropdown } from "@/src/components/ui";

export default function Catalog() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currency } = useAuth();
  const C = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [products, setProducts] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [activeWh, setActiveWh] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<"name" | "stock" | "category" | "price">("name");
  const [catSort, setCatSort] = useState<"count" | "name">("count");

  const load = useCallback(async () => {
    try {
      const wq = activeWh ? `?warehouse_id=${activeWh}` : "";
      const [p, c, w] = await Promise.all([api(`/products${wq}`), api("/categories"), api("/warehouses")]);
      setProducts(p); setCats(c); setWarehouses(w);
    } catch {}
  }, [activeWh]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const catName = (id: string) => cats.find((c) => c.id === id)?.name || "";
  const catCounts = useMemo(() => {
    const m: Record<string, number> = {};
    products.forEach((p) => { if (p.category_id) m[p.category_id] = (m[p.category_id] || 0) + 1; });
    return m;
  }, [products]);
  const sortedCats = useMemo(() => {
    const arr = [...cats];
    arr.sort((a, b) => catSort === "name"
      ? (a.name || "").localeCompare(b.name || "")
      : (catCounts[b.id] || 0) - (catCounts[a.id] || 0) || (a.name || "").localeCompare(b.name || ""));
    return arr;
  }, [cats, catSort, catCounts]);
  const topCats = useMemo(() =>
    [...cats].sort((a, b) => (catCounts[b.id] || 0) - (catCounts[a.id] || 0)).slice(0, 5),
  [cats, catCounts]);

  const q = search.trim().toLowerCase();
  const filtered = products.filter((p) =>
    (!activeCat || p.category_id === activeCat) &&
    (!q || p.name?.toLowerCase().includes(q) || catName(p.category_id).toLowerCase().includes(q))
  ).sort((a, b) => {
    if (sortMode === "name") return (a.name || "").localeCompare(b.name || "");
    if (sortMode === "stock") return (a.quantity || 0) - (b.quantity || 0);
    if (sortMode === "price") return (a.price || 0) - (b.price || 0);
    return catName(a.category_id).localeCompare(catName(b.category_id)) || (a.name || "").localeCompare(b.name || "");
  });

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + S.md }]}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t("catalog").toUpperCase()}</Text>
          <Pressable testID="add-product-btn" onPress={() => router.push("/product/new")} style={styles.addBtn}>
            <MaterialCommunityIcons name="plus" size={22} color={C.onBrand} />
          </Pressable>
        </View>
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={18} color={C.onSurfaceTertiary} />
          <TextInput
            testID="catalog-search"
            placeholder={t("searchProducts")}
            placeholderTextColor={C.onSurfaceTertiary}
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Chip label={t("all")} active={!activeCat} onPress={() => setActiveCat(null)} styles={styles} />
          {topCats.map((c) => (
            <Chip key={c.id} label={`${c.name} (${catCounts[c.id] || 0})`} active={activeCat === c.id} onPress={() => setActiveCat(c.id)} styles={styles} />
          ))}
        </ScrollView>
        {cats.length > 5 && (
          <View style={styles.catPickerRow}>
            <View style={{ flex: 1 }}>
              <Dropdown testID="cat-dropdown" value={activeCat} placeholder={t("allCategories")}
                onChange={(v) => setActiveCat(v || null)}
                options={[{ value: "", label: t("allCategories") }, ...sortedCats.map((c) => ({ value: c.id, label: c.name, sub: `${catCounts[c.id] || 0} ${t("items")}` }))]} />
            </View>
            <Pressable testID="cat-sort-toggle" onPress={() => setCatSort((s) => (s === "count" ? "name" : "count"))} style={styles.catSortBtn}>
              <MaterialCommunityIcons name={catSort === "count" ? "sort-numeric-variant" : "sort-alphabetical-variant"} size={18} color={C.brand} />
              <Text style={styles.catSortTxt}>{catSort === "count" ? t("byCount") : t("byName")}</Text>
            </Pressable>
          </View>
        )}
        {warehouses.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.whChipRow}>
            <Chip label={t("allWarehouses")} active={!activeWh} onPress={() => setActiveWh(null)} styles={styles} />
            {warehouses.map((w) => (
              <Chip key={w.id} label={w.name} active={activeWh === w.id} onPress={() => setActiveWh(w.id)} styles={styles} />
            ))}
          </ScrollView>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortRow}>
          <Text style={styles.sortLabel}>{t("sortBy")}:</Text>
          <Pressable testID="catalog-sort-name" onPress={() => setSortMode("name")} style={[styles.sortChip, sortMode === "name" && styles.sortChipActive]}>
            <Text style={[styles.sortTxt, sortMode === "name" && { color: C.onBrand }]}>{t("sortName")}</Text>
          </Pressable>
          <Pressable testID="catalog-sort-stock" onPress={() => setSortMode("stock")} style={[styles.sortChip, sortMode === "stock" && styles.sortChipActive]}>
            <Text style={[styles.sortTxt, sortMode === "stock" && { color: C.onBrand }]}>{t("sortStock")}</Text>
          </Pressable>
          <Pressable testID="catalog-sort-category" onPress={() => setSortMode("category")} style={[styles.sortChip, sortMode === "category" && styles.sortChipActive]}>
            <Text style={[styles.sortTxt, sortMode === "category" && { color: C.onBrand }]}>{t("category")}</Text>
          </Pressable>
          <Pressable testID="catalog-sort-price" onPress={() => setSortMode("price")} style={[styles.sortChip, sortMode === "price" && styles.sortChipActive]}>
            <Text style={[styles.sortTxt, sortMode === "price" && { color: C.onBrand }]}>{t("price")}</Text>
          </Pressable>
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: S.lg, paddingBottom: 40 }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <MaterialCommunityIcons name="package-variant-closed" size={56} color={C.surfaceTertiary} />
            <Text style={styles.emptyTxt}>{t("noProducts")}</Text>
            <Text style={styles.emptySub}>{t("addOrScan")}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const low = item.quantity <= item.low_stock_threshold;
          return (
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
                <View style={styles.nameRow}>
                  <Text style={styles.pName} numberOfLines={1}>{item.name}</Text>
                  {low && (
                    <View testID={`low-badge-${item.id}`} style={styles.lowBadge}>
                      <MaterialCommunityIcons name="alert" size={11} color={item.quantity <= 0 ? C.error : C.warning} />
                      <Text style={[styles.lowBadgeTxt, { color: item.quantity <= 0 ? C.error : C.warning }]}>{t("lowBadge")}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.pSku}>{item.sku || item.barcode || t("noSku")} · {money(item.price, currency)}{item.measure_value != null && item.measure_unit ? ` · ${item.measure_value} ${item.measure_unit}` : ""}</Text>
              </View>
              <View style={styles.qtyWrap}>
                <StatusDot color={stockColor(item.quantity, item.low_stock_threshold, C)} />
                <Text style={styles.qty}>{item.quantity}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={C.onSurfaceTertiary} />
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function Chip({ label, active, onPress, styles }: { label: string; active: boolean; onPress: () => void; styles: any }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  header: { paddingHorizontal: S.lg, paddingBottom: S.sm, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.divider },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: S.md },
  title: { color: C.onSurface, fontFamily: F.display, fontSize: 26, letterSpacing: 1 },
  addBtn: { width: 40, height: 40, borderRadius: R.md, backgroundColor: C.brand, alignItems: "center", justifyContent: "center" },
  searchBox: { flexDirection: "row", alignItems: "center", gap: S.sm, backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, height: 44 },
  searchInput: { flex: 1, color: C.onSurface, fontFamily: F.text, fontSize: 15 },
  chipRow: { gap: S.sm, paddingVertical: S.md, paddingRight: S.lg },
  whChipRow: { gap: S.sm, paddingBottom: S.md, paddingRight: S.lg },
  catPickerRow: { flexDirection: "row", alignItems: "center", gap: S.sm, paddingBottom: S.md },
  catSortBtn: { flexDirection: "row", alignItems: "center", gap: S.xs, height: 50, paddingHorizontal: S.md, borderRadius: R.md, borderWidth: 1, borderColor: C.brand, backgroundColor: C.surfaceSecondary },
  catSortTxt: { color: C.brand, fontFamily: F.textBold, fontSize: 12 },
  chip: { height: 36, paddingHorizontal: S.lg, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", flexShrink: 0, backgroundColor: C.surfaceSecondary },
  chipActive: { backgroundColor: C.brand, borderColor: C.brand },
  chipTxt: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 13 },
  chipTxtActive: { color: C.onBrand },
  sortRow: { flexDirection: "row", alignItems: "center", gap: S.sm, paddingTop: S.sm },
  sortLabel: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12 },
  sortChip: { height: 30, paddingHorizontal: S.md, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", backgroundColor: C.surfaceSecondary },
  sortChipActive: { backgroundColor: C.brand, borderColor: C.brand },
  sortTxt: { color: C.onSurfaceSecondary, fontFamily: F.textBold, fontSize: 12 },
  card: { flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: S.md, marginBottom: S.sm },
  thumb: { width: 48, height: 48, borderRadius: R.sm, backgroundColor: C.surfaceTertiary },
  thumbPh: { alignItems: "center", justifyContent: "center" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: S.sm },
  pName: { color: C.onSurface, fontFamily: F.textBold, fontSize: 15, flexShrink: 1 },
  lowBadge: { flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: R.sm, borderWidth: 1, borderColor: C.warning, backgroundColor: C.isDark ? "rgba(255,234,0,0.08)" : "rgba(230,149,0,0.12)" },
  lowBadgeTxt: { fontFamily: F.textBold, fontSize: 9, letterSpacing: 0.5 },
  pSku: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, marginTop: 2 },
  qtyWrap: { alignItems: "center", gap: 2, marginRight: S.xs },
  qty: { color: C.onSurface, fontFamily: F.display, fontSize: 18 },
  emptyWrap: { alignItems: "center", marginTop: 80, gap: S.sm },
  emptyTxt: { color: C.onSurface, fontFamily: F.textBold, fontSize: 16 },
  emptySub: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13 },
});
