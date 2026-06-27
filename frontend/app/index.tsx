import { Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from "@/src/auth";
import { useColors } from "@/src/appsettings";

export default function Index() {
  const { user, loading } = useAuth();
  const C = useColors();
  if (loading)
    return (
      <View style={{ flex: 1, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={C.brand} size="large" />
      </View>
    );
  return <Redirect href={user ? "/(tabs)" : "/(auth)/login"} />;
}
