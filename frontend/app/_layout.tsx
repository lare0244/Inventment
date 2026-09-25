import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider } from "@/src/auth";
import { AppSettingsProvider, useColors } from "@/src/appsettings";
import { UpgradePromptProvider } from "@/src/components/UpgradePrompt";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

function ThemedRoot() {
  const C = useColors();
  return (
    <>
      <StatusBar style={C.isDark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.surface } }} />
    </>
  );
}

export default function RootLayout() {
  const [iconsLoaded, iconErr] = useIconFonts();
  const [fontsLoaded] = useFonts({
    "Rajdhani-Bold": require("../assets/fonts/Rajdhani-Bold.ttf"),
    "Rajdhani-Med": require("../assets/fonts/Rajdhani-Med.ttf"),
    "PlexSans": require("../assets/fonts/PlexSans.ttf"),
    "PlexSans-Bold": require("../assets/fonts/PlexSans-Bold.ttf"),
  });

  const ready = (iconsLoaded || iconErr) && fontsLoaded;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppSettingsProvider>
          <AuthProvider>
            <UpgradePromptProvider>
              <ThemedRoot />
            </UpgradePromptProvider>
          </AuthProvider>
        </AppSettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
