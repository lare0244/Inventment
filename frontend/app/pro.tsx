import React, { useEffect, useState, useMemo, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useColors, useT } from "@/src/appsettings";
import { Btn, Card } from "@/src/components/ui";
import { F, S, R, Palette } from "@/src/theme";
import { purchasesAvailable, getMonthlyPackage, buyMonthlyPro, restorePurchases, hasPro } from "@/src/purchases";

export default function Pro() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { plan, refreshUser } = useAuth();
  const C = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [pkg, setPkg] = useState<any>(null);
  const [billing, setBilling] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const available = purchasesAvailable();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const b = await api("/billing/plan").catch(() => null);
      setBilling(b);
      if (available) setPkg(await getMonthlyPackage());
    } finally {
      setLoading(false);
    }
  }, [available]);
  useEffect(() => { load(); }, [load]);

  const priceLabel = pkg?.product?.priceString
    || (billing ? `${billing.price.amount} ${billing.price.currency}` : "6.99 EUR");

  function notify(msg: string) {
    if (Platform.OS === "web" && typeof window !== "undefined") window.alert(msg);
    else Alert.alert("INVENTMENT", msg);
  }

  async function subscribe() {
    if (!pkg) { notify(t("iapUnavailableSub")); return; }
    setBusy(true);
    try {
      const info = await buyMonthlyPro(pkg);
      await api("/billing/revenuecat/sync", { method: "POST" }).catch(() => {});
      await refreshUser();
      if (hasPro(info)) { notify(t("proActive")); router.back(); }
    } catch (e: any) {
      if (!e?.userCancelled) notify(`${t("purchaseFailed")}${e?.message ? `: ${e.message}` : ""}`);
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    try {
      await restorePurchases();
      await api("/billing/revenuecat/sync", { method: "POST" }).catch(() => {});
      await refreshUser();
      notify(t("restoreDone"));
      load();
    } finally {
      setBusy(false);
    }
  }

  const bullets = (billing ? (billing.pro_limits || billing.limits) : null);

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Pressable testID="pro-back" onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={C.onSurface} />
        </Pressable>
        <Text style={styles.title}>{t("upgradeToPro").toUpperCase()}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + 40 }}>
        <View style={styles.crownWrap}>
          <MaterialCommunityIcons name="crown" size={44} color={C.brand} />
        </View>

        {plan === "pro" ? (
          <Card style={{ marginBottom: S.lg }}>
            <View style={styles.rowCenter}>
              <MaterialCommunityIcons name="check-decagram" size={22} color={C.success} />
              <Text style={styles.activeTxt}>{t("proActive")}</Text>
            </View>
            {billing?.plan_expires_at && (
              <Text style={styles.sub}>{t("renews")} {String(billing.plan_expires_at).slice(0, 10)}</Text>
            )}
          </Card>
        ) : (
          <>
            <Text style={styles.pitch}>{t("proPitch")}</Text>

            <Card style={{ marginVertical: S.lg }}>
              <Text style={styles.priceBig}>{priceLabel}<Text style={styles.priceUnit}> / {t("month")}</Text></Text>
              {bullets && (
                <View style={{ marginTop: S.md, gap: S.sm }}>
                  <Feature C={C} styles={styles} label={`${bullets.products} ${t("products")}`} />
                  <Feature C={C} styles={styles} label={`${bullets.warehouses} ${t("warehouse")}`} />
                  <Feature C={C} styles={styles} label={`${bullets.categories} ${t("categories")}`} />
                  <Feature C={C} styles={styles} label={`${bullets.suppliers} ${t("suppliers")}`} />
                </View>
              )}
            </Card>

            {loading ? (
              <ActivityIndicator color={C.brand} style={{ marginVertical: S.lg }} />
            ) : available ? (
              <>
                <Btn testID="pro-subscribe" title={t("subscribeBtn")} icon="crown" loading={busy} onPress={subscribe} />
                <Btn testID="pro-restore" title={t("restoreBtn")} variant="ghost" style={{ marginTop: S.sm }} onPress={restore} />
              </>
            ) : (
              <Card style={{ borderColor: C.brand }}>
                <View style={styles.rowCenter}>
                  <MaterialCommunityIcons name="cellphone-arrow-down" size={20} color={C.brand} />
                  <Text style={styles.activeTxt}>{t("iapUnavailable")}</Text>
                </View>
                <Text style={styles.sub}>{t("iapUnavailableSub")}</Text>
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Feature({ C, styles, label }: { C: Palette; styles: any; label: string }) {
  return (
    <View style={styles.featRow}>
      <MaterialCommunityIcons name="check-circle" size={18} color={C.success} />
      <Text style={styles.featTxt}>{label}</Text>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.md, paddingBottom: S.sm, borderBottomWidth: 1, borderBottomColor: C.divider },
  backBtn: { width: 26, height: 26, alignItems: "center", justifyContent: "center" },
  title: { color: C.onSurface, fontFamily: F.display, fontSize: 20, letterSpacing: 1 },
  crownWrap: { alignSelf: "center", width: 84, height: 84, borderRadius: 42, backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", marginVertical: S.lg },
  pitch: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 15, textAlign: "center", lineHeight: 22 },
  priceBig: { color: C.onSurface, fontFamily: F.display, fontSize: 30 },
  priceUnit: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 15 },
  featRow: { flexDirection: "row", alignItems: "center", gap: S.sm },
  featTxt: { color: C.onSurface, fontFamily: F.text, fontSize: 14 },
  rowCenter: { flexDirection: "row", alignItems: "center", gap: S.sm },
  activeTxt: { color: C.onSurface, fontFamily: F.textBold, fontSize: 15 },
  sub: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13, marginTop: S.xs },
});
