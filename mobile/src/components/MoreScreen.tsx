import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { useAuth } from '../lib/AuthContext'
import { colors, spacing, radius, fontSize } from '../theme'
import { Ionicons } from '@expo/vector-icons'

export default function MoreScreen({ navigation }: { navigation: any }) {
  const { staff, signOut } = useAuth()

  const items = [
    { label: 'Intelligence Hub', icon: 'analytics-outline', route: 'Intelligence' },
    { label: 'Simulate a decision', icon: 'flask-outline', route: 'Simulation' },
    { label: 'Governance & Memory', icon: 'shield-checkmark-outline', route: 'Governance' },
    { label: 'Control & Audit', icon: 'bug-outline', route: 'Control' },
    { label: 'Vendor Portal', icon: 'cube-outline', route: 'VendorPortal' },
    { label: 'Migration Pipeline', icon: 'cloud-upload-outline', route: 'Migration' },
  ]

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <View style={styles.profile}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(staff?.full_name || staff?.name || 'A').charAt(0)}</Text>
        </View>
        <View>
          <Text style={styles.name}>{staff?.full_name || staff?.name || 'Avenize user'}</Text>
          <Text style={styles.business}>{staff?.business_name || 'Your business'}</Text>
          <Text style={styles.role}>{staff?.role || 'staff'}</Text>
        </View>
      </View>

      {items.map((it) => (
        <TouchableOpacity key={it.label} style={styles.row} onPress={() => navigation.navigate(it.route)}>
          <Ionicons name={it.icon as any} size={22} color={colors.primary} />
          <Text style={styles.rowLabel}>{it.label}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={[styles.row, { marginTop: spacing.lg }]} onPress={signOut}>
        <Ionicons name="log-out-outline" size={22} color={colors.danger} />
        <Text style={[styles.rowLabel, { color: colors.danger }]}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surface2 },
  container: { padding: spacing.lg, gap: spacing.sm },
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg, backgroundColor: colors.surface, padding: spacing.lg, borderRadius: radius.md },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  name: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  business: { fontSize: fontSize.sm, color: colors.textSecondary },
  role: { fontSize: fontSize.xs, color: colors.textTertiary, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, padding: spacing.lg, borderRadius: radius.md },
  rowLabel: { flex: 1, fontSize: fontSize.md, color: colors.text },
})
