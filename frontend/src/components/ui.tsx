import React from "react";
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, TextInput,
  TextInputProps, ViewStyle, ScrollView, Modal,
} from "react-native";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";
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

export function Dropdown({
  value, options, onChange, testID, placeholder,
}: {
  value: string | null;
  options: { value: string; label: string; sub?: string }[];
  onChange: (v: string) => void;
  testID?: string;
  placeholder?: string;
}) {
  const C = useColors();
  const [open, setOpen] = React.useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <Pressable testID={testID} onPress={() => setOpen(true)}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, height: 50 }}>
        <Text style={{ color: current ? C.onSurface : C.onSurfaceTertiary, fontFamily: F.text, fontSize: 15 }}>
          {current ? current.label : (placeholder || "Select")}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={22} color={C.onSurfaceTertiary} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: S.xl }}>
          <View style={{ backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, overflow: "hidden", maxHeight: "70%" }}>
            <ScrollView>
              {options.map((o) => {
                const active = o.value === value;
                return (
                  <Pressable key={o.value} testID={`${testID}-opt-${o.value}`} onPress={() => { onChange(o.value); setOpen(false); }}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingVertical: S.md, borderBottomWidth: 1, borderBottomColor: C.divider, backgroundColor: active ? C.brand : "transparent" }}>
                    <View>
                      <Text style={{ color: active ? C.onBrand : C.onSurface, fontFamily: F.textBold, fontSize: 15 }}>{o.label}</Text>
                      {!!o.sub && <Text style={{ color: active ? C.onBrand : C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, marginTop: 2 }}>{o.sub}</Text>}
                    </View>
                    {active && <MaterialCommunityIcons name="check" size={20} color={C.onBrand} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
