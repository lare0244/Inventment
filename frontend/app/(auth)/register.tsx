import React, { useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useRouter, Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { Btn, Field } from "@/src/components/ui";
import { C, F, S } from "@/src/theme";

export default function Register() {
  const { signUp } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    if (password.length < 6) { setErr("Password must be at least 6 characters"); return; }
    setLoading(true);
    try {
      await signUp(email.trim(), password, name.trim());
      router.replace("/(tabs)");
    } catch (e: any) {
      setErr(e.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.c, { paddingTop: insets.top + S["3xl"] }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>CREATE ACCOUNT</Text>
        <Text style={styles.sub}>Start managing your warehouse</Text>
        <View style={{ height: S["2xl"] }} />
        <Field label="Name" testID="reg-name" value={name} onChangeText={setName} placeholder="Your name" />
        <Field label="Email" testID="reg-email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@company.com" />
        <Field label="Password" testID="reg-password" value={password} onChangeText={setPassword} secureTextEntry placeholder="Min 6 characters" />
        {!!err && <Text testID="reg-error" style={styles.err}>{err}</Text>}
        <Btn testID="reg-submit" title="Create Account" onPress={submit} loading={loading} icon="account-plus" />
        <View style={styles.row}>
          <Text style={styles.muted}>Have an account? </Text>
          <Link href="/(auth)/login" style={styles.link} testID="go-login">Sign in</Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  c: { paddingHorizontal: S.xl, paddingBottom: S["3xl"] },
  title: { fontFamily: F.display, fontSize: 30, color: C.onSurface, letterSpacing: 1 },
  sub: { fontFamily: F.text, fontSize: 14, color: C.onSurfaceTertiary, marginTop: S.xs },
  err: { color: C.error, fontFamily: F.text, marginBottom: S.md },
  row: { flexDirection: "row", justifyContent: "center", marginTop: S.xl },
  muted: { color: C.onSurfaceTertiary, fontFamily: F.text },
  link: { color: C.brand, fontFamily: F.textBold },
});
