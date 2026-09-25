import { useWindowDimensions } from "react-native";

// Desktop web layout kicks in at >= 900px wide. Phones/tablets keep the
// existing mobile layout.
export const DESKTOP_BREAKPOINT = 900;

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  return { width, height, isDesktop: width >= DESKTOP_BREAKPOINT };
}
