import React from "react";
import { Tabs, Redirect } from "expo-router";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";
import { Platform } from "react-native";
import { F } from "@/src/theme";
import { useColors, useT } from "@/src/appsettings";
import { useAuth } from "@/src/auth";

function tabIcon(name: string, nameOutline: string) {
  return ({ focused, color, size }: any) => (
    <MaterialCommunityIcons name={(focused ? name : nameOutline) as any} size={size} color={color} />
  );
}

export default function TabsLayout() {
  const C = useColors();
  const t = useT();
  const { user, loading } = useAuth();
  if (!loading && !user) return <Redirect href="/(auth)/login" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.brand,
        tabBarInactiveTintColor: C.onSurfaceTertiary,
        tabBarStyle: {
          backgroundColor: C.surfaceSecondary,
          borderTopColor: C.border,
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 88 : 64,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontFamily: F.text, fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("dashboard"), tabBarIcon: tabIcon("view-dashboard", "view-dashboard-outline") }} />
      <Tabs.Screen name="catalog" options={{ title: t("catalog"), tabBarIcon: tabIcon("package-variant", "package-variant-closed") }} />
      <Tabs.Screen name="scan" options={{ title: t("scan"), tabBarIcon: tabIcon("barcode-scan", "barcode-scan") }} />
      <Tabs.Screen name="orders" options={{ title: t("orders"), tabBarIcon: tabIcon("clipboard-list", "clipboard-list-outline") }} />
      <Tabs.Screen name="settings" options={{ title: t("settings"), tabBarIcon: tabIcon("cog", "cog-outline") }} />
    </Tabs>
  );
}
