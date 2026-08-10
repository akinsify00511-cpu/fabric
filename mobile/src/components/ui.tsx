import { View, Text, StyleSheet, ActivityIndicator, type ViewStyle } from 'react-native'
import { colors, radius, spacing, fontSize, shadows } from '../theme'

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>
}

export function Loader() {
  return (
    <View style={styles.loaderWrap}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  )
}

export function EmptyState({ text }: { text: string }) {
  return (
    <Card style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </Card>
  )
}

export function FreshnessDot({ tier }: { tier: string }) {
  const c =
    tier === 'fresh' ? colors.success :
    tier === 'today' ? colors.success :
    tier === 'stale' ? colors.warning : colors.danger
  return <View style={[styles.dot, { backgroundColor: c }]} />
}

export function SeverityBadge({ severity }: { severity: string }) {
  const c = severity === 'critical' ? colors.danger : severity === 'warning' ? colors.warning : colors.info
  return (
    <View style={[styles.badge, { backgroundColor: c + '20' }]}>
      <Text style={[styles.badgeText, { color: c }]}>{severity}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    ...shadows.elevation1,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  loaderWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xxl },
  empty: { alignItems: 'center', padding: spacing.xl },
  emptyText: { color: colors.textTertiary, fontSize: fontSize.sm, textAlign: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  badgeText: { fontSize: fontSize.xs, fontWeight: '700', textTransform: 'uppercase' },
})
