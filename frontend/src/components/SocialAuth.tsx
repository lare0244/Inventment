import React, { useEffect, useState } from "react";
import { View, Text, Platform, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import { useAuth } from "@/src/auth";
import { useColors, useT } from "@/src/appsettings";
import { F, S, R, Palette } from "@/src/theme";

export function SocialAuth() {
  const { signInWithGoogle, signInWithApple } = useAuth();
  const C = useColors();
  const t = useT();
  const styles = makeStyles(C);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState<null | "google" | "apple">(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (Platform.OS === "ios") {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
    }
  }, []);

  async function onGoogle() {
    setErr("");
    setBusy("google");
    try {
      await signInWithGoogle();
    } catch (e: any) {
      setErr(e?.message || t("socialFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function onApple() {
    setErr("");
    setBusy("apple");
    try {
      await signInWithApple();
    } catch (e: any) {
      if (e?.code === "ERR_REQUEST_CANCELED") { setBusy(null); return; }
      setErr(e?.message || t("socialFailed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View>
      <View style={styles.divider}>
        <View style={styles.line} />
        <Text style={styles.dividerText}>{t("orDivider")}</Text>
        <View style={styles.line} />
      </View>

      <Pressable testID="google-signin" onPress={onGoogle} disabled={!!busy} style={({ pressed }) => [styles.googleBtn, { opacity: pressed ? 0.85 : 1 }]}>
        {busy === "google" ? (
          <ActivityIndicator color="#3c4043" />
        ) : (
          <View style={styles.btnInner}>
            <MaterialCommunityIcons name="google" size={20} color="#4285F4" />
            <Text style={styles.googleText}>{t("continueWithGoogle")}</Text>
          </View>
        )}
      </Pressable>

      {Platform.OS === "ios" && appleAvailable && (
        <View testID="apple-signin" style={{ marginTop: S.md }}>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={
              C.isDark
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={R.md}
            style={{ height: 52, width: "100%" }}
            onPress={onApple}
          />
        </View>
      )}

      {!!err && <Text style={styles.err}>{err}</Text>}
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  divider: { flexDirection: "row", alignItems: "center", marginVertical: S.xl },
  line: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { marginHorizontal: S.md, color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, letterSpacing: 1 },
  googleBtn: { height: 52, borderRadius: R.md, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#dadce0", alignItems: "center", justifyContent: "center", paddingHorizontal: S.lg },
  btnInner: { flexDirection: "row", alignItems: "center", gap: S.sm },
  googleText: { fontFamily: F.textBold, fontSize: 16, color: "#3c4043" },
  err: { color: C.error, fontFamily: F.text, marginTop: S.md, textAlign: "center" },
});
