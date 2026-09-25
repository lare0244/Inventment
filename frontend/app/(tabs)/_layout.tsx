import React from "react";
import { Tabs, Redirect, Slot } from "expo-router";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";
import { Platform, View } from "react-native";
import { F } from "@/src/theme";
import { useColors, useT } from "@/src/appsettings";
import { useAuth } from "@/src/auth";
import { useResponsive } from "@/src/hooks/useResponsive";
import { Sidebar } from "@/src/components/Sidebar";

function tabIcon(name: string, nameOutline: string) {
  return ({ focused, color, size }: any) => (
    <MaterialCommunityIcons name={(focused ? name : nameOutline) as any} size={size} color={color} />
  );
}

export default function TabsLayout() {
  const C = useColors();
  const t = useT();
  const { user, loading } = useAuth();
  const { isDesktop } = useResponsive();
  if (!loading && !user) return <Redirect href="/(auth)/login" />;

  // Desktop web: left sidebar + centered, max-width content area.
  if (isDesktop) {
    return (
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: C.surface }}>
        <Sidebar />
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1, width: "100%", maxWidth: 1200, alignSelf: "center" }}>
            <Slot />
          </View>
        </View>
      </View>
    );
  }

  // Phone / tablet: bottom tab bar (unchanged).
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
      <Tabs.Screen name="orders" options={{ title: t("tools"), tabBarIcon: tabIcon("toolbox", "toolbox-outline") }} />
      <Tabs.Screen name="settings" options={{ title: t("settings"), tabBarIcon: tabIcon("cog", "cog-outline") }} />
    </Tabs>
  );
}
