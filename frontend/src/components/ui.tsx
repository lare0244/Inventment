import React from "react";
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, TextInput,
  TextInputProps, ViewStyle,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { F, S, R } from "@/src/theme";
import { useColors } from "@/src/appsettings";

export function Btn({
  title, onPress, loading, icon, variant = "primary", testID, style,
}: {
  title: string; onPress: () => void; loading?: boolean;
  icon?: any; variant?: "primary" | "secondary" | "ghost"; testID?: string; style?: ViewStyle;
}) {
  const C = useColors();
  const bg = variant === "primary" ? C.brand : variant === "secondary" ? C.surfaceTertiary : "transparent";
  const fg = variant === "primary" ? C.onBrand : C.onSurface;
  return (
    <Pressable
      testID={testID}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      disabled={loading}
      style={({ pressed }) => [
        { height: 52, borderRadius: R.md, alignItems: "center", justifyContent: "center", paddingHorizontal: S.lg },
        { backgroundColor: bg, opacity: pressed ? 0.85 : 1 },
        variant === "ghost" && { borderWidth: 1, borderColor: C.border }, style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
          {icon && <MaterialCommunityIcons name={icon} size={18} color={fg} />}
          <Text style={{ fontFamily: F.textBold, fontSize: 16, color: fg }}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Field({
  label, testID, ...props
}: { label: string; testID?: string } & TextInputProps) {
  const C = useColors();
  return (
    <View style={{ marginBottom: S.lg }}>
      <Text style={{ color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 13, marginBottom: S.sm, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</Text>
      <TextInput
        testID={testID}
        placeholderTextColor={C.onSurfaceTertiary}
        style={{ backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, height: 50, color: C.onSurface, fontFamily: F.text, fontSize: 15 }}
        {...props}
      />
    </View>
  );
}

export function StatusDot({ color }: { color: string }) {
  return <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />;
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const C = useColors();
  return <View style={[{ backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: S.lg }, style]}>{children}</View>;
}
