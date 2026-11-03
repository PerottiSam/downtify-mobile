import { Ionicons } from '@expo/vector-icons';
import { BottomTabBar, BottomTabBarProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { View } from 'react-native';
import { MiniPlayer } from '../components/MiniPlayer';
import { IconName } from '../components/ui';
import ConnectScreen from '../screens/ConnectScreen';
import DownloadsScreen from '../screens/DownloadsScreen';
import LibraryScreen from '../screens/LibraryScreen';
import MoreScreen from '../screens/MoreScreen';
import PlayerScreen from '../screens/PlayerScreen';
import PlaylistsScreen from '../screens/PlaylistsScreen';
import SearchScreen from '../screens/SearchScreen';
import SignInScreen from '../screens/SignInScreen';
import TrackListScreen from '../screens/TrackListScreen';
import { useData } from '../store/data';
import { colors } from '../theme';
import { AuthParams, RootParams } from './types';

const Auth = createNativeStackNavigator<AuthParams>();
const Root = createNativeStackNavigator<RootParams>();
const Tab = createBottomTabNavigator();

export function AuthNavigator() {
  return (
    <Auth.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Auth.Screen name="Connect" component={ConnectScreen} />
      <Auth.Screen name="SignIn" component={SignInScreen} />
    </Auth.Navigator>
  );
}

const ICONS: Record<string, [IconName, IconName]> = {
  Library: ['library', 'library-outline'],
  Search: ['search', 'search-outline'],
  Playlists: ['albums', 'albums-outline'],
  Downloads: ['cloud-download', 'cloud-download-outline'],
  More: ['ellipsis-horizontal-circle', 'ellipsis-horizontal-circle-outline'],
};

// Il mini-player vive sopra la tab bar, quindi resta visibile in tutte le schede
function TabBar(props: BottomTabBarProps) {
  return (
    <View style={{ backgroundColor: colors.bg }}>
      <MiniPlayer />
      <BottomTabBar {...props} />
    </View>
  );
}

function Tabs() {
  const { activeDownloads } = useData();
  return (
    <Tab.Navigator
      tabBar={(p) => <TabBar {...p} />}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.line },
        tabBarBadgeStyle: { backgroundColor: colors.accent, color: colors.onAccent },
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons name={ICONS[route.name][focused ? 0 : 1]} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Library" component={LibraryScreen} options={{ title: 'Libreria' }} />
      <Tab.Screen name="Search" component={SearchScreen} options={{ title: 'Cerca' }} />
      <Tab.Screen name="Playlists" component={PlaylistsScreen} options={{ title: 'Playlist' }} />
      <Tab.Screen
        name="Downloads"
        component={DownloadsScreen}
        options={{ title: 'Download', tabBarBadge: activeDownloads > 0 ? activeDownloads : undefined }}
      />
      <Tab.Screen name="More" component={MoreScreen} options={{ title: 'Altro' }} />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  return (
    <Root.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Root.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Root.Screen name="TrackList" component={TrackListScreen} options={{ title: '', headerBackButtonDisplayMode: 'minimal' }} />
      <Root.Screen name="Player" component={PlayerScreen} options={{ presentation: 'modal', headerShown: false }} />
    </Root.Navigator>
  );
}
