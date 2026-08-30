import React, { useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useColors, useT, useApp } from "@/src/appsettings";
import { CURRENCIES } from "@/src/currency";
import { LANGUAGES } from "@/src/i18n";
import { F, S, R, Palette } from "@/src/theme";
import { Card, Btn, Dropdown } from "@/src/components/ui";
import { useUpgradePrompt } from "@/src/components/UpgradePrompt";

type Kind = "warehouses" | "categories" | "suppliers";

export default function Settings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut, currency, setCurrency, plan, refreshUser, company, saveSettings } = useAuth();
  const { themeName, setThemeName, lang, setLang } = useApp();
  const C = useColors();
  const t = useT();
  const { showUpgrade } = useUpgradePrompt();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [billing, setBilling] = useState<any>(null);
  const [modal, setModal] = useState<Kind | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const emptyForm = { name: "", email: "", phone: "", contact_person: "", street1: "", street2: "", number: "", postcode: "", city: "", state: "", county: "" };
  const [form, setForm] = useState<Record<string, string>>(emptyForm);
  const setField = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const [companyOpen, setCompanyOpen] = useState(false);
  const cEmpty = { company_name: "", street1: "", street2: "", postcode: "", city: "", state: "", county: "" };
  const [cForm, setCForm] = useState<Record<string, string>>(cEmpty);
  const setCField = (k: string, v: string) => setCForm((f) => ({ ...f, [k]: v }));
  const openCompany = () => { setCForm({ ...cEmpty, ...(company || {}) }); setCompanyOpen(true); };
  const saveCompany = async () => { try { await saveSettings({ company: cForm }); } catch {} setCompanyOpen(false); };
  const [of1, setOf1] = useState(user?.so_field1_label || "");
  const [of2, setOf2] = useState(user?.so_field2_label || "");
  const [savingOf, setSavingOf] = useState(false);
  const saveOrderFields = async () => { setSavingOf(true); try { await saveSettings({ so_field1_label: of1.trim() || "Field 1", so_field2_label: of2.trim() || "Field 2" }); } catch {} setSavingOf(false); };
  const COMPANY_FIELDS = [
    { k: "street1", label: t("street1") }, { k: "street2", label: t("street2") },
    { k: "postcode", label: t("postcode") }, { k: "city", label: t("city") },
    { k: "state", label: t("stateRegion") }, { k: "county", label: t("county") },
  ];

  const load = useCallback(async () => {
    const [w, c, s, b] = await Promise.all([api("/warehouses"), api("/categories"), api("/suppliers"), api("/billing/plan").catch(() => null)]);
    setWarehouses(w); setCategories(c); setSuppliers(s); setBilling(b);
    refreshUser();
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  function upgrade() {
    router.push("/pro");
  }

  async function activateTestPro() {
    try { await api("/billing/activate-test", { method: "POST" }); await refreshUser(); load(); } catch {}
  }

  function openModal(kind: Kind, item?: any) {
    setModal(kind);
    setEditId(item?.id || null);
    setForm(item ? { ...emptyForm, ...item } : emptyForm);
  }

  async function save() {
    if (!form.name.trim()) return;
    const e = editId ? `/${editId}` : "";
    const m = editId ? "PUT" : "POST";
    try {
      if (modal === "categories") {
        await api(`/categories${e}`, { method: m, body: { name: form.name } });
      } else {
        const addr = { street1: form.street1, street2: form.street2, number: form.number, postcode: form.postcode, city: form.city, state: form.state, county: form.county, contact_person: form.contact_person, phone: form.phone };
        if (modal === "warehouses") await api(`/warehouses${e}`, { method: m, body: { name: form.name, ...addr } });
        if (modal === "suppliers") await api(`/suppliers${e}`, { method: m, body: { name: form.name, email: form.email, ...addr } });
      }
      setForm(emptyForm); setEditId(null); setModal(null); load();
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (msg.includes("limit_reached")) {
        setModal(null);
        showUpgrade({ kind: modal || undefined });
      } else if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert(`${t("saveFailed")}: ${msg}`);
      } else {
        Alert.alert(t("saveFailed"), msg);
      }
    }
  }
  async function del(kind: Kind, id: string) {
    await api(`/${kind}/${id}`, { method: "DELETE" }); load();
  }

  const ADDRESS_FIELDS = [
    { k: "street1", label: t("street1") }, { k: "street2", label: t("street2") },
    { k: "number", label: t("streetNumber") }, { k: "postcode", label: t("postcode") },
    { k: "city", label: t("city") }, { k: "state", label: t("stateRegion") },
    { k: "county", label: t("county") }, { k: "contact_person", label: t("contactPerson") },
    { k: "phone", label: t("phone") },
  ];

  const Section = ({ kind, title, icon, items, sub }: any) => (
    <Card style={{ marginBottom: S.lg }}>
      <View style={styles.secHead}>
        <View style={styles.secTitleRow}>
          <MaterialCommunityIcons name={icon} size={20} color={C.brand} />
          <Text style={styles.secTitle}>{title}</Text>
        </View>
        <Pressable testID={`add-${kind}`} onPress={() => openModal(kind)}>
          <MaterialCommunityIcons name="plus-circle" size={24} color={C.brand} />
        </Pressable>
      </View>
      {items.length === 0 ? (
        <Text style={styles.emptyTxt}>{t("noneYet")}</Text>
      ) : (
        items.map((it: any) => (
          <View key={it.id} style={styles.itemRow}>
            <Text style={styles.itemName}>{it.name}{sub && it[sub] ? `  ·  ${it[sub]}` : ""}</Text>
            <Pressable testID={`edit-${kind}-${it.id}`} onPress={() => openModal(kind, it)} style={{ marginRight: S.md }}>
              <MaterialCommunityIcons name="pencil-outline" size={18} color={C.info} />
            </Pressable>
            <Pressable testID={`del-${kind}-${it.id}`} onPress={() => del(kind, it.id)}>
              <MaterialCommunityIcons name="trash-can-outline" size={18} color={C.error} />
            </Pressable>
          </View>
        ))
      )}
    </Card>
  );

  const Pill = ({ active, label, onPress, testID }: any) => (
    <Pressable testID={testID} onPress={onPress} style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.pillTxt, active && { color: C.onBrand }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + S.md }]}>
        <Text style={styles.title}>{t("settings").toUpperCase()}</Text>
        <Text style={styles.sub}>{user?.email}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 40 }}>
        <Card style={{ marginBottom: S.lg, borderColor: plan === "pro" ? C.success : C.brand }}>
          <View style={styles.planHead}>
            <View style={styles.secTitleRow}>
              <MaterialCommunityIcons name={plan === "pro" ? "crown" : "crown-outline"} size={22} color={plan === "pro" ? C.success : C.brand} />
              <Text style={styles.secTitle}>{plan === "pro" ? t("planPro") : t("planFree")}</Text>
            </View>
            <View style={[styles.planBadge, { borderColor: plan === "pro" ? C.success : C.onSurfaceTertiary }]}>
              <Text style={[styles.planBadgeTxt, { color: plan === "pro" ? C.success : C.onSurfaceTertiary }]}>{plan.toUpperCase()}</Text>
            </View>
          </View>
          {billing && (
            <Text style={styles.planUsage}>
              {t("products")}: {billing.usage.products}/{billing.limits.products} · {t("warehouse")}: {billing.usage.warehouses}/{billing.limits.warehouses} · {t("categories")}: {billing.usage.categories}/{billing.limits.categories} · {t("suppliers")}: {billing.usage.suppliers}/{billing.limits.suppliers}
            </Text>
          )}
          {plan !== "pro" ? (
            <>
              <Text style={styles.planPitch}>{t("proPitch")}</Text>
              <Btn testID="upgrade-btn" title={t("upgradeToPro")} icon="crown" onPress={upgrade} />
              {__DEV__ && (
                <Btn testID="activate-pro-test-btn" title={t("activateProTest")} variant="ghost" icon="flask-outline" style={{ marginTop: S.sm }} onPress={activateTestPro} />
              )}
            </>
          ) : (
            <Text style={styles.planUsage}>{t("proActive")}{billing?.plan_expires_at ? ` · ${t("renews")} ${String(billing.plan_expires_at).slice(0, 10)}` : ""}</Text>
          )}
        </Card>

        <Card style={{ marginBottom: S.lg }}>
          <View style={styles.secTitleRow}><MaterialCommunityIcons name="theme-light-dark" size={20} color={C.brand} /><Text style={styles.secTitle}>{t("appearance")}</Text></View>
          <View style={styles.pillRow}>
            <Pill testID="theme-dark" active={themeName === "dark"} label={t("dark")} onPress={() => setThemeName("dark")} />
            <Pill testID="theme-light" active={themeName === "light"} label={t("light")} onPress={() => setThemeName("light")} />
          </View>
        </Card>

        <Card style={{ marginBottom: S.lg }}>
          <View style={styles.secTitleRow}><MaterialCommunityIcons name="translate" size={20} color={C.brand} /><Text style={styles.secTitle}>{t("language")}</Text></View>
          <Dropdown testID="lang-dropdown" value={lang} onChange={(v) => setLang(v as any)}
            options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} />
        </Card>

        <Card style={{ marginBottom: S.lg }}>
          <View style={styles.secTitleRow}><MaterialCommunityIcons name="cash-multiple" size={20} color={C.brand} /><Text style={styles.secTitle}>{t("currency")}</Text></View>
          <Dropdown testID="currency-dropdown" value={currency} onChange={(v) => setCurrency(v)}
            options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}`, sub: c.symbol }))} />
        </Card>

        <Pressable testID="company-card" onPress={() => router.push("/company")}>
          <Card style={{ marginBottom: S.lg }}>
            <View style={styles.secHead}>
              <View style={styles.secTitleRow}>
                <MaterialCommunityIcons name="account-group-outline" size={20} color={C.brand} />
                <Text style={styles.secTitle}>{t("company")}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={24} color={C.onSurfaceTertiary} />
            </View>
            {user?.company_connected ? (
              <Text style={styles.planUsage}>
                {t("companyCode")}: {user.company_code} · {user.is_company_owner ? t("roleOwner") : user.is_company_master ? t("roleMaster") : t("roleMember")}
              </Text>
            ) : (
              <Text style={styles.emptyTxt}>{t("companyShareInfo")}</Text>
            )}
          </Card>
        </Pressable>

        <Card style={{ marginBottom: S.lg }}>
          <View style={styles.secTitleRow}>
            <MaterialCommunityIcons name="clipboard-list-outline" size={20} color={C.brand} />
            <Text style={styles.secTitle}>{t("orderSettings")}</Text>
          </View>
          <Text style={styles.emptyTxt}>{t("fieldLabelHint")}</Text>
          <TextInput testID="so-label1" placeholder="Field 1" placeholderTextColor={C.onSurfaceTertiary} value={of1}
            onChangeText={(v) => setOf1(v.slice(0, 12))} maxLength={12} style={[styles.input, { marginTop: S.md }]} />
          <TextInput testID="so-label2" placeholder="Field 2" placeholderTextColor={C.onSurfaceTertiary} value={of2}
            onChangeText={(v) => setOf2(v.slice(0, 12))} maxLength={12} style={styles.input} />
          <Btn testID="so-labels-save" title={t("save")} icon="content-save-outline" loading={savingOf} onPress={saveOrderFields} />
        </Card>

        <Card style={{ marginBottom: S.lg }}>
          <View style={styles.secHead}>
            <View style={styles.secTitleRow}>
              <MaterialCommunityIcons name="office-building-outline" size={20} color={C.brand} />
              <Text style={styles.secTitle}>{t("companyInfo")}</Text>
            </View>
            <Pressable testID="edit-company" onPress={openCompany}>
              <MaterialCommunityIcons name="pencil-outline" size={22} color={C.brand} />
            </Pressable>
          </View>
          {company?.company_name ? (
            <>
              <Text style={styles.itemName}>{company.company_name}</Text>
              {!!(company.street1 || company.city) && (
                <Text style={styles.planUsage}>
                  {[company.street1, company.street2, company.postcode, company.city, company.state, company.county].filter(Boolean).join(", ")}
                </Text>
              )}
            </>
          ) : (
            <Text style={styles.emptyTxt}>{t("noneYet")}</Text>
          )}
        </Card>

        <Section kind="warehouses" title={t("warehouses")} icon="warehouse" items={warehouses} sub="address" />
        <Section kind="categories" title={t("categories")} icon="shape-outline" items={categories} />
        <Section kind="suppliers" title={t("suppliers")} icon="truck-outline" items={suppliers} sub="email" />
        <Btn testID="logout-btn" title={t("signOut")} variant="ghost" icon="logout" onPress={signOut} />
      </ScrollView>

      <Modal visible={!!modal} transparent animationType="fade" onRequestClose={() => setModal(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editId ? t("edit") : t("add")}</Text>
            <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
              <TextInput testID="modal-name" placeholder={t("name")} placeholderTextColor={C.onSurfaceTertiary} value={form.name} onChangeText={(v) => setField("name", v)} style={styles.input} />
              {modal === "suppliers" && (
                <TextInput testID="modal-email" placeholder={t("email")} placeholderTextColor={C.onSurfaceTertiary} value={form.email} onChangeText={(v) => setField("email", v)} keyboardType="email-address" autoCapitalize="none" style={styles.input} />
              )}
              {modal !== "categories" && ADDRESS_FIELDS.map((af) => (
                <TextInput key={af.k} testID={`modal-${af.k}`} placeholder={af.label} placeholderTextColor={C.onSurfaceTertiary}
                  value={form[af.k]} onChangeText={(v) => setField(af.k, v)}
                  keyboardType={af.k === "phone" ? "phone-pad" : "default"} style={styles.input} />
              ))}
            </ScrollView>
            <Btn testID="modal-save" title={t("save")} onPress={save} />
            <Pressable onPress={() => { setModal(null); setEditId(null); }} style={{ alignItems: "center", paddingVertical: S.md }}>
              <Text style={{ color: C.onSurfaceTertiary, fontFamily: F.textBold }}>{t("cancel")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={companyOpen} transparent animationType="fade" onRequestClose={() => setCompanyOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("companyInfo")}</Text>
            <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
              <TextInput testID="company-name" placeholder={t("companyName")} placeholderTextColor={C.onSurfaceTertiary}
                value={cForm.company_name} onChangeText={(v) => setCField("company_name", v)} style={styles.input} />
              {COMPANY_FIELDS.map((cf) => (
                <TextInput key={cf.k} testID={`company-${cf.k}`} placeholder={cf.label} placeholderTextColor={C.onSurfaceTertiary}
                  value={cForm[cf.k]} onChangeText={(v) => setCField(cf.k, v)} style={styles.input} />
              ))}
            </ScrollView>
            <Btn testID="company-save" title={t("save")} onPress={saveCompany} />
            <Pressable onPress={() => setCompanyOpen(false)} style={{ alignItems: "center", paddingVertical: S.md }}>
              <Text style={{ color: C.onSurfaceTertiary, fontFamily: F.textBold }}>{t("cancel")}</Text>
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
  secHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: S.md },
  secTitleRow: { flexDirection: "row", alignItems: "center", gap: S.sm, marginBottom: S.md },
  secTitle: { color: C.onSurface, fontFamily: F.textBold, fontSize: 16 },
  planHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  planBadge: { paddingHorizontal: S.sm, paddingVertical: 2, borderRadius: R.pill, borderWidth: 1 },
  planBadgeTxt: { fontFamily: F.textBold, fontSize: 11, letterSpacing: 1 },
  planUsage: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, marginTop: S.sm, marginBottom: S.sm, lineHeight: 18 },
  planPitch: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 13, marginBottom: S.md, lineHeight: 19 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: S.sm, borderTopWidth: 1, borderTopColor: C.divider },
  itemName: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 14, flex: 1 },
  emptyTxt: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 13 },
  pillRow: { flexDirection: "row", gap: S.sm },
  pill: { flex: 1, height: 44, borderRadius: R.md, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", backgroundColor: C.surface },
  pillActive: { backgroundColor: C.brand, borderColor: C.brand },
  pillTxt: { color: C.onSurfaceSecondary, fontFamily: F.textBold, fontSize: 14 },
  currencyRow: { flexDirection: "row", flexWrap: "wrap", gap: S.sm },
  curChip: { width: "47.5%", borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: S.md, backgroundColor: C.surface },
  curChipActive: { backgroundColor: C.brand, borderColor: C.brand },
  curCode: { color: C.onSurface, fontFamily: F.display, fontSize: 18 },
  curName: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 11, marginTop: 2 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: S.xl },
  modalCard: { backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, padding: S.lg },
  modalTitle: { color: C.onSurface, fontFamily: F.display, fontSize: 22, marginBottom: S.lg },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, height: 50, color: C.onSurface, fontFamily: F.text, fontSize: 15, marginBottom: S.md },
});
