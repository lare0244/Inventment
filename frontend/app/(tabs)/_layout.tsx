import React from "react";
import { Tabs } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Platform } from "react-native";
import { C, F } from "@/src/theme";

function tabIcon(name: string, nameOutline: string) {
  return ({ focused, color, size }: any) => (
    <MaterialCommunityIcons name={(focused ? name : nameOutline) as any} size={size} color={color} />
  );
}

export default function TabsLayout() {
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
      <Tabs.Screen name="index" options={{ title: "Dashboard", tabBarIcon: tabIcon("view-dashboard", "view-dashboard-outline") }} />
      <Tabs.Screen name="catalog" options={{ title: "Catalog", tabBarIcon: tabIcon("package-variant", "package-variant-closed") }} />
      <Tabs.Screen name="scan" options={{ title: "Scan", tabBarIcon: tabIcon("barcode-scan", "barcode-scan") }} />
      <Tabs.Screen name="orders" options={{ title: "Orders", tabBarIcon: tabIcon("clipboard-list", "clipboard-list-outline") }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", tabBarIcon: tabIcon("cog", "cog-outline") }} />
    </Tabs>
  );
}
