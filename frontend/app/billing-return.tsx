import React, { useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@react-native-vector-icons/material-design-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useColors, useT } from "@/src/appsettings";
import { Btn } from "@/src/components/ui";
import { F, S, Palette } from "@/src/theme";

type Phase = "checking" | "success" | "canceled";

export default function BillingReturn() {
  const params = useLocalSearchParams<{ session_id?: string; canceled?: string }>();
  const router = useRouter();
  const { refreshUser } = useAuth();
  const C = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [phase, setPhase] = useState<Phase>(params.canceled ? "canceled" : "checking");

  useEffect(() => {
    if (params.canceled || !params.session_id) return;
    let cancelled = false;
    let attempts = 0;
    async function poll() {
      while (!cancelled && attempts < 8) {
        attempts++;
        try {
          const r = await api<{ payment_status: string; status: string; plan: string }>(`/billing/status/${params.session_id}`);
          if (r.payment_status === "paid" || r.plan === "pro") {
            await refreshUser();
            if (!cancelled) setPhase("success");
            return;
          }
          if (r.status === "expired") { if (!cancelled) setPhase("canceled"); return; }
        } catch {}
        await new Promise((res) => setTimeout(res, 2000));
      }
      if (!cancelled) { await refreshUser(); setPhase("success"); }
    }
    poll();
    return () => { cancelled = true; };
  }, [params.session_id, params.canceled]);

  return (
    <View style={styles.c}>
      {phase === "checking" ? (
        <>
          <ActivityIndicator size="large" color={C.brand} />
          <Text style={styles.title}>{t("paymentProcessing")}</Text>
        </>
      ) : phase === "success" ? (
        <>
          <MaterialCommunityIcons name="check-decagram" size={64} color={C.success} />
          <Text style={styles.title}>{t("proActive")}</Text>
          <Btn testID="billing-continue" title={t("continueBtn")} icon="arrow-right" style={{ marginTop: S.xl, alignSelf: "stretch" }} onPress={() => router.replace("/(tabs)")} />
        </>
      ) : (
        <>
          <MaterialCommunityIcons name="close-circle-outline" size={64} color={C.onSurfaceTertiary} />
          <Text style={styles.title}>{t("paymentCanceled")}</Text>
          <Btn testID="billing-back" title={t("continueBtn")} variant="secondary" style={{ marginTop: S.xl, alignSelf: "stretch" }} onPress={() => router.replace("/pro")} />
        </>
      )}
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  c: { flex: 1, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", padding: S.xl, maxWidth: 420, width: "100%", alignSelf: "center" },
  title: { color: C.onSurface, fontFamily: F.display, fontSize: 22, letterSpacing: 0.5, textAlign: "center", marginTop: S.lg },
});
