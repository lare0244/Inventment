// RevenueCat wrapper. Native In-App Purchases only work in a real build
// (EAS dev/production build) — not in Expo Go or the web preview. Everything
// here is defensive so the app never crashes when the SDK/keys are absent.
import { Platform } from "react-native";
import Purchases, { CustomerInfo, PurchasesPackage, LOG_LEVEL } from "react-native-purchases";

const IOS_KEY = process.env.EXPO_PUBLIC_RC_IOS_KEY || "";
const ANDROID_KEY = process.env.EXPO_PUBLIC_RC_ANDROID_KEY || "";
export const RC_ENTITLEMENT = "pro";

let configured = false;

function apiKeyForPlatform(): string {
  if (Platform.OS === "ios") return IOS_KEY;
  if (Platform.OS === "android") return ANDROID_KEY;
  return ""; // web: native IAP unavailable
}

// True only when a real key is present AND we're on a native platform.
export function purchasesAvailable(): boolean {
  return Platform.OS !== "web" && !!apiKeyForPlatform();
}

export async function configurePurchases(userId: string) {
  if (!purchasesAvailable()) return;
  try {
    if (!configured) {
      Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
      await Purchases.configure({ apiKey: apiKeyForPlatform(), appUserID: userId });
      configured = true;
    } else {
      await Purchases.logIn(userId);
    }
  } catch (e) {
    console.warn("[purchases] configure failed", e);
  }
}

export async function logOutPurchases() {
  if (!configured) return;
  try { await Purchases.logOut(); } catch {}
}

export function hasPro(info: CustomerInfo | null): boolean {
  return Boolean(info?.entitlements?.active?.[RC_ENTITLEMENT]);
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!configured) return null;
  try { return await Purchases.getCustomerInfo(); } catch { return null; }
}

export async function getMonthlyPackage(): Promise<PurchasesPackage | null> {
  if (!configured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current?.monthly ?? offerings.current?.availablePackages?.[0] ?? null;
  } catch (e) {
    console.warn("[purchases] getOfferings failed", e);
    return null;
  }
}

export async function buyMonthlyPro(pkg: PurchasesPackage): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

export async function restorePurchases(): Promise<CustomerInfo | null> {
  if (!configured) return null;
  try { return await Purchases.restorePurchases(); } catch { return null; }
}
