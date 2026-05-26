import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform, View } from 'react-native';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const TAB_HEIGHT = Platform.OS === 'ios' ? 88 : 64;
  const BOTTOM_PAD = Platform.OS === 'ios' ? 24 : 8;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabIconDefault,
        tabBarShowLabel: false,
        headerShown: false,
        swipeEnabled: false,
        tabBarStyle: {
          backgroundColor: '#161616',
          borderTopWidth: 1,
          borderTopColor: '#222222',
          elevation: 0,
          shadowOpacity: 0,
          height: TAB_HEIGHT,
          paddingBottom: BOTTOM_PAD,
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'settings' : 'settings-outline'} size={26} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="run"
        options={{
          tabBarIcon: ({ color }) => (
            <View style={{
              width: 56, height: 56, borderRadius: 28,
              backgroundColor: color === colors.primary ? colors.primary : '#222',
              alignItems: 'center', justifyContent: 'center',
              marginBottom: Platform.OS === 'ios' ? 16 : 8,
              shadowColor: colors.primary,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.4, shadowRadius: 10, elevation: 8,
            }}>
              <Ionicons name="play" size={24} color={color === colors.primary ? '#0D0D0D' : '#555'} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="achievements"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'trophy' : 'trophy-outline'} size={26} color={color} />
          ),
        }}
      />

      {/* Hidden screens */}
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="track" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
      <Tabs.Screen name="leaderboard" options={{ href: null }} />
    </Tabs>
  );
}
