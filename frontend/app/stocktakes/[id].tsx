import React, { useState, useCallback, useMemo, useRef } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput, Platform, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useColors, useT } from "@/src/appsettings";
import { F, S, R, Palette } from "@/src/theme";
import { Card, Btn } from "@/src/components/ui";
import { ProductImage } from "@/src/components/ProductImage";
import { buildStocktakePdf } from "@/src/utils/stocktakePdf";

type SortKey = "name" | "qty" | "article" | "ean" | "location";

export default function StocktakeDetail() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const C = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [st, setSt] = useState<any>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [sort, setSort] = useState<SortKey>("name");
  const [search, setSearch] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [assignItem, setAssignItem] = useState<any>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [scanOpen, setScanOpen] = useState(false);
  const [zoomImg, setZoomImg] = useState<string | null>(null);
  const [highlightPid, setHighlightPid] = useState<string | null>(null);
  const scanLock = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const rowY = useRef<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      const s = await api<any>(`/stocktakes/${id}`);
      setSt(s);
      const m: Record<string, string> = {};
      (s.items || []).forEach((it: any) => { m[it.product_id] = String(it.counted_qty); });
      setCounts(m);
    } catch {} finally { setLoading(false); }
    if (user?.is_company_master) {
      try { const c = await api<any>("/company"); setMembers(c.members || []); } catch {}
    }
  }, [id, user?.is_company_master]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = st && st.status !== "completed";

  const sortedItems = useMemo(() => {
    let items = [...(st?.items || [])];
    const q = search.trim().toLowerCase();
    if (q) items = items.filter((it) =>
      String(it.name || "").toLowerCase().includes(q) ||
      String(it.barcode || "").toLowerCase().includes(q) ||
      String(it.sku || "").toLowerCase().includes(q) ||
      String(it.location || "").toLowerCase().includes(q));
    if (flaggedOnly) items = items.filter((it) => it.needs_recount);
    items.sort((a, b) => {
      if (sort === "qty") return Number(counts[b.product_id] ?? b.counted_qty) - Number(counts[a.product_id] ?? a.counted_qty);
      if (sort === "article") return String(a.sku || "").localeCompare(String(b.sku || ""));
      if (sort === "ean") return String(a.barcode || "").localeCompare(String(b.barcode || ""));
      if (sort === "location") return String(a.location || "").localeCompare(String(b.location || ""));
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    return items;
  }, [st, sort, counts, search, flaggedOnly]);

  async function saveOne(pid: string, raw: string) {
    const n = Math.max(0, parseInt(raw, 10) || 0);
    setCounts((c) => ({ ...c, [pid]: String(n) }));
    setSt((prev: any) => prev ? { ...prev, items: (prev.items || []).map((it: any) => it.product_id === pid ? { ...it, counted_qty: n, counted_done: true } : it) } : prev);
    try { await api(`/stocktakes/${id}`, { method: "PUT", body: { items: [{ product_id: pid, counted_qty: n }] } }); } catch {}
  }

  async function openScanner() {
    if (!camPerm?.granted) { const r = await requestCamPerm(); if (!r.granted) return; }
    scanLock.current = false;
    setScanOpen(true);
  }

  function onScan({ data }: { data: string }) {
    if (scanLock.current || !st) return;
    scanLock.current = true;
    setScanOpen(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const it = (st.items || []).find((i: any) => i.barcode && String(i.barcode) === String(data));
    if (!it) {
      const msg = t("notInStocktake");
      if (Platform.OS === "web" && typeof window !== "undefined") window.alert(msg); else Alert.alert(msg, "");
      return;
    }
    setSearch("");
    setHighlightPid(it.product_id);
    setTimeout(() => {
      const y = rowY.current[it.product_id];
      if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 100), animated: true });
    }, 400);
    setTimeout(() => setHighlightPid(null), 3000);
  }

  async function toggleRecount(it: any) {
    const val = !it.needs_recount;
    setSt((prev: any) => prev ? { ...prev, items: (prev.items || []).map((x: any) => x.product_id === it.product_id ? { ...x, needs_recount: val } : x) } : prev);
    try { await api(`/stocktakes/${id}`, { method: "PUT", body: { items: [{ product_id: it.product_id, needs_recount: val }] } }); } catch {}
  }

  async function assignTo(pid: string, memberId: string | null, name: string | null) {
    setSt((prev: any) => prev ? { ...prev, items: (prev.items || []).map((x: any) => x.product_id === pid ? { ...x, assigned_to: memberId, assigned_name: name } : x) } : prev);
    setAssignItem(null);
    try { await api(`/stocktakes/${id}/assign`, { method: "POST", body: { product_id: pid, assigned_to: memberId } }); } catch {}
  }

  function setAllZero() {
    const run = async () => {
      const items = (st?.items || []).map((i: any) => ({ product_id: i.product_id, counted_qty: 0 }));
      setCounts(Object.fromEntries(items.map((i: any) => [i.product_id, "0"])));
      setSt((prev: any) => prev ? { ...prev, items: (prev.items || []).map((x: any) => ({ ...x, counted_qty: 0 })) } : prev);
      try { await api(`/stocktakes/${id}`, { method: "PUT", body: { items, mark_done: false } }); } catch {}
    };
    const msg = t("confirmZero");
    if (Platform.OS === "web" && typeof window !== "undefined") { if (window.confirm(msg)) run(); return; }
    Alert.alert(t("setAllZero"), msg, [{ text: t("cancel"), style: "cancel" }, { text: t("setAllZero"), onPress: run }]);
  }

  function doFinish() {
    setFinishOpen(true);
  }

  async function confirmFinish() {
    setFinishing(true);
    try { await api(`/stocktakes/${id}/complete`, { method: "POST" }); setFinishOpen(false); await load(); }
    catch {} finally { setFinishing(false); }
  }

  async function exportPdf() {
    if (!st) return;
    await buildStocktakePdf(st, user?.company, {
      title: t("stocktaking"), number: t("orderNumber"), warehouse: t("warehouse"), date: t("stocktakeDate"),
      status: t("status"), productName: t("productName"), articleNo: t("articleNo"), ean: t("ean"),
      system: t("systemQty"), counted: t("countedQty"), diff: t("diff"),
    });
  }

  async function exportVariance() {
    if (!st) return;
    const varItems = (st.items || []).filter((it: any) => Number(it.counted_qty) !== Number(it.system_qty));
    if (varItems.length === 0) {
      const msg = t("noVariance");
      if (Platform.OS === "web" && typeof window !== "undefined") window.alert(msg); else Alert.alert(msg, "");
      return;
    }
    await buildStocktakePdf(st, user?.company, {
      title: t("stocktaking"), number: t("orderNumber"), warehouse: t("warehouse"), date: t("stocktakeDate"),
      status: t("status"), productName: t("productName"), articleNo: t("articleNo"), ean: t("ean"),
      system: t("systemQty"), counted: t("countedQty"), diff: t("diff"),
    }, { variance: true, titleOverride: t("varianceReport") });
  }

  const sortOpts: { key: SortKey; label: string }[] = [
    { key: "name", label: t("productName") }, { key: "qty", label: t("sortByQty") },
    { key: "article", label: t("articleNo") }, { key: "ean", label: t("ean") }, { key: "location", label: t("binLocation") },
  ];
  const isMaster = !!user?.is_company_master;

  const total = (st?.items || []).length;
  const doneCount = (st?.items || []).filter((i: any) => i.counted_done).length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  const changedItems = (st?.items || []).filter((i: any) => Number(i.counted_qty) !== Number(i.system_qty));
  const flaggedCount = (st?.items || []).filter((i: any) => i.needs_recount).length;

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Pressable testID="std-back" onPress={() => router.back()} hitSlop={10}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={C.onSurface} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{st?.number || t("stocktaking")}</Text>
        <Pressable testID="std-pdf" onPress={exportPdf} hitSlop={10}>
          <MaterialCommunityIcons name="file-pdf-box" size={24} color={C.brand} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />
      ) : !st ? (
        <Text style={styles.empty}>{t("notFound")}</Text>
      ) : (
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: S.lg, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
          <Card style={{ marginBottom: S.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
              <MaterialCommunityIcons name="warehouse" size={18} color={C.brand} />
              <Text style={styles.metaWh}>{st.warehouse_name}</Text>
              <View style={[styles.badge, { backgroundColor: open ? C.warning : C.success }]}>
                <Text style={styles.badgeTxt}>{open ? t("stOpen") : t("stCompleted")}</Text>
              </View>
            </View>
            <Text style={styles.metaSub}>{t("stocktakeDate")}: {st.date}</Text>
          </Card>

          <Card style={{ marginBottom: S.md }}>
            <View style={styles.progHead}>
              <Text style={styles.progLbl}>{t("progressLabel")}</Text>
              <Text style={styles.progVal}>{doneCount} / {total}</Text>
            </View>
            <View style={styles.progTrack}><View style={[styles.progFill, { width: `${pct}%` }]} /></View>
            {flaggedCount > 0 && (
              <View style={styles.flagNote}>
                <MaterialCommunityIcons name="flag" size={14} color={C.warning} />
                <Text style={styles.flagNoteTxt}>{flaggedCount} {t("flaggedForRecount")}</Text>
              </View>
            )}
            <Btn testID="std-variance" title={t("varianceReport")} icon="file-alert-outline" variant="secondary" onPress={exportVariance} style={{ marginTop: S.md }} />
          </Card>

          {open && (
            <View style={{ flexDirection: "row", gap: S.sm, marginBottom: S.md }}>
              <View style={{ flex: 1 }}><Btn testID="std-scan" title={t("scanToCount")} icon="barcode-scan" variant="secondary" onPress={openScanner} /></View>
              <View style={{ flex: 1 }}><Btn testID="std-zero" title={t("setAllZero")} icon="numeric-0-box-multiple-outline" variant="ghost" onPress={setAllZero} /></View>
            </View>
          )}

          <TextInput testID="std-search" value={search} onChangeText={setSearch}
            placeholder={t("searchProducts")} placeholderTextColor={C.onSurfaceTertiary} style={styles.searchInput} />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortRow}>
            {sortOpts.map((o) => (
              <Pressable key={o.key} testID={`std-sort-${o.key}`} onPress={() => setSort(o.key)}
                style={[styles.sortChip, sort === o.key && styles.sortChipActive]}>
                <Text style={[styles.sortTxt, sort === o.key && { color: C.onBrand }]}>{o.label}</Text>
              </Pressable>
            ))}
            <Pressable testID="std-flagged-only" onPress={() => setFlaggedOnly((v) => !v)}
              style={[styles.sortChip, flaggedOnly && styles.flaggedChipActive]}>
              <MaterialCommunityIcons name="flag" size={13} color={flaggedOnly ? "#fff" : C.warning} />
              <Text style={[styles.sortTxt, { marginLeft: 4 }, flaggedOnly && { color: "#fff" }]}>{t("flaggedOnly")}</Text>
            </Pressable>
          </ScrollView>

          {sortedItems.length === 0 ? (
            <Card><Text style={styles.empty}>{t("noItemsWarehouse")}</Text></Card>
          ) : (
            sortedItems.map((it: any) => {
              const val = counts[it.product_id] ?? String(it.counted_qty);
              const d = (parseInt(val, 10) || 0) - Number(it.system_qty);
              return (
                <Card key={it.product_id} style={[styles.itemRow, it.needs_recount && styles.itemRowFlag, highlightPid === it.product_id && styles.itemRowHi]}
                  onLayout={(e) => { rowY.current[it.product_id] = e.nativeEvent.layout.y; }}>
                  {it.image ? (
                    <Pressable testID={`std-thumb-${it.product_id}`} onPress={() => setZoomImg(it.image)}>
                      <ProductImage path={it.image} style={styles.thumb} />
                    </Pressable>
                  ) : (
                    <View style={[styles.thumb, styles.thumbPh]}>
                      <MaterialCommunityIcons name="cube-outline" size={20} color={C.onSurfaceTertiary} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName} numberOfLines={1}>{it.name}</Text>
                    <Text style={styles.itemMeta} numberOfLines={1}>
                      {t("articleNo")}: {it.sku || "-"}  ·  {t("ean")}: {it.barcode || "-"}{it.location ? `  ·  ${t("binLocation")}: ${it.location}` : ""}
                    </Text>
                    <Text style={styles.itemSys}>{t("systemQty")}: {it.system_qty}{d !== 0 ? `   (${d > 0 ? "+" : ""}${d})` : ""}</Text>
                    {(it.assigned_name || (isMaster && it.needs_recount)) && (
                      <Pressable testID={`std-assign-${it.product_id}`} disabled={!isMaster} onPress={() => isMaster && setAssignItem(it)} hitSlop={6} style={styles.assignRow}>
                        <MaterialCommunityIcons name="account-arrow-right-outline" size={13} color={it.assigned_name ? C.brand : C.onSurfaceTertiary} />
                        <Text style={[styles.assignTxt, it.assigned_name && { color: C.brand }]}>
                          {it.assigned_name ? it.assigned_name : t("assign")}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                  <View style={{ alignItems: "center", gap: 6 }}>
                    <TextInput testID={`std-count-${it.product_id}`} value={val} editable={open}
                      onChangeText={(x) => setCounts((c) => ({ ...c, [it.product_id]: x }))}
                      onBlur={() => saveOne(it.product_id, counts[it.product_id] ?? String(it.counted_qty))}
                      keyboardType="number-pad" placeholderTextColor={C.onSurfaceTertiary}
                      style={[styles.countInput, !open && { opacity: 0.6 }]} />
                    {open && (
                      <Pressable testID={`std-recount-${it.product_id}`} onPress={() => toggleRecount(it)} hitSlop={8}>
                        <MaterialCommunityIcons name={it.needs_recount ? "flag" : "flag-outline"} size={20} color={it.needs_recount ? C.warning : C.onSurfaceTertiary} />
                      </Pressable>
                    )}
                  </View>
                </Card>
              );
            })
          )}

          {open && (
            <Btn testID="std-finish" title={t("finishStocktake")} icon="check-circle-outline" loading={finishing} onPress={doFinish} style={{ marginTop: S.lg }} />
          )}
        </ScrollView>
      )}

      <Modal visible={scanOpen} animationType="slide" onRequestClose={() => setScanOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          {scanOpen && (
            <CameraView style={StyleSheet.absoluteFill} facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr", "upc_a", "upc_e", "ean13", "ean8", "code128", "code39"] }}
              onBarcodeScanned={onScan} />
          )}
          <View style={[styles.scanTop, { paddingTop: insets.top + S.md }]}>
            <Text style={styles.scanTitle}>{t("scanToCount")}</Text>
            <Pressable testID="std-scan-close" onPress={() => setScanOpen(false)} hitSlop={12} style={styles.scanClose}>
              <MaterialCommunityIcons name="close" size={26} color="#fff" />
            </Pressable>
          </View>
          <View style={styles.scanFrameWrap}><View style={styles.scanFrame} /></View>
        </View>
      </Modal>

      <Modal visible={finishOpen} transparent animationType="fade" onRequestClose={() => setFinishOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("reviewChanges")}</Text>
            <Text style={styles.demandTxt}>{changedItems.length} {t("willUpdate")} · {total - changedItems.length} {t("unchanged")}</Text>
            {flaggedCount > 0 && (
              <View style={styles.flagWarn}>
                <MaterialCommunityIcons name="flag" size={16} color={C.warning} />
                <Text style={styles.flagWarnTxt}>{flaggedCount} {t("flaggedForRecount")}</Text>
              </View>
            )}
            <ScrollView style={{ maxHeight: 320 }}>
              {changedItems.length === 0 ? (
                <Text style={styles.itemMeta}>{t("noVariance")}</Text>
              ) : changedItems.map((it: any) => {
                const d = Number(it.counted_qty) - Number(it.system_qty);
                return (
                  <View key={it.product_id} style={styles.previewRow}>
                    <Text style={styles.previewName} numberOfLines={1}>{it.name}</Text>
                    <Text style={styles.previewNums}>{it.system_qty} → <Text style={{ color: C.onSurface }}>{it.counted_qty}</Text>
                      <Text style={{ color: d > 0 ? C.success : C.error }}>  ({d > 0 ? "+" : ""}{d})</Text>
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
            <Btn testID="std-finish-confirm" title={t("confirmAndFinish")} icon="check-circle-outline" loading={finishing} onPress={confirmFinish} style={{ marginTop: S.md }} />
            <Pressable onPress={() => setFinishOpen(false)} style={{ alignItems: "center", paddingVertical: S.md }}>
              <Text style={{ color: C.onSurfaceTertiary, fontFamily: F.textBold }}>{t("cancel")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={!!assignItem} transparent animationType="fade" onRequestClose={() => setAssignItem(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("assignRecount")}</Text>
            <Text style={styles.demandTxt} numberOfLines={1}>{assignItem?.name}</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {members.map((mem) => {
                const active = assignItem?.assigned_to === mem.id;
                return (
                  <Pressable key={mem.id} testID={`std-assign-opt-${mem.id}`} onPress={() => assignTo(assignItem.product_id, mem.id, mem.name)}
                    style={[styles.assignOpt, active && { backgroundColor: C.brand }]}>
                    <MaterialCommunityIcons name="account" size={18} color={active ? C.onBrand : C.onSurfaceSecondary} />
                    <Text style={[styles.assignOptTxt, active && { color: C.onBrand }]} numberOfLines={1}>{mem.name}{mem.is_owner ? ` · ${t("roleOwner")}` : mem.is_master ? ` · ${t("roleMaster")}` : ""}</Text>
                    {active && <MaterialCommunityIcons name="check" size={18} color={C.onBrand} />}
                  </Pressable>
                );
              })}
            </ScrollView>
            {assignItem?.assigned_to && (
              <Pressable testID="std-assign-clear" onPress={() => assignTo(assignItem.product_id, null, null)} style={{ alignItems: "center", paddingVertical: S.sm }}>
                <Text style={{ color: C.error, fontFamily: F.textBold }}>{t("unassign")}</Text>
              </Pressable>
            )}
            <Pressable onPress={() => setAssignItem(null)} style={{ alignItems: "center", paddingVertical: S.md }}>
              <Text style={{ color: C.onSurfaceTertiary, fontFamily: F.textBold }}>{t("cancel")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={!!zoomImg} transparent animationType="fade" onRequestClose={() => setZoomImg(null)}>
        <Pressable testID="std-zoom-close" onPress={() => setZoomImg(null)} style={styles.zoomBg}>
          {zoomImg && <ProductImage path={zoomImg} style={styles.zoomImg} contentFit="contain" />}
        </Pressable>
      </Modal>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingBottom: S.md, borderBottomWidth: 1, borderBottomColor: C.divider },
  title: { color: C.onSurface, fontFamily: F.display, fontSize: 18, letterSpacing: 0.5, flex: 1, textAlign: "center", marginHorizontal: S.sm },
  empty: { color: C.onSurfaceTertiary, fontFamily: F.text, textAlign: "center", marginTop: S.md },
  metaWh: { color: C.onSurface, fontFamily: F.textBold, fontSize: 16, flex: 1 },
  metaSub: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 13, marginTop: S.sm },
  badge: { borderRadius: R.sm, paddingHorizontal: S.sm, paddingVertical: 2 },
  badgeTxt: { color: "#fff", fontFamily: F.textBold, fontSize: 10, letterSpacing: 0.5 },
  sortRow: { gap: S.sm, paddingBottom: S.md },
  searchInput: { backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, height: 46, color: C.onSurface, fontFamily: F.text, fontSize: 15, marginBottom: S.md },
  previewRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.md, paddingVertical: S.sm, borderBottomWidth: 1, borderBottomColor: C.divider },
  previewName: { flex: 1, color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 14 },
  previewNums: { color: C.onSurfaceTertiary, fontFamily: F.textBold, fontSize: 14 },
  sortChipActive: { backgroundColor: C.brand, borderColor: C.brand },
  flaggedChipActive: { backgroundColor: C.warning, borderColor: C.warning },
  sortChip: { flexDirection: "row", height: 32, paddingHorizontal: S.md, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", backgroundColor: C.surfaceSecondary },
  sortTxt: { color: C.onSurfaceSecondary, fontFamily: F.textBold, fontSize: 12 },
  assignRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  assignTxt: { color: C.onSurfaceTertiary, fontFamily: F.textBold, fontSize: 12 },
  assignOpt: { flexDirection: "row", alignItems: "center", gap: S.sm, paddingHorizontal: S.md, paddingVertical: S.md, borderRadius: R.md, borderWidth: 1, borderColor: C.divider, marginBottom: S.sm },
  assignOptTxt: { flex: 1, color: C.onSurface, fontFamily: F.textBold, fontSize: 15 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: S.md, marginBottom: S.sm, paddingVertical: S.md },
  itemRowFlag: { borderColor: C.warning },
  itemRowHi: { borderColor: C.brand, borderWidth: 2, backgroundColor: C.isDark ? "rgba(255,87,34,0.10)" : "rgba(255,87,34,0.06)" },
  thumb: { width: 44, height: 44, borderRadius: R.sm },
  thumbPh: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  progHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: S.sm },
  progLbl: { color: C.onSurfaceSecondary, fontFamily: F.textBold, fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase" },
  progVal: { color: C.onSurface, fontFamily: F.textBold, fontSize: 14 },
  progTrack: { height: 8, borderRadius: 4, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, overflow: "hidden" },
  progFill: { height: "100%", backgroundColor: C.brand },
  flagNote: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: S.sm },
  flagNoteTxt: { color: C.warning, fontFamily: F.textBold, fontSize: 12 },
  flagWarn: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: S.sm, marginTop: -S.xs },
  flagWarnTxt: { color: C.warning, fontFamily: F.textBold, fontSize: 13 },
  zoomBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", alignItems: "center", justifyContent: "center", padding: S.lg },
  zoomImg: { width: "100%", height: "80%" },
  itemName: { color: C.onSurface, fontFamily: F.textBold, fontSize: 15 },
  itemMeta: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, marginTop: 3 },
  itemSys: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 12, marginTop: 3 },
  countInput: { width: 74, height: 48, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md, color: C.onSurface, fontFamily: F.textBold, fontSize: 18, textAlign: "center" },
  scanTop: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingBottom: S.md },
  scanTitle: { color: "#F5F5F5", fontFamily: F.display, fontSize: 20, letterSpacing: 1 },
  scanClose: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  scanFrameWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  scanFrame: { width: 260, height: 160, borderWidth: 3, borderColor: C.brand, borderRadius: R.md, backgroundColor: "transparent" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: S.xl },
  modalCard: { backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, padding: S.lg },
  modalTitle: { color: C.onSurface, fontFamily: F.display, fontSize: 20, marginBottom: S.xs },
  demandTxt: { color: C.brand, fontFamily: F.textBold, fontSize: 15, marginBottom: S.md },
  fieldLbl: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 11, letterSpacing: 0.5, marginBottom: S.xs, textTransform: "uppercase" },
  pickInput: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, height: 52, color: C.onSurface, fontFamily: F.textBold, fontSize: 20, textAlign: "center", marginBottom: S.md },
});
