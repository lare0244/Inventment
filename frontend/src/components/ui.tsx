import React from "react";
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, TextInput,
  TextInputProps, ViewStyle,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { C, F, S, R } from "@/src/theme";

export function Btn({
  title, onPress, loading, icon, variant = "primary", testID, style,
}: {
  title: string; onPress: () => void; loading?: boolean;
  icon?: any; variant?: "primary" | "secondary" | "ghost"; testID?: string; style?: ViewStyle;
}) {
  const bg = variant === "primary" ? C.brand : variant === "secondary" ? C.surfaceTertiary : "transparent";
  const fg = variant === "primary" ? C.onBrand : C.onSurface;
  return (
    <Pressable
      testID={testID}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      disabled={loading}
      style={({ pressed }) => [
        styles.btn, { backgroundColor: bg, opacity: pressed ? 0.85 : 1 },
        variant === "ghost" && { borderWidth: 1, borderColor: C.border }, style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.btnRow}>
          {icon && <MaterialCommunityIcons name={icon} size={18} color={fg} />}
          <Text style={[styles.btnTxt, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Field({
  label, testID, ...props
}: { label: string; testID?: string } & TextInputProps) {
  return (
    <View style={{ marginBottom: S.lg }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        testID={testID}
        placeholderTextColor={C.onSurfaceTertiary}
        style={styles.input}
        {...props}
      />
    </View>
  );
}

export function StatusDot({ color }: { color: string }) {
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  btn: { height: 52, borderRadius: R.md, alignItems: "center", justifyContent: "center", paddingHorizontal: S.lg },
  btnRow: { flexDirection: "row", alignItems: "center", gap: S.sm },
  btnTxt: { fontFamily: F.textBold, fontSize: 16 },
  label: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 13, marginBottom: S.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border,
    borderRadius: R.md, paddingHorizontal: S.md, height: 50, color: C.onSurface, fontFamily: F.text, fontSize: 15,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  card: { backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: S.lg },
});
