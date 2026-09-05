import { useCallback, useEffect, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useAuth } from '../lib/AuthContext'
import { openExceptions, observerSnapshot } from '../lib/businessOS'
import { Card, EmptyState, Loader, SectionTitle, SeverityBadge } from './ui'
import { colors, fontSize, radius, spacing } from '../theme'

export default function TasksScreen() {
  const { staff } = useAuth()
  const [items, setItems] = useState<any[]>([])
  const [openCount, setOpenCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!staff) return
    const [exceptions, snapshot] = await Promise.all([
      openExceptions(staff.business_id),
      observerSnapshot(staff.business_id),
    ])
    setItems(exceptions)
    setOpenCount(Number(snapshot?.operations?.open_tasks ?? exceptions.length))
    setLoading(false)
    setRefreshing(false)
  }, [staff])

  useEffect(() => { load() }, [load])

  if (loading) return <Loader />

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} />}
    >
      <View style={styles.hero}>
        <Text style={styles.kicker}>TODAY</Text>
        <Text style={styles.title}>{openCount} open tasks</Text>
        <Text style={styles.subtitle}>A focused queue of work that needs your attention.</Text>
      </View>

      <SectionTitle>Priority work</SectionTitle>
      {items.length === 0 ? (
        <EmptyState text="You're clear. Nothing is currently flagged for attention." />
      ) : items.map((item) => (
        <Card key={item.id} style={styles.card}>
          <View style={styles.head}>
            <SeverityBadge severity={item.severity} />
            <Text style={styles.domain}>{item.domain || 'Business'}</Text>
          </View>
          <Text style={styles.itemTitle}>{item.title || 'Attention required'}</Text>
          {!!item.detail && <Text style={styles.detail}>{item.detail}</Text>}
          {!!item.suggested_action && <Text style={styles.action}>{item.suggested_action}</Text>}
        </Card>
      ))}

      <TouchableOpacity style={styles.captureButton} onPress={() => { /* Capture tab is the write path. */ }}>
        <Text style={styles.captureText}>Use Avenize Capture to create work</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surface2 },
  container: { padding: spacing.lg, gap: spacing.sm },
  hero: { paddingVertical: spacing.md, gap: spacing.xs },
  kicker: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '700', letterSpacing: 1.2 },
  title: { fontSize: 30, lineHeight: 36, color: colors.text, fontWeight: '700' },
  subtitle: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  card: { gap: spacing.xs },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  domain: { color: colors.textTertiary, fontSize: fontSize.xs, textTransform: 'uppercase', fontWeight: '600' },
  itemTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  detail: { color: colors.textSecondary, fontSize: fontSize.sm, lineHeight: 19 },
  action: { color: colors.primary, fontSize: fontSize.sm, marginTop: spacing.xs },
  captureButton: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  captureText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' },
})
