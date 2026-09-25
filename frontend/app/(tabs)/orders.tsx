import React, { useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Modal, Platform, Linking, Alert } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useColors, useT, useApp } from "@/src/appsettings";
import { money } from "@/src/currency";
import { useResponsive } from "@/src/hooks/useResponsive";
import { F, S, R, Palette } from "@/src/theme";
import { Card, Btn } from "@/src/components/ui";
import { SalesOrdersPanel } from "@/src/components/SalesOrdersPanel";

export default function Orders() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currency, user } = useAuth();
  const { isDesktop } = useResponsive();
  const { lang } = useApp();
  const C = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [tab, setTab] = useState<"purchase" | "sales">("purchase");
  const [data, setData] = useState<any>(null);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [marking, setMarking] = useState(false);
  const [selWarehouse, setSelWarehouse] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [insight, setInsight] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [emailModal, setEmailModal] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [editPo, setEditPo] = useState<any>(null);
  const [poItems, setPoItems] = useState<any[]>([]);
  const [savingPo, setSavingPo] = useState(false);

  const load = useCallback(async () => {
    try {
      const [sugg, wh, pos] = await Promise.all([
        api("/reports/reorder-suggestions"),
        api("/warehouses"), api("/purchase-orders"),
      ]);
      setData(sugg); setWarehouses(wh); setOrders(pos);
      setSelWarehouse((w) => w || wh[0]?.id || null);
    } catch {} finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function getAi() {
    setAiLoading(true);
    try { const r = await api(`/reports/ai-insights?lang=${lang}&currency=${currency}`); setInsight(r.insight); } catch {} finally { setAiLoading(false); }
  }

  async function draftEmail() {
    const ids = data.suggestions.map((s: any) => s.product_id);
    const supplierId = data.suggestions.find((s: any) => s.supplier_id)?.supplier_id;
    const po = await api("/purchase-orders", { method: "POST", body: { product_ids: ids, supplier_id: supplierId, warehouse_id: selWarehouse } });
    setEmailModal(po); setCopied(false); await load();
  }

  async function markSent() {
    if (!emailModal?.id) return;
    setMarking(true);
    try { await api(`/purchase-orders/${emailModal.id}/sent`, { method: "PUT" }); await load(); setEmailModal(null); }
    finally { setMarking(false); }
  }

  function fmtAddr(w: any) {
    if (!w) return "";
    const l1 = [w.street1, w.number].filter(Boolean).join(" ");
    const cityPc = [w.postcode, w.city].filter(Boolean).join(" ");
    const region = [w.state, w.county].filter(Boolean).join(", ");
    return [l1, w.street2, cityPc, region].filter(Boolean).join("\n");
  }
  function composePO(po: any) {
    const sup = po?.supplier_name || t("supplier");
    const lines = (po?.items || []).map((i: any) => `- ${i.name} (${t("sku")}: ${i.sku || "N/A"}) — ${t("emailQty")}: ${i.qty}`);
    let delivery = "";
    if (po?.warehouse_name) {
      const wh = warehouses.find((w) => w.id === po.warehouse_id);
      const a = fmtAddr(wh);
      delivery = `\n\n${t("emailDeliverTo")}\n${po.warehouse_name}` + (a ? `\n${a}` : "");
    }
    const subject = `${t("poEmailSubjectPrefix")} ${user?.name || ""}`.trim();
    const body = `${t("emailGreeting")} ${sup},\n\n${t("emailIntro")}\n\n${lines.join("\n")}${delivery}\n\n${t("emailClosing")}\n\n${t("emailRegards")}\n${user?.name || ""}`;
    return { subject, body };
  }
  async function sendToSupplier(po: any) {
    const { subject, body } = composePO(po);
    const to = po?.supplier_email || "";
    if (!to) {
      Alert.alert(t("noSupplierEmail"), t("addSupplierEmailHint"));
    }
    const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
      if (po?.status !== "sent" && po?.id) { await api(`/purchase-orders/${po.id}/sent`, { method: "PUT" }); await load(); }
      setEmailModal(null); setEditPo(null);
    } catch { Alert.alert(t("emailAppError"), ""); }
  }

  async function autoCreatePOs() {
    setAutoLoading(true);
    try { await api("/purchase-orders/auto", { method: "POST" }); await load(); }
    catch {} finally { setAutoLoading(false); }
  }

  function deletePo(po: any) {
    const doDelete = async () => { try { await api(`/purchase-orders/${po.id}`, { method: "DELETE" }); await load(); } catch {} };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(t("confirmDeleteDraft"))) doDelete();
      return;
    }
    Alert.alert(t("deleteDraft"), t("confirmDeleteDraft"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("deleteDraft"), style: "destructive", onPress: doDelete },
    ]);
  }

  const setItemQty = (idx: number, n: number) =>
    setPoItems((arr) => arr.map((it, i) => (i === idx ? { ...it, qty: Math.max(0, n) } : it)));
  async function savePoItems() {
    if (!editPo?.id) return;
    setSavingPo(true);
    try {
      await api(`/purchase-orders/${editPo.id}`, { method: "PUT", body: { items: poItems.map((i) => ({ product_id: i.product_id, qty: i.qty })) } });
      setEditPo(null); await load();
    } catch {} finally { setSavingPo(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + S.md }]}>
        <Text style={styles.title}>{tab === "sales" ? t("salesOrders") : t("purchaseOrders")}</Text>
        <View style={styles.segWrap}>
          <Pressable testID="tab-purchase" onPress={() => setTab("purchase")} style={[styles.segBtn, tab === "purchase" && styles.segBtnActive]}>
            <Text style={[styles.segTxt, tab === "purchase" && { color: C.onBrand }]}>{t("purchaseOrders")}</Text>
          </Pressable>
          <Pressable testID="tab-sales" onPress={() => setTab("sales")} style={[styles.segBtn, tab === "sales" && styles.segBtnActive]}>
            <Text style={[styles.segTxt, tab === "sales" && { color: C.onBrand }]}>{t("salesOrders")}</Text>
          </Pressable>
        </View>
      </View>

      {tab === "sales" ? (
        <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 120 }}>
          <Btn testID="so-create-btn" title={t("createSalesOrder")} icon="plus-circle-outline" style={{ marginBottom: S.lg }} onPress={() => router.push("/sales-order/new")} />
          <SalesOrdersPanel />
        </ScrollView>
      ) : loading ? (
        <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 120 }}>
          <Card style={{ marginBottom: S.lg }}>
            <View style={styles.aiHead}>
              <MaterialCommunityIcons name="robot-outline" size={20} color={C.brand} />
              <Text style={styles.aiTitle}>{t("aiInsight")}</Text>
            </View>
            {insight ? <Text style={styles.aiTxt}>{insight}</Text> : (
              <Btn testID="ai-insight-btn" title={t("generateAi")} variant="secondary" loading={aiLoading} onPress={getAi} icon="lightning-bolt" />
            )}
          </Card>

          <View style={styles.totalRow}>
            <Text style={styles.section}>{t("suggestedReorders")}</Text>
            <Text style={styles.totalCost}>{t("est")} {money(data.total_estimated_cost, currency)}</Text>
          </View>

          {data.suggestions.length === 0 ? (
            <View style={styles.emptyWrap}>
              <MaterialCommunityIcons name="clipboard-check-outline" size={56} color={C.surfaceTertiary} />
              <Text style={styles.emptyTxt}>{t("noPending")}</Text>
              <Text style={styles.emptySub}>{t("aboveThresholds")}</Text>
            </View>
          ) : (
            <View style={isDesktop ? styles.grid : undefined}>
            {data.suggestions.map((s: any) => (
              <Card key={s.product_id} style={[styles.row, isDesktop && styles.gridItem]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rName}>{s.name}</Text>
                  <Text style={styles.rMeta}>{t("have")} {s.current_qty} · {t("order")} {s.suggested_qty} · {s.supplier_name || t("noSupplier")}</Text>
                </View>
                <Text style={styles.rCost}>{money(s.estimated_cost, currency)}</Text>
              </Card>
            ))}
            </View>
          )}

          <Btn testID="auto-po-btn" title={t("autoCreatePOs")} icon="clipboard-list-outline" variant="secondary" loading={autoLoading} onPress={autoCreatePOs} style={{ marginTop: S.lg }} />

          <Text style={styles.section}>{t("orderHistory")}</Text>
          {orders.length === 0 ? (
            <Card><Text style={styles.empty}>{t("noPos")}</Text></Card>
          ) : (
            <View style={isDesktop ? styles.grid : undefined}>
            {orders.map((po: any) => (
              <Pressable key={po.id} testID={`po-card-${po.id}`} onPress={() => router.push(`/purchase-order/${po.id}`)} style={isDesktop ? styles.gridItem : undefined}>
                <Card style={styles.poRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rName}>{po.supplier_name || t("supplier")} · {po.items?.length || 0} {t("items")}</Text>
                    <Text style={styles.rMeta}>{(po.created_at || "").slice(0, 10)} · {money(po.total, currency)}{po.warehouse_name ? ` · ${po.warehouse_name}` : ""}</Text>
                  </View>
                  {po.status === "draft" && (
                    <Pressable testID={`po-delete-${po.id}`} hitSlop={8} onPress={(e: any) => { e?.stopPropagation?.(); deletePo(po); }} style={{ marginRight: S.sm }}>
                      <MaterialCommunityIcons name="trash-can-outline" size={18} color={C.error} />
                    </Pressable>
                  )}
                  {(() => {
                    const clr = po.status === "delivered" ? C.success : po.status === "cancelled" ? C.error : po.status === "sent" ? C.info : C.warning;
                    const lbl = po.status === "delivered" ? t("statusDelivered") : po.status === "cancelled" ? t("statusCancelled") : po.status === "sent" ? t("statusSent") : t("statusDraft");
                    return (
                      <View style={[styles.badge, { borderColor: clr }]}>
                        <Text style={[styles.badgeTxt, { color: clr }]}>{lbl}</Text>
                      </View>
                    );
                  })()}
                  <MaterialCommunityIcons name="chevron-right" size={20} color={C.onSurfaceTertiary} style={{ marginLeft: S.sm }} />
                </Card>
              </Pressable>
            ))}
            </View>
          )}
        </ScrollView>
      )}

      {tab === "purchase" && data?.suggestions?.length > 0 && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + S.sm }]}>
          {warehouses.length > 0 && (
            <>
              <Text style={styles.deliverLabel}>{t("deliverTo")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.whRow}>
                {warehouses.map((w) => (
                  <Pressable key={w.id} testID={`wh-${w.id}`} onPress={() => setSelWarehouse(w.id)}
                    style={[styles.whChip, selWarehouse === w.id && styles.whChipActive]}>
                    <Text style={[styles.whTxt, selWarehouse === w.id && { color: C.onBrand }]}>{w.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}
          <Btn testID="draft-email-btn" title={t("draftEmailSupplier")} icon="email-outline" onPress={draftEmail} />
        </View>
      )}

      <Modal visible={!!emailModal} transparent animationType="slide" onRequestClose={() => setEmailModal(null)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + S.lg }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>{t("poEmail")}</Text>
            <Text style={styles.emailLabel}>{t("to")}: {emailModal?.supplier_email || t("noSupplierEmail")}</Text>
            <Text style={styles.emailLabel}>{t("subject")}: {emailModal ? composePO(emailModal).subject : ""}</Text>
            <ScrollView style={styles.emailBody}>
              <Text style={styles.emailBodyTxt}>{emailModal ? composePO(emailModal).body : ""}</Text>
            </ScrollView>
            <Btn testID="send-supplier-btn" title={t("sendToSupplier")} icon="email-fast-outline" onPress={() => sendToSupplier(emailModal)} />
            <Btn testID="copy-email-btn" title={copied ? t("copied") : t("copyEmail")} variant="secondary" icon="content-copy" style={{ marginTop: S.sm }}
              onPress={async () => { await Clipboard.setStringAsync(composePO(emailModal).body); setCopied(true); }} />
            {emailModal?.status !== "sent" && (
              <Btn testID="mark-sent-btn" title={t("markAsSent")} variant="ghost" icon="check-circle-outline" loading={marking} onPress={markSent} style={{ marginTop: S.sm }} />
            )}
            <Pressable testID="close-email-modal" onPress={() => setEmailModal(null)} style={styles.closeBtn}>
              <Text style={styles.closeTxt}>{t("close")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={!!editPo} transparent animationType="slide" onRequestClose={() => setEditPo(null)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + S.lg }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>{t("editItems")}</Text>
            <Text style={styles.emailLabel}>{editPo?.supplier_name || t("supplier")}</Text>
            <ScrollView style={{ maxHeight: 340, marginVertical: S.sm }}>
              {poItems.map((it, idx) => (
                <View key={it.product_id} style={styles.editRow}>
                  <Text style={styles.editName} numberOfLines={1}>{it.name}</Text>
                  <View style={styles.stepper}>
                    <Pressable testID={`po-item-minus-${idx}`} hitSlop={8} onPress={() => setItemQty(idx, it.qty - 1)} style={styles.stepBtn}>
                      <MaterialCommunityIcons name="minus" size={18} color={C.onSurface} />
                    </Pressable>
                    <Text style={styles.stepVal}>{it.qty}</Text>
                    <Pressable testID={`po-item-plus-${idx}`} hitSlop={8} onPress={() => setItemQty(idx, it.qty + 1)} style={styles.stepBtn}>
                      <MaterialCommunityIcons name="plus" size={18} color={C.onSurface} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </ScrollView>
            <Btn testID="save-po-items-btn" title={t("save")} icon="check" loading={savingPo} onPress={savePoItems} />
            <Btn testID="send-supplier-edit-btn" title={t("sendToSupplier")} variant="secondary" icon="email-fast-outline" style={{ marginTop: S.sm }} onPress={() => sendToSupplier(editPo)} />
            <Pressable testID="close-edit-po" onPress={() => setEditPo(null)} style={styles.closeBtn}>
              <Text style={styles.closeTxt}>{t("close")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  header: { paddingHorizontal: S.lg, paddingBottom: S.md, borderBottomWidth: 1, borderBottomColor: C.divider },
  title: { color: C.onSurface, fontFamily: F.display, fontSize: 26, letterSpacing: 1 },
  sub: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13 },
  segWrap: { flexDirection: "row", backgroundColor: C.surfaceSecondary, borderRadius: R.md, padding: 3, marginTop: S.md },
  segBtn: { flex: 1, height: 38, alignItems: "center", justifyContent: "center", borderRadius: R.sm },
  segBtnActive: { backgroundColor: C.brand },
  segTxt: { color: C.onSurfaceSecondary, fontFamily: F.textBold, fontSize: 13 },
  aiHead: { flexDirection: "row", alignItems: "center", gap: S.sm, marginBottom: S.md },
  aiTitle: { color: C.onSurface, fontFamily: F.textBold, fontSize: 15 },
  aiTxt: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 14, lineHeight: 21 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: S.sm },
  section: { color: C.onSurfaceSecondary, fontFamily: F.textBold, fontSize: 13, letterSpacing: 1 },
  totalCost: { color: C.success, fontFamily: F.display, fontSize: 18 },
  row: { flexDirection: "row", alignItems: "center", marginBottom: S.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  gridItem: { width: "49%" },
  rName: { color: C.onSurface, fontFamily: F.textBold, fontSize: 15 },
  rMeta: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, marginTop: 2 },
  rCost: { color: C.brand, fontFamily: F.display, fontSize: 18 },
  poRow: { flexDirection: "row", alignItems: "center", marginBottom: S.sm },
  editRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: S.sm, borderBottomWidth: 1, borderBottomColor: C.divider },
  editName: { flex: 1, color: C.onSurface, fontFamily: F.text, fontSize: 14, marginRight: S.md },
  stepper: { flexDirection: "row", alignItems: "center", gap: S.sm },
  stepBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", backgroundColor: C.surface },
  stepVal: { color: C.onSurface, fontFamily: F.display, fontSize: 17, minWidth: 28, textAlign: "center" },
  badge: { paddingHorizontal: S.sm, paddingVertical: 4, borderRadius: R.sm, borderWidth: 1 },
  badgeTxt: { fontFamily: F.textBold, fontSize: 11, letterSpacing: 0.5 },
  empty: { color: C.onSurfaceTertiary, fontFamily: F.text },
  emptyWrap: { alignItems: "center", marginTop: 60, gap: S.sm },
  emptyTxt: { color: C.onSurface, fontFamily: F.textBold, fontSize: 16 },
  emptySub: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: S.lg, paddingTop: S.sm, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.divider },
  deliverLabel: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 11, letterSpacing: 0.5, marginBottom: S.xs },
  whRow: { gap: S.sm, paddingBottom: S.sm },
  whChip: { height: 34, paddingHorizontal: S.md, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", flexShrink: 0, backgroundColor: C.surfaceSecondary },
  whChipActive: { backgroundColor: C.brand, borderColor: C.brand },
  whTxt: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 13 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: C.surfaceSecondary, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, padding: S.lg, maxHeight: "85%" },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.surfaceTertiary, alignSelf: "center", marginBottom: S.md },
  modalTitle: { color: C.onSurface, fontFamily: F.display, fontSize: 22, marginBottom: S.sm },
  emailLabel: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13, marginBottom: 2 },
  emailBody: { maxHeight: 240, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.sm, padding: S.md, marginVertical: S.md },
  emailBodyTxt: { color: C.onSurface, fontFamily: F.text, fontSize: 13, lineHeight: 20 },
  closeBtn: { alignItems: "center", paddingVertical: S.md },
  closeTxt: { color: C.onSurfaceTertiary, fontFamily: F.textBold },
});
