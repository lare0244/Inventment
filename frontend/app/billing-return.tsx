import React, { useEffect, useState, useMemo, useRef } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useColors, useT } from "@/src/appsettings";
import { F, S, Palette } from "@/src/theme";
import { Btn } from "@/src/components/ui";

const MAX_POLLS = 8;

export default function BillingReturn() {
  const { session_id, canceled } = useLocalSearchParams<{ session_id?: string; canceled?: string }>();
  const router = useRouter();
  const C = useColors();
  const t = useT();
  const { refreshUser } = useAuth();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [state, setState] = useState<"loading" | "success" | "pending" | "canceled">(canceled ? "canceled" : "loading");
  const polls = useRef(0);

  useEffect(() => {
    if (canceled || !session_id) { if (canceled) setState("canceled"); return; }
    let active = true;
    const poll = async () => {
      try {
        const r = await api<{ payment_status: string; plan: string }>(`/billing/status/${session_id}`);
        if (!active) return;
        if (r.payment_status === "paid" || r.plan === "pro") {
          await refreshUser();
          setState("success");
          return;
        }
      } catch {}
      polls.current += 1;
      if (polls.current >= MAX_POLLS) { setState("pending"); return; }
      setTimeout(poll, 2000);
    };
    poll();
    return () => { active = false; };
  }, [session_id, canceled]);

  const icon = state === "success" ? "check-circle" : state === "canceled" ? "close-circle" : state === "pending" ? "clock-outline" : "loading";
  const color = state === "success" ? C.success : state === "canceled" ? C.error : C.warning;
  const title = state === "success" ? t("welcomePro") : state === "canceled" ? t("checkoutCanceled") : state === "pending" ? t("paymentPending") : t("verifyingPayment");
  const sub = state === "success" ? t("proUnlocked") : state === "canceled" ? t("noChargeMade") : state === "pending" ? t("paymentPendingHint") : "";

  return (
    <View style={styles.wrap}>
      {state === "loading" ? (
        <ActivityIndicator color={C.brand} size="large" />
      ) : (
        <MaterialCommunityIcons name={icon as any} size={72} color={color} />
      )}
      <Text style={styles.title}>{title}</Text>
      {!!sub && <Text style={styles.sub}>{sub}</Text>}
      {state !== "loading" && (
        <Btn testID="billing-done" title={t("done")} onPress={() => router.replace("/(tabs)/settings")} style={{ marginTop: S.xl, alignSelf: "stretch" }} />
      )}
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", padding: S.xl },
  title: { color: C.onSurface, fontFamily: F.display, fontSize: 24, marginTop: S.lg, textAlign: "center" },
  sub: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 15, marginTop: S.sm, textAlign: "center" },
});
