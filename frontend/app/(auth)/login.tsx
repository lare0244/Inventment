import React, { useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useRouter, Link } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { Btn, Field } from "@/src/components/ui";
import { C, F, S } from "@/src/theme";

export default function Login() {
  const { signIn } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      setErr(e.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.c, { paddingTop: insets.top + S["3xl"] }]} keyboardShouldPersistTaps="handled">
        <View style={styles.logo}>
          <MaterialCommunityIcons name="warehouse" size={40} color={C.brand} />
        </View>
        <Text style={styles.title}>STOCKMASTER</Text>
        <Text style={styles.sub}>Warehouse inventory command center</Text>

        <View style={{ height: S["2xl"] }} />
        <Field label="Email" testID="login-email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@company.com" />
        <Field label="Password" testID="login-password" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
        {!!err && <Text testID="login-error" style={styles.err}>{err}</Text>}
        <Btn testID="login-submit" title="Sign In" onPress={submit} loading={loading} icon="login" />
        <View style={styles.row}>
          <Text style={styles.muted}>No account? </Text>
          <Link href="/(auth)/register" style={styles.link} testID="go-register">Create one</Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  c: { paddingHorizontal: S.xl, paddingBottom: S["3xl"] },
  logo: { width: 72, height: 72, borderRadius: 16, backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.brand, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: S.lg },
  title: { fontFamily: F.display, fontSize: 32, color: C.onSurface, textAlign: "center", letterSpacing: 2 },
  sub: { fontFamily: F.text, fontSize: 14, color: C.onSurfaceTertiary, textAlign: "center", marginTop: S.xs },
  err: { color: C.error, fontFamily: F.text, marginBottom: S.md },
  row: { flexDirection: "row", justifyContent: "center", marginTop: S.xl },
  muted: { color: C.onSurfaceTertiary, fontFamily: F.text },
  link: { color: C.brand, fontFamily: F.textBold },
});
