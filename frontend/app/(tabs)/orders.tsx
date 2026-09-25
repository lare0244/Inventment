import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";
import { useColors, useT } from "@/src/appsettings";
import { F, S, R, Palette } from "@/src/theme";
import { Card } from "@/src/components/ui";

type Tool = { key: string; title: string; subtitle: string; icon: string; route: string };

export default function Tools() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);

  const tools: Tool[] = [
    { key: "sales", title: t("salesOrders"), subtitle: t("salesOrdersSub"), icon: "cart-outline", route: "/orders-manage?tab=sales" },
    { key: "purchase", title: t("purchaseOrders"), subtitle: t("purchaseOrdersSub"), icon: "truck-outline", route: "/orders-manage?tab=purchase" },
    { key: "production", title: t("productionOrders"), subtitle: t("productionOrdersSub"), icon: "factory", route: "/production-orders" },
    { key: "stocktake", title: t("stocktaking"), subtitle: t("stocktakingSub"), icon: "clipboard-list-outline", route: "/stocktakes" },
    { key: "movement", title: t("stockMovement"), subtitle: t("stockMovementSub"), icon: "swap-horizontal", route: "/stock-movement" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + S.md }]}>
        <Text style={styles.title}>{t("tools")}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 120 }}>
        {tools.map((tool) => (
          <Pressable key={tool.key} testID={`tool-${tool.key}`} onPress={() => router.push(tool.route as any)}>
            <Card style={styles.row}>
              <View style={styles.iconWrap}>
                <MaterialCommunityIcons name={tool.icon as any} size={24} color={C.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.tTitle}>{tool.title}</Text>
                <Text style={styles.tSub}>{tool.subtitle}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={C.onSurfaceTertiary} />
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  header: { paddingHorizontal: S.lg, paddingBottom: S.md, borderBottomWidth: 1, borderBottomColor: C.divider },
  title: { color: C.onSurface, fontFamily: F.display, fontSize: 26, letterSpacing: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: S.md, marginBottom: S.md },
  iconWrap: { width: 48, height: 48, borderRadius: R.md, backgroundColor: C.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  tTitle: { color: C.onSurface, fontFamily: F.textBold, fontSize: 16 },
  tSub: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13, marginTop: 3 },
});
