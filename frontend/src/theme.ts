export type Palette = {
  isDark: boolean;
  surface: string;
  onSurface: string;
  surfaceSecondary: string;
  onSurfaceSecondary: string;
  surfaceTertiary: string;
  onSurfaceTertiary: string;
  brand: string;
  onBrand: string;
  brandSecondary: string;
  brandTertiary: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  border: string;
  borderStrong: string;
  divider: string;
};

export const DARK: Palette = {
  isDark: true,
  surface: "#121212",
  onSurface: "#E0E0E0",
  surfaceSecondary: "#1E1E1E",
  onSurfaceSecondary: "#B0BEC5",
  surfaceTertiary: "#2C2C2C",
  onSurfaceTertiary: "#90A4AE",
  brand: "#FF5722",
  onBrand: "#121212",
  brandSecondary: "#FF8A65",
  brandTertiary: "#3E2723",
  success: "#00E676",
  warning: "#FFEA00",
  error: "#FF1744",
  info: "#29B6F6",
  border: "#37474F",
  borderStrong: "#FF5722",
  divider: "#263238",
};

export const LIGHT: Palette = {
  isDark: false,
  surface: "#F4F6F8",
  onSurface: "#1A1F24",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#37474F",
  surfaceTertiary: "#E7ECF0",
  onSurfaceTertiary: "#607D8B",
  brand: "#E64A19",
  onBrand: "#FFFFFF",
  brandSecondary: "#FF8A65",
  brandTertiary: "#FFE0D6",
  success: "#2E7D32",
  warning: "#E69500",
  error: "#D32F2F",
  info: "#0277BD",
  border: "#D7DDE3",
  borderStrong: "#E64A19",
  divider: "#E2E7EC",
};

// Backwards-compatible default palette
export const C = DARK;

export const F = {
  display: "Rajdhani-Bold",
  displayMed: "Rajdhani-Med",
  text: "PlexSans",
  textBold: "PlexSans-Bold",
};

export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32, "3xl": 48 };
export const R = { sm: 6, md: 12, lg: 20, pill: 999 };

export function stockColor(qty: number, threshold: number, c: Palette = DARK) {
  if (qty <= 0) return c.error;
  if (qty <= threshold) return c.warning;
  return c.success;
}
