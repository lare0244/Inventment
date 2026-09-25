import React, { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, Modal, TextInput, Pressable, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";
import { api } from "@/src/api";
import { useColors, useT } from "@/src/appsettings";
import { F, S, R, Palette } from "@/src/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (product: any) => void;
  excludeIds?: string[];
  productionOnly?: boolean;
  title?: string;
};

export function ProductPicker({ visible, onClose, onSelect, excludeIds = [], productionOnly, title }: Props) {
  const insets = useSafeAreaInsets();
  const C = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [products, setProducts] = useState<any[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!visible) { setQ(""); return; }
    (async () => { try { setProducts(await api<any[]>("/products")); } catch {} })();
  }, [visible]);

  const filtered = products.filter((p) =>
    !excludeIds.includes(p.id) &&
    (!productionOnly || p.is_production_unit) &&
    (!q.trim() || p.name?.toLowerCase().includes(q.toLowerCase()) ||
      p.sku?.toLowerCase().includes(q.toLowerCase()) || p.barcode?.toLowerCase().includes(q.toLowerCase())));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>{title || t("selectProduct")}</Text>
          <Pressable testID="pp-close" onPress={onClose} hitSlop={10}>
            <MaterialCommunityIcons name="close" size={26} color={C.onSurface} />
          </Pressable>
        </View>
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={20} color={C.onSurfaceTertiary} />
          <TextInput testID="pp-search" value={q} onChangeText={setQ} placeholder={t("searchProducts")}
            placeholderTextColor={C.onSurfaceTertiary} style={styles.searchInput} autoFocus />
        </View>
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: S.lg }}
          ListEmptyComponent={<Text style={styles.empty}>{productionOnly ? t("noProductionUnits") : t("noResults")}</Text>}
          renderItem={({ item }) => (
            <Pressable testID={`pp-item-${item.id}`} onPress={() => onSelect(item)} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.meta} numberOfLines={1}>{item.sku || item.barcode || "-"} · {t("systemQty")}: {item.quantity ?? 0}</Text>
              </View>
              <MaterialCommunityIcons name="plus-circle" size={22} color={C.brand} />
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingVertical: S.md, borderBottomWidth: 1, borderBottomColor: C.divider },
  title: { color: C.onSurface, fontFamily: F.display, fontSize: 20, flex: 1 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: S.sm, margin: S.lg, marginBottom: 0, backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, height: 48 },
  searchInput: { flex: 1, color: C.onSurface, fontFamily: F.text, fontSize: 15 },
  row: { flexDirection: "row", alignItems: "center", gap: S.md, paddingVertical: S.md, borderBottomWidth: 1, borderBottomColor: C.divider },
  name: { color: C.onSurface, fontFamily: F.textBold, fontSize: 15 },
  meta: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, marginTop: 2 },
  empty: { color: C.onSurfaceTertiary, fontFamily: F.text, textAlign: "center", marginTop: 40 },
});
