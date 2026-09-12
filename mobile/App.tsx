import { StatusBar } from 'expo-status-bar'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { ActivityIndicator, Text, View } from 'react-native'

import { AuthProvider, useAuth } from './src/lib/AuthContext'
import { colors, fontSize, spacing } from './src/theme'
import { isConfigured } from './src/lib/supabase'

import LoginScreen from './src/components/LoginScreen'
import CaptureScreen from './src/components/CaptureScreen'
import ObserverScreen from './src/components/ObserverScreen'
import TasksScreen from './src/components/TasksScreen'
import SarahScreen from './src/components/SarahScreen'
import MoreScreen from './src/components/MoreScreen'

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.danger,
  },
}

function MainTabs() {
  return (
    <Tab.Navigator
      sceneStyle={{ backgroundColor: colors.background }}
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700', fontSize: fontSize.lg },
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 72,
          paddingBottom: 10,
          paddingTop: 8,
          elevation: 8,
          shadowColor: '#0F172A',
          shadowOpacity: 0.08,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: -2 },
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen name="Capture" component={CaptureScreen} options={{ tabBarIcon: ({ color, size }) => <Ionicons name="sparkles" color={color} size={size} /> }} />
      <Tab.Screen name="Snapshot" component={ObserverScreen} options={{ tabBarIcon: ({ color, size }) => <Ionicons name="pulse" color={color} size={size} /> }} />
      <Tab.Screen name="Tasks" component={TasksScreen} options={{ tabBarIcon: ({ color, size }) => <Ionicons name="checkmark-done" color={color} size={size} /> }} />
      <Tab.Screen name="Sarah" component={SarahScreen} options={{ tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-ellipses" color={color} size={size} /> }} />
      <Tab.Screen name="More" component={MoreScreen} options={{ tabBarIcon: ({ color, size }) => <Ionicons name="apps" color={color} size={size} /> }} />
    </Tab.Navigator>
  )
}

function RootNavigator() {
  const { session, loading } = useAuth()

  if (loading) {
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}><ActivityIndicator size="large" color={colors.primary} /></View>
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      {session ? <Stack.Screen name="Main" component={MainTabs} /> : <Stack.Screen name="Login" component={LoginScreen} />}
    </Stack.Navigator>
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer theme={navigationTheme}>
          {!isConfigured && (
            <View style={{ backgroundColor: colors.warningSoft, padding: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.warning }}>
              <Text style={{ color: colors.warning, fontSize: fontSize.xs, textAlign: 'center', fontWeight: '600' }}>Avenize is waiting for its secure environment configuration.</Text>
            </View>
          )}
          <StatusBar style="dark" backgroundColor={colors.surface} />
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  )
}
