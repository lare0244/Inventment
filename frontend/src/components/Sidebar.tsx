import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable, Image } from "react-native";
import { useRouter, usePathname } from "expo-router";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";
import { useColors, useT } from "@/src/appsettings";
import { useAuth } from "@/src/auth";
import { F, S, R, Palette } from "@/src/theme";

export const SIDEBAR_WIDTH = 248;

type Item = { key: string; route: string; label: string; icon: string };

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const C = useColors();
  const t = useT();
  const { plan } = useAuth();
  const styles = useMemo(() => makeStyles(C), [C]);

  const items: Item[] = [
    { key: "index", route: "/(tabs)", label: t("dashboard"), icon: "view-dashboard" },
    { key: "catalog", route: "/(tabs)/catalog", label: t("catalog"), icon: "package-variant" },
    { key: "scan", route: "/(tabs)/scan", label: t("scan"), icon: "barcode-scan" },
    { key: "orders", route: "/(tabs)/orders", label: t("orders"), icon: "clipboard-list" },
    { key: "settings", route: "/(tabs)/settings", label: t("settings"), icon: "cog" },
  ];

  function isActive(key: string) {
    if (key === "index") return pathname === "/" || pathname === "/index";
    return pathname === `/${key}` || pathname.startsWith(`/${key}/`);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.logoWrap}>
        <Image source={require("@/assets/images/logo.png")} style={styles.logo} resizeMode="contain" />
      </View>

      <View style={styles.nav}>
        {items.map((it) => {
          const active = isActive(it.key);
          return (
            <Pressable
              key={it.key}
              testID={`side-nav-${it.key}`}
              onPress={() => router.replace(it.route as any)}
              style={({ hovered }: any) => [styles.item, (active || hovered) && styles.itemHover, active && styles.itemActive]}
            >
              <MaterialCommunityIcons name={it.icon as any} size={22} color={active ? C.brand : C.onSurfaceSecondary} />
              <Text style={[styles.itemTxt, active && { color: C.brand }]}>{it.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footer}>
        <View style={[styles.planBadge, { borderColor: plan === "pro" ? C.success : C.onSurfaceTertiary }]}>
          <MaterialCommunityIcons name={plan === "pro" ? "crown" : "crown-outline"} size={14} color={plan === "pro" ? C.success : C.onSurfaceTertiary} />
          <Text style={[styles.planTxt, { color: plan === "pro" ? C.success : C.onSurfaceTertiary }]}>{plan.toUpperCase()}</Text>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  wrap: { width: SIDEBAR_WIDTH, height: "100%", backgroundColor: C.surfaceSecondary, borderRightWidth: 1, borderRightColor: C.border, paddingVertical: S.xl, paddingHorizontal: S.md },
  logoWrap: { height: 64, borderRadius: R.md, backgroundColor: "#ffffff", paddingHorizontal: S.md, justifyContent: "center", marginBottom: S["2xl"] },
  logo: { width: "100%", height: "100%" },
  nav: { gap: S.xs },
  item: { flexDirection: "row", alignItems: "center", gap: S.md, height: 48, paddingHorizontal: S.md, borderRadius: R.md },
  itemHover: { backgroundColor: C.surfaceTertiary },
  itemActive: { backgroundColor: C.isDark ? "rgba(255,90,0,0.12)" : "rgba(255,90,0,0.08)" },
  itemTxt: { fontFamily: F.textBold, fontSize: 15, color: C.onSurfaceSecondary },
  footer: { marginTop: "auto", paddingTop: S.lg },
  planBadge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: S.md, paddingVertical: 6, borderRadius: R.pill, borderWidth: 1 },
  planTxt: { fontFamily: F.textBold, fontSize: 11, letterSpacing: 1 },
});
