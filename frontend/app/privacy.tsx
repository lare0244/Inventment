import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";
import { useColors, useT } from "@/src/appsettings";
import { F, S, Palette } from "@/src/theme";

const CONTACT_EMAIL = "warehouse@test.com";
const CONTROLLER = "INVENTMENT";
const LAST_UPDATED = "June 2026";

export default function Privacy() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={styles.section}>
      <Text style={styles.h2}>{title}</Text>
      {children}
    </View>
  );
  const P = ({ children }: { children: React.ReactNode }) => <Text style={styles.p}>{children}</Text>;

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + S.md }]}>
        <Pressable testID="privacy-back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} hitSlop={12} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={C.onSurface} />
        </Pressable>
        <Text style={styles.title}>{t("privacyPolicy").toUpperCase()}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + 40 }}>
        <Text style={styles.updated}>Last updated: {LAST_UPDATED}</Text>
        <P>
          This Privacy Policy explains how {CONTROLLER} ("we", "us", "our") collects, uses, and protects your
          information when you use the {CONTROLLER} inventory management application and website (the "Service").
          By using the Service you agree to the practices described here.
        </P>

        <Section title="1. Who we are">
          <P>
            The data controller for the Service is {CONTROLLER}. If you have any questions about this policy or
            your data, contact us at {CONTACT_EMAIL}.
          </P>
        </Section>

        <Section title="2. Information we collect">
          <P>• Account data: your name, email address, and password (stored securely, hashed — we never store it in plain text). If you sign in with Google or Apple, we receive your name and email from that provider.</P>
          <P>• Business data you enter: products, barcodes, prices, suppliers, warehouses, categories, stock levels, orders, stocktakes, production orders, and product photos you upload.</P>
          <P>• Company/organization details you optionally add for documents (company name and address).</P>
          <P>• Technical data needed to operate the app, such as your chosen language, currency, and theme preferences.</P>
        </Section>

        <Section title="3. How we use your information">
          <P>We use your information only to provide and operate the Service: to authenticate you, store and display your inventory data, generate reports and documents (PDF/CSV), enable multi-user company sharing, and optionally power AI-based restock suggestions. We do not sell your personal data.</P>
        </Section>

        <Section title="4. Barcode & AI features">
          <P>When you look up a barcode, the barcode number may be sent to the Open Food Facts public database to retrieve product details. When you request AI restock insights, your relevant stock summary is sent to our AI provider to generate suggestions. No personal account credentials are shared in these requests.</P>
        </Section>

        <Section title="5. Photos & camera">
          <P>If you add product photos, the images are uploaded to our secure object storage and associated with your account. On mobile devices, camera and photo-library access are only used when you actively choose to take or select a photo, and only after you grant permission.</P>
        </Section>

        <Section title="6. Data sharing">
          <P>We share data only with service providers that help us run the Service (secure hosting, database, object storage, payment processing for subscriptions, and the AI/barcode lookups described above), and only to the extent needed to provide the Service. If you join a shared company workspace, your data is shared with the other members of that company.</P>
        </Section>

        <Section title="7. Data retention & deletion">
          <P>We keep your data for as long as your account is active. You can permanently delete your account and all associated data at any time from Settings → Delete Account. Deletion is immediate and irreversible; if you own a shared company workspace, deleting your account dissolves that workspace. You may also email {CONTACT_EMAIL} to request deletion.</P>
        </Section>

        <Section title="8. Security">
          <P>We use industry-standard measures to protect your data, including encrypted transport (HTTPS), hashed passwords, and access controls that scope each account's data to its owner or company. No method of transmission or storage is 100% secure, but we work to protect your information.</P>
        </Section>

        <Section title="9. Your rights">
          <P>Depending on your location, you may have the right to access, correct, export, or delete your personal data, and to object to or restrict certain processing. Most of these actions can be performed directly in the app; for anything else, contact {CONTACT_EMAIL}.</P>
        </Section>

        <Section title="10. Children">
          <P>The Service is intended for business use and is not directed to children under 13. We do not knowingly collect personal information from children.</P>
        </Section>

        <Section title="11. Changes to this policy">
          <P>We may update this policy from time to time. Material changes will be reflected by updating the "Last updated" date above and, where appropriate, by notifying you in the app.</P>
        </Section>

        <Section title="12. Contact">
          <P>For any privacy questions or requests, contact us at {CONTACT_EMAIL}.</P>
        </Section>
      </ScrollView>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingBottom: S.md, borderBottomWidth: 1, borderBottomColor: C.divider },
  backBtn: { width: 24, alignItems: "flex-start" },
  title: { color: C.onSurface, fontFamily: F.display, fontSize: 20, letterSpacing: 1 },
  updated: { color: C.onSurfaceTertiary, fontFamily: F.text, fontSize: 12, marginBottom: S.lg },
  section: { marginTop: S.lg },
  h2: { color: C.onSurface, fontFamily: F.textBold, fontSize: 16, marginBottom: S.sm },
  p: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 14, lineHeight: 21, marginBottom: S.sm },
});
