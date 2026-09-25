import React, { useState, useEffect } from "react";
import { Image, ImageStyle } from "expo-image";
import { StyleProp } from "react-native";
import { getToken, fileUri } from "@/src/api";

// Renders a product image from either a stored Object-Storage path or an http URL.
// Resolves the auth token once and appends it as a query param so it works on web + native.
export function ProductImage({ path, style, contentFit = "cover" }: { path?: string | null; style?: StyleProp<ImageStyle>; contentFit?: "cover" | "contain" }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!path) { setUri(null); return; }
      if (path.startsWith("http")) { setUri(path); return; }
      const tok = await getToken();
      if (mounted) setUri(fileUri(path, tok));
    })();
    return () => { mounted = false; };
  }, [path]);
  if (!uri) return null;
  return <Image source={{ uri }} style={style} contentFit={contentFit} transition={150} />;
}
