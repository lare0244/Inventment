export const C = {
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

export const F = {
  display: "Rajdhani-Bold",
  displayMed: "Rajdhani-Med",
  text: "PlexSans",
  textBold: "PlexSans-Bold",
};

export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32, "3xl": 48 };
export const R = { sm: 6, md: 12, lg: 20, pill: 999 };

export function stockColor(qty: number, threshold: number) {
  if (qty <= 0) return C.error;
  if (qty <= threshold) return C.warning;
  return C.success;
}
