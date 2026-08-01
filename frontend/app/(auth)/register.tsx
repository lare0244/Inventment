import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useRouter, Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { useColors, useT } from "@/src/appsettings";
import { Btn, Field } from "@/src/components/ui";
import { SocialAuth } from "@/src/components/SocialAuth";
import { F, S, Palette } from "@/src/theme";

export default function Register() {
  const { signUp } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const C = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    if (password.length < 6) { setErr(t("passwordMin")); return; }
    setLoading(true);
    try {
      await signUp(email.trim(), password, name.trim());
      router.replace("/(tabs)");
    } catch (e: any) {
      setErr(e.message || t("regFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.c, { paddingTop: insets.top + S["3xl"] }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t("createAccount")}</Text>
        <Text style={styles.sub}>{t("startManaging")}</Text>
        <View style={{ height: S["2xl"] }} />
        <Field label={t("name")} testID="reg-name" value={name} onChangeText={setName} placeholder={t("yourName")} />
        <Field label={t("email")} testID="reg-email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@company.com" />
        <Field label={t("password")} testID="reg-password" value={password} onChangeText={setPassword} secureTextEntry placeholder="Min 6" />
        {!!err && <Text testID="reg-error" style={styles.err}>{err}</Text>}
        <Btn testID="reg-submit" title={t("createAccountBtn")} onPress={submit} loading={loading} icon="account-plus" />
        <SocialAuth />
        <View style={styles.row}>
          <Text style={styles.muted}>{t("haveAccount")}</Text>
          <Link href="/(auth)/login" style={styles.link} testID="go-login">{t("signInLink")}</Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  c: { paddingHorizontal: S.xl, paddingBottom: S["3xl"] },
  title: { fontFamily: F.display, fontSize: 30, color: C.onSurface, letterSpacing: 1 },
  sub: { fontFamily: F.text, fontSize: 14, color: C.onSurfaceTertiary, marginTop: S.xs },
  err: { color: C.error, fontFamily: F.text, marginBottom: S.md },
  row: { flexDirection: "row", justifyContent: "center", marginTop: S.xl },
  muted: { color: C.onSurfaceTertiary, fontFamily: F.text },
  link: { color: C.brand, fontFamily: F.textBold },
});
