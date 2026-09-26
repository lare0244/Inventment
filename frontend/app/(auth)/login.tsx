import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Image } from "react-native";
import { useRouter, Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { useColors, useT } from "@/src/appsettings";
import { Btn, Field } from "@/src/components/ui";
import { SocialAuth } from "@/src/components/SocialAuth";
import { F, S, Palette } from "@/src/theme";

export default function Login() {
  const { signIn } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const C = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
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
      setErr(e.message || t("loginFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.c, { paddingTop: insets.top + S["3xl"] }]} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}>
          <Image source={require("@/assets/images/logo.png")} style={styles.logoImg} resizeMode="contain" />
        </View>
        <Text style={styles.sub}>{t("appTagline")}</Text>

        <View style={{ height: S["2xl"] }} />
        <Field label={t("email")} testID="login-email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@company.com" />
        <Field label={t("password")} testID="login-password" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
        {!!err && <Text testID="login-error" style={styles.err}>{err}</Text>}
        <Btn testID="login-submit" title={t("signIn")} onPress={submit} loading={loading} icon="login" />
        <SocialAuth />
        <View style={styles.row}>
          <Text style={styles.muted}>{t("noAccount")}</Text>
          <Link href="/(auth)/register" style={styles.link} testID="go-register">{t("createOne")}</Link>
        </View>
        <Link href="/privacy" style={styles.privacy} testID="login-privacy">{t("privacyPolicy")}</Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  c: { paddingHorizontal: S.xl, paddingBottom: S["3xl"] },
  logoWrap: { alignSelf: "center", width: "100%", height: 110, borderRadius: 16, overflow: "hidden", marginBottom: S.md, backgroundColor: "#ffffff", paddingHorizontal: S.lg, justifyContent: "center" },
  logoImg: { width: "100%", height: "100%" },
  sub: { fontFamily: F.text, fontSize: 14, color: C.onSurfaceTertiary, textAlign: "center", marginTop: S.xs },
  err: { color: C.error, fontFamily: F.text, marginBottom: S.md },
  row: { flexDirection: "row", justifyContent: "center", marginTop: S.xl },
  muted: { color: C.onSurfaceTertiary, fontFamily: F.text },
  link: { color: C.brand, fontFamily: F.textBold },
  privacy: { color: C.onSurfaceTertiary, fontFamily: F.textBold, fontSize: 12, textAlign: "center", marginTop: S.xl },
});
