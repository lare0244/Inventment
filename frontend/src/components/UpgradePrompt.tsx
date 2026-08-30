import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { View, Text, StyleSheet, Modal, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors, useT } from "@/src/appsettings";
import { F, S, R, Palette } from "@/src/theme";

type PromptOpts = { kind?: string };
type Ctx = { showUpgrade: (opts?: PromptOpts) => void };

const UpgradeCtx = createContext<Ctx>({ showUpgrade: () => {} });
export const useUpgradePrompt = () => useContext(UpgradeCtx);

// Map backend limit "kind" -> an existing i18n key for the item label.
const KIND_KEY: Record<string, string> = {
  products: "products",
  categories: "categories",
  suppliers: "suppliers",
  warehouses: "warehouse",
};

export function UpgradePromptProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const C = useColors();
  const t = useT();
  const styles = makeStyles(C);
  const [visible, setVisible] = useState(false);
  const [kind, setKind] = useState<string | undefined>();

  const showUpgrade = useCallback((opts?: PromptOpts) => {
    setKind(opts?.kind);
    setVisible(true);
  }, []);

  function close() { setVisible(false); }
  function goUpgrade() { setVisible(false); router.push("/pro"); }

  const itemLabel = kind && KIND_KEY[kind] ? t(KIND_KEY[kind]) : "";

  return (
    <UpgradeCtx.Provider value={{ showUpgrade }}>
      {children}
      <Modal transparent visible={visible} animationType="fade" onRequestClose={close} statusBarTranslucent>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.card} onPress={() => {}}>
            <View style={styles.crownWrap}>
              <MaterialCommunityIcons name="crown" size={34} color={C.brand} />
            </View>
            <Text style={styles.title}>{t("limitReachedTitle")}</Text>
            <Text style={styles.body}>
              {itemLabel ? `${itemLabel}: ` : ""}{t("limitReachedBody")}
            </Text>

            <Pressable testID="upgrade-prompt-go" onPress={goUpgrade} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}>
              <MaterialCommunityIcons name="crown" size={18} color={C.onBrand} />
              <Text style={styles.primaryTxt}>{t("upgradeToPro")}</Text>
            </Pressable>
            <Pressable testID="upgrade-prompt-later" onPress={close} style={styles.ghost}>
              <Text style={styles.ghostTxt}>{t("notNow")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </UpgradeCtx.Provider>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: S.xl },
  card: { width: "100%", maxWidth: 380, backgroundColor: C.surfaceSecondary, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.xl, alignItems: "center" },
  crownWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.surfaceTertiary, alignItems: "center", justifyContent: "center", marginBottom: S.md },
  title: { color: C.onSurface, fontFamily: F.display, fontSize: 20, letterSpacing: 0.5, textAlign: "center" },
  body: { color: C.onSurfaceSecondary, fontFamily: F.text, fontSize: 14, textAlign: "center", lineHeight: 21, marginTop: S.sm, marginBottom: S.xl },
  primary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.sm, alignSelf: "stretch", height: 50, borderRadius: R.md, backgroundColor: C.brand },
  primaryTxt: { color: C.onBrand, fontFamily: F.textBold, fontSize: 16 },
  ghost: { alignSelf: "stretch", height: 44, alignItems: "center", justifyContent: "center", marginTop: S.sm },
  ghostTxt: { color: C.onSurfaceTertiary, fontFamily: F.textBold, fontSize: 14 },
});
