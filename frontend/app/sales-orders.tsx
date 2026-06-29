import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors, useT } from "@/src/appsettings";
import { F, S, Palette } from "@/src/theme";
import { SalesOrdersPanel } from "@/src/components/SalesOrdersPanel";

export default function SalesOrdersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Pressable testID="so-list-back" onPress={() => router.back()} hitSlop={10}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={C.onSurface} />
        </Pressable>
        <Text style={styles.title}>{t("orders").toUpperCase()}</Text>
        <Pressable testID="so-list-add" onPress={() => router.push("/sales-order/new")} hitSlop={10}>
          <MaterialCommunityIcons name="plus" size={26} color={C.brand} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 80 }} testID="so-list-scroll">
        <SalesOrdersPanel />
      </ScrollView>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingBottom: S.md, borderBottomWidth: 1, borderBottomColor: C.divider },
  title: { color: C.onSurface, fontFamily: F.display, fontSize: 20, letterSpacing: 1 },
});
