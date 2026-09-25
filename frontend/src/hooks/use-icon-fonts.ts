// Preloads the MaterialDesignIcons font used by
// @react-native-vector-icons/material-design-icons so glyphs render on the
// first frame across Expo Go, native builds and web. The font family name
// must match the library's postScriptName ("MaterialDesignIcons").
// Usage: const [loaded, error] = useIconFonts();

import { useFonts } from "expo-font";

export const useIconFonts = (): readonly [boolean, Error | null] =>
  useFonts({
    MaterialDesignIcons: require("@react-native-vector-icons/material-design-icons/fonts/MaterialDesignIcons.ttf"),
  });
