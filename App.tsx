import { DarkTheme, NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppNavigator, AuthNavigator } from "./src/navigation";
import { DataProvider } from "./src/store/data";
import { PlayerProvider } from "./src/store/player";
import { SessionProvider, useSession } from "./src/store/session";
import { colors } from "./src/theme";

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.line,
    primary: colors.accent,
  },
};

function Root() {
  const { status } = useSession();

  if (status === "loading") {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      {status === "signedIn" ? (
        <DataProvider>
          <PlayerProvider>
            <AppNavigator />
          </PlayerProvider>
        </DataProvider>
      ) : (
        <AuthNavigator />
      )}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SessionProvider>
        <Root />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
