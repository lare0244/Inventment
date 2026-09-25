import React, { useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, Modal, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useColors, useT } from "@/src/appsettings";
import { F, S, R, Palette } from "@/src/theme";
import { Card, Btn } from "@/src/components/ui";

type Member = { id: string; name: string; email: string; is_master: boolean; is_owner: boolean };
type Company = { connected: boolean; is_pro?: boolean; code?: string; is_owner?: boolean; is_master?: boolean; member_count?: number; max_members?: number; members?: Member[] };

export default function CompanyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { plan, refreshUser } = useAuth();
  const C = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [data, setData] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<Member | null>(null);
  const [eName, setEName] = useState("");
  const [eEmail, setEEmail] = useState("");
  const [eMaster, setEMaster] = useState(false);
  const [savingMember, setSavingMember] = useState(false);

  const load = useCallback(async () => {
    try { const r = await api<Company>("/company"); setData(r); } catch {} finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  function notify(msg: string) {
    if (Platform.OS === "web" && typeof window !== "undefined") window.alert(msg);
    else Alert.alert(msg, "");
  }
  function mapError(m: string): string {
    if (m.includes("pro_required")) return t("proRequiredCompany");
    if (m.includes("code_taken")) return t("errCodeTaken");
    if (m.includes("company_not_found")) return t("errCompanyNotFound");
    if (m.includes("company_full")) return t("errCompanyFull");
    if (m.includes("master_limit")) return t("errMasterLimit");
    if (m.includes("already_in_company")) return t("errAlreadyInCompany");
    if (m.includes("email_taken")) return t("errEmailTaken");
    return m;
  }

  async function doCreate() {
    if (busy) return; setBusy(true);
    try { await api("/company/create", { method: "POST", body: { code } }); setCode(""); await refreshUser(); await load(); }
    catch (e: any) { notify(mapError(String(e?.message || ""))); } finally { setBusy(false); }
  }
  async function doJoin() {
    if (busy) return; setBusy(true);
    try { await api("/company/join", { method: "POST", body: { code } }); setCode(""); await refreshUser(); await load(); }
    catch (e: any) { notify(mapError(String(e?.message || ""))); } finally { setBusy(false); }
  }
  function genCode() {
    const digits = "0123456789", letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const picks: string[] = [];
    for (let i = 0; i < 5; i++) picks.push(digits[Math.floor(Math.random() * 10)]);
    for (let i = 0; i < 4; i++) picks.push(letters[Math.floor(Math.random() * 26)]);
    for (let i = picks.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [picks[i], picks[j]] = [picks[j], picks[i]]; }
    setCode(picks.join(""));
  }
  async function doLeave() {
    const run = async () => {
      setBusy(true);
      try { await api("/company/leave", { method: "POST" }); await refreshUser(); await load(); }
      catch (e: any) { notify(mapError(String(e?.message || ""))); } finally { setBusy(false); }
    };
    const msg = data?.is_owner ? t("ownerLeaveConfirm") : t("disconnectConfirm");
    if (Platform.OS === "web" && typeof window !== "undefined") { if (window.confirm(msg)) run(); return; }
    Alert.alert(t("disconnect"), msg, [{ text: t("cancel"), style: "cancel" }, { text: t("disconnect"), style: "destructive", onPress: run }]);
  }

  function openEdit(m: Member) { setEdit(m); setEName(m.name); setEEmail(m.email); setEMaster(m.is_master); }
  async function saveMember() {
    if (!edit) return; setSavingMember(true);
    try {
      await api(`/company/members/${edit.id}`, { method: "PUT", body: { name: eName, email: eEmail, is_master: edit.is_owner ? undefined : eMaster } });
      setEdit(null); await load();
    } catch (e: any) { notify(mapError(String(e?.message || ""))); } finally { setSavingMember(false); }
  }
  function removeMember(m: Member) {
    const run = async () => { try { await api(`/company/members/${m.id}`, { method: "DELETE" }); setEdit(null); await load(); } catch (e: any) { notify(mapError(String(e?.message || ""))); } };
    const msg = `${t("removeMember")} — ${m.name}?`;
    if (Platform.OS === "web" && typeof window !== "undefined") { if (window.confirm(msg)) run(); return; }
    Alert.alert(t("removeMember"), msg, [{ text: t("cancel"), style: "cancel" }, { text: t("removeMember"), style: "destructive", onPress: run }]);
  }

  const isPro = plan === "pro" || data?.is_pro;

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Pressable testID="company-back" onPress={() => router.back()} hitSlop={10}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={C.onSurface} />
        </Pressable>
        <Text style={styles.title}>{t("company").toUpperCase()}</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 60 }} testID="company-scroll">
          {!data?.connected ? (
            <>
              <Card style={{ marginBottom: S.lg }}>
                <Text style={styles.cardTitle}>{t("companyCode")}</Text>
                <Text style={styles.info}>{t("companyShareInfo")}</Text>
                {!isPro && (
                  <View style={styles.proBanner}>
                    <MaterialCommunityIcons name="crown-outline" size={18} color={C.brand} />
                    <Text style={styles.proTxt}>{t("proRequiredCompany")}</Text>
                  </View>
                )}
                <TextInput testID="company-code-input" value={code} onChangeText={setCode} placeholder={t("enterCompanyCode")}
                  placeholderTextColor={C.onSurfaceTertiary} autoCapitalize="characters" style={styles.input} />
                <Btn testID="company-generate-code" title={t("generateCode")} icon="dice-multiple-outline" variant="secondary" style={{ marginBottom: S.sm }} onPress={genCode} />
                <Btn testID="company-create-btn" title={t("createCompany")} icon="domain-plus" loading={busy} onPress={doCreate} />
                <Btn testID="company-join-btn" title={t("joinCompany")} icon="account-multiple-plus-outline" variant="secondary" style={{ marginTop: S.sm }} loading={busy} onPress={doJoin} />
              </Card>
            </>
          ) : (
            <>
              <Card style={{ marginBottom: S.lg }}>
                <Text style={styles.cardTitle}>{t("connectedToCompany")}</Text>
                <View style={styles.codeRow}>
                  <Text style={styles.codeLabel}>{t("companyCode")}</Text>
                  <Text testID="company-code-value" style={styles.codeVal}>{data.code}</Text>
                </View>
                <View style={styles.codeRow}>
                  <Text style={styles.codeLabel}>{t("yourRole")}</Text>
                  <Text style={styles.roleVal}>{data.is_owner ? t("roleOwner") : data.is_master ? t("roleMaster") : t("roleMember")}</Text>
                </View>
                <View style={styles.codeRow}>
                  <Text style={styles.codeLabel}>{t("teamMembers")}</Text>
                  <Text style={styles.roleVal}>{data.member_count}/{data.max_members}</Text>
                </View>
                <Btn testID="company-leave-btn" title={t("disconnect")} variant="ghost" icon="logout-variant" style={{ marginTop: S.sm }} loading={busy} onPress={doLeave} />
              </Card>

              {data.is_master && (
                <>
                  <Text style={styles.section}>{t("teamMembers")} · {data.members?.length || 0}</Text>
                  {(data.members?.length || 0) === 0 ? (
                    <Card><Text style={styles.info}>{t("noMembers")}</Text></Card>
                  ) : (
                    data.members!.map((m) => (
                      <Pressable key={m.id} testID={`member-${m.id}`} onPress={() => openEdit(m)}>
                        <Card style={styles.memberRow}>
                          <View style={[styles.avatar, { backgroundColor: m.is_owner ? C.brand : m.is_master ? C.info : C.surfaceTertiary }]}>
                            <MaterialCommunityIcons name={m.is_owner ? "crown" : m.is_master ? "shield-account" : "account"} size={18} color={C.onBrand} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.memberName} numberOfLines={1}>{m.name}</Text>
                            <Text style={styles.memberEmail} numberOfLines={1}>{m.email}</Text>
                          </View>
                          <View style={[styles.badge, { borderColor: m.is_owner ? C.brand : m.is_master ? C.info : C.border }]}>
                            <Text style={[styles.badgeTxt, { color: m.is_owner ? C.brand : m.is_master ? C.info : C.onSurfaceTertiary }]}>
                              {m.is_owner ? t("roleOwner") : m.is_master ? t("roleMaster") : t("roleMember")}
                            </Text>
                          </View>
                        </Card>
                      </Pressable>
                    ))
                  )}
                </>
              )}
            </>
          )}
        </ScrollView>
      )}

      <Modal visible={!!edit} transparent animationType="fade" onRequestClose={() => setEdit(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("editMember")}</Text>
            <TextInput testID="member-name" value={eName} onChangeText={setEName} placeholder={t("name")} placeholderTextColor={C.onSurfaceTertiary} style={styles.input} />
            <TextInput testID="member-email" value={eEmail} onChangeText={setEEmail} placeholder={t("email")} placeholderTextColor={C.onSurfaceTertiary} keyboardType="email-address" autoCapitalize="none" style={styles.input} />
            {!edit?.is_owner && (
              <Pressable testID="member-master-toggle" onPress={() => setEMaster((v) => !v)} style={styles.checkRow}>
                <MaterialCommunityIcons name={eMaster ? "checkbox-marked" : "checkbox-blank-outline"} size={24} color={eMaster ? C.brand : C.onSurfaceTertiary} />
                <Text style={styles.checkLabel}>{t("makeMaster")}</Text>
              </Pressable>
            )}
            <Btn testID="member-save" title={t("save")} icon="check" loading={savingMember} onPress={saveMember} />
            {!edit?.is_owner && (
              <Btn testID="member-remove" title={t("removeMember")} variant="ghost" icon="account-remove-outline" style={{ marginTop: S.sm }} onPress={() => edit && removeMember(edit)} />
            )}
            <Pressable onPress={() => setEdit(null)} style={{ alignItems: "center", paddingVertical: S.md }}>
              <Text style={{ color: C.onSurfaceTertiary, fontFamily: F.textBold }}>{t("cancel")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingBottom: S.md, borderBottomWidth: 1, borderBottomColor: C.divider },
  title: { color: C.onSurface, fontFamily: F.display, fontSize: 22, letterSpacing: 1 },
  cardTitle: { color: C.onSurface, fontFamily: F.textBold, fontSize: 16, marginBottom: S.sm },
  info: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13, lineHeight: 19, marginBottom: S.md },
  proBanner: { flexDirection: "row", alignItems: "center", gap: S.sm, borderWidth: 1, borderColor: C.brand, borderRadius: R.md, padding: S.sm, marginBottom: S.md, backgroundColor: C.isDark ? "rgba(255,87,34,0.08)" : "rgba(255,87,34,0.06)" },
  proTxt: { flex: 1, color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 12 },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, height: 50, color: C.onSurface, fontFamily: F.text, fontSize: 15, marginBottom: S.md },
  codeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: S.sm, borderTopWidth: 1, borderTopColor: C.divider },
  codeLabel: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13 },
  codeVal: { color: C.brand, fontFamily: F.display, fontSize: 18, letterSpacing: 1 },
  roleVal: { color: C.onSurface, fontFamily: F.textBold, fontSize: 14 },
  section: { color: C.onSurfaceSecondary, fontFamily: F.textBold, fontSize: 13, letterSpacing: 1, marginTop: S.sm, marginBottom: S.sm },
  memberRow: { flexDirection: "row", alignItems: "center", gap: S.md, marginBottom: S.sm, paddingVertical: S.md },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  memberName: { color: C.onSurface, fontFamily: F.textBold, fontSize: 15 },
  memberEmail: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, marginTop: 2 },
  badge: { paddingHorizontal: S.sm, paddingVertical: 3, borderRadius: R.sm, borderWidth: 1 },
  badgeTxt: { fontFamily: F.textBold, fontSize: 11, letterSpacing: 0.5 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: S.xl },
  modalCard: { backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, padding: S.lg },
  modalTitle: { color: C.onSurface, fontFamily: F.display, fontSize: 22, marginBottom: S.lg },
  checkRow: { flexDirection: "row", alignItems: "center", gap: S.sm, paddingVertical: S.sm, marginBottom: S.sm },
  checkLabel: { color: C.onSurface, fontFamily: F.text, fontSize: 15 },
});
