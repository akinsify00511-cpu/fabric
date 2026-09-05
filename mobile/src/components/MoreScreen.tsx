import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { useAuth } from '../lib/AuthContext'
import { colors, spacing, radius, fontSize } from '../theme'
import { Ionicons } from '@expo/vector-icons'

export default function MoreScreen({ navigation }: { navigation: any }) {
  const { staff, signOut } = useAuth()
  const firstName = (staff?.full_name || staff?.name || 'Avenize').split(' ')[0]

  const items = [
    { label: 'Business snapshot', icon: 'pulse-outline', route: 'Snapshot' },
    { label: 'Priority tasks', icon: 'checkmark-done-outline', route: 'Tasks' },
    { label: 'Talk to Sarah', icon: 'chatbubble-ellipses-outline', route: 'Sarah' },
    { label: 'Capture an update', icon: 'sparkles-outline', route: 'Capture' },
  ]

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <View style={styles.profile}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{firstName.charAt(0).toUpperCase()}</Text></View>
        <View style={styles.profileCopy}>
          <Text style={styles.greeting}>Good to have you here, {firstName}.</Text>
          <Text style={styles.business}>{staff?.business_name || 'Your business'}</Text>
          <Text style={styles.role}>{staff?.role || 'staff'}</Text>
        </View>
      </View>

      {items.map((it) => (
        <TouchableOpacity key={it.label} style={styles.row} onPress={() => navigation.navigate(it.route)} activeOpacity={0.8}>
          <Ionicons name={it.icon as any} size={22} color={colors.primary} />
          <Text style={styles.rowLabel}>{it.label}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </TouchableOpacity>
      ))}

      <View style={styles.footerCard}>
        <Text style={styles.footerTitle}>Avenize mobile</Text>
        <Text style={styles.footerText}>Your business companion for fast decisions, updates and attention — powered by the same business OS as the web app.</Text>
      </View>

      <TouchableOpacity style={[styles.row, styles.signOut]} onPress={signOut}>
        <Ionicons name="log-out-outline" size={22} color={colors.danger} />
        <Text style={[styles.rowLabel, { color: colors.danger }]}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surface2 },
  container: { padding: spacing.lg, gap: spacing.sm },
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md, backgroundColor: colors.surface, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 21, fontWeight: '800' },
  profileCopy: { flex: 1, gap: 2 },
  greeting: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  business: { fontSize: fontSize.sm, color: colors.textSecondary },
  role: { fontSize: fontSize.xs, color: colors.textTertiary, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  rowLabel: { flex: 1, fontSize: fontSize.md, color: colors.text, fontWeight: '600' },
  footerCard: { padding: spacing.lg, gap: spacing.xs, marginTop: spacing.md },
  footerTitle: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
  footerText: { color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 18 },
  signOut: { marginTop: spacing.md },
})
